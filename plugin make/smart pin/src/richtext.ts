// Bridges the stored note format and the contentEditable DOM.
//
// Notes stay on disk as `**bold**` / `__underline__` / `*italic*` / `• item`,
// because saved pins, the search index, and the web viewer all read those
// strings. The editor works on real <b>/<u>/<i>/<li> nodes, so every edit
// crosses this boundary twice.

const BULLET_LINE = /^\s*(?:•|-)\s+(.*)$/;
const BLOCK_TAGS = ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineToHtml(line: string): string {
  // Bold consumes `**pairs**` first so the italic pass, which runs on what's
  // left, only ever sees genuine single-star markers.
  return escapeHtml(line)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>');
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (BULLET_LINE.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = BULLET_LINE.exec(lines[i]);
        if (!match) break;
        items.push(`<li>${inlineToHtml(match[1]) || '<br>'}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
    } else {
      out.push(`<div>${inlineToHtml(lines[i]) || '<br>'}</div>`);
      i++;
    }
  }
  return out.join('');
}

function wrapInline(text: string, bold: boolean, underline: boolean, italic: boolean): string {
  if (!bold && !underline && !italic) return text;
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text.slice(lead.length))![0];
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  let out = core;
  if (italic) out = `*${out}*`;
  if (bold) out = `**${out}**`;
  if (underline) out = `__${out}__`;
  return lead + out + trail;
}

function isBoldElement(el: HTMLElement): boolean {
  if (el.tagName === 'B' || el.tagName === 'STRONG') return true;
  const weight = el.style && el.style.fontWeight;
  if (!weight) return false;
  if (weight === 'bold' || weight === 'bolder') return true;
  const numeric = parseInt(weight, 10);
  return !isNaN(numeric) && numeric >= 600;
}

function isUnderlineElement(el: HTMLElement): boolean {
  if (el.tagName === 'U' || el.tagName === 'INS') return true;
  if (!el.style) return false;
  const decoration = `${el.style.textDecoration || ''} ${el.style.textDecorationLine || ''}`;
  return decoration.indexOf('underline') !== -1;
}

function isItalicElement(el: HTMLElement): boolean {
  if (el.tagName === 'I' || el.tagName === 'EM') return true;
  return !!el.style && el.style.fontStyle === 'italic';
}

export function htmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = [];
  let buffer = '';
  let bullet = false;
  let started = false;

  const flush = () => {
    lines.push(bullet ? `• ${buffer}` : buffer);
    buffer = '';
    bullet = false;
    started = false;
  };

  const walk = (node: Node, bold: boolean, underline: boolean, italic: boolean) => {
    const children = Array.prototype.slice.call(node.childNodes) as Node[];
    children.forEach((child, index) => {
      if (child.nodeType === 3) {
        const text = (child.nodeValue || '').replace(/ /g, ' ');
        if (!text) return;
        buffer += wrapInline(text, bold, underline, italic);
        started = true;
        return;
      }
      if (child.nodeType !== 1) return;

      const el = child as HTMLElement;
      const tag = el.tagName;

      if (tag === 'BR') {
        // Browsers park a trailing <br> at the end of a block as a caret slot;
        // treating it as a line break would add a phantom empty line.
        if (index === children.length - 1) return;
        flush();
        return;
      }
      if (tag === 'UL' || tag === 'OL') {
        if (started) flush();
        walk(el, bold, underline, italic);
        return;
      }
      if (tag === 'LI') {
        if (started) flush();
        bullet = true;
        walk(el, bold, underline, italic);
        flush();
        return;
      }
      if (BLOCK_TAGS.indexOf(tag) !== -1) {
        if (started) flush();
        walk(el, bold, underline, italic);
        flush();
        return;
      }
      walk(el, bold || isBoldElement(el), underline || isUnderlineElement(el), italic || isItalicElement(el));
    });
  };

  walk(root, false, false, false);
  if (started || buffer) flush();

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}
