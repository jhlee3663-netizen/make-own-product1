// npm run build first; PLAYWRIGHT_PATH can point at an existing Playwright (or playwright-core) install.
// Guards the note editor behaviours that UI refactors must not break:
// rich text round-trip, selection popup, bullet exit, native-drag suppression,
// no press-shrink while editing, and autosave (debounced + flush on switch).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { runtime, alice, source } = require('./runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const until = async (fn, label, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return; } catch (_) {}
    if (Date.now() > end) throw new Error(`Timed out: ${label}`);
    await new Promise(r => setTimeout(r, 50));
  }
};

(async () => {
  const r = await runtime();
  const s = r.store;
  s.commit({ ...source('e1'), title: 'Editor note', content: '요일탭 구성을 추가한다' }, alice, 'create');
  s.commit({ ...source('e2'), number: 2, title: 'Legacy markup', content: '**굵은 제목**\n__밑줄 문장__\n*기울임*\n• 첫 항목' }, alice, 'create');
  await r.send({ type: 'INIT' });
  r.client.set('ui:whats-new-v7', '1'); // covered by browser.cjs

  const html = fs.readFileSync(path.join(__dirname, '../dist/ui.html'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 960 } });
  page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const post = r.figma.ui.postMessage;
  r.figma.ui.postMessage = m => { post(m); page.evaluate(m => window.postMessage({ pluginMessage: m, fromMock: true }, '*'), m).catch(() => {}); };
  await page.exposeFunction('__pluginSend', async m => { await r.send(m); });
  await page.addInitScript(() => {
    window.addEventListener('message', e => { if (e.data.pluginMessage && !e.data.fromMock) window.__pluginSend(e.data.pluginMessage); });
  });

  const card = title => page.locator('.p-card', { hasText: title });
  const editorOf = title => card(title).locator('[contenteditable="true"]');
  const html$ = title => editorOf(title).evaluate(el => el.innerHTML);
  const toggle = async title => { await card(title).getByText(title, { exact: true }).click(); await page.waitForTimeout(250); };
  const selectAll = title => editorOf(title).evaluate(el => {
    el.focus(); const range = document.createRange(); range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  });
  const caretToEnd = title => editorOf(title).evaluate(el => {
    el.focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  });
  const dragSelect = async title => {
    const b = await editorOf(title).boundingBox();
    await page.mouse.click(b.x + b.width - 20, b.y + b.height - 12); // collapse any old selection
    await page.mouse.move(b.x + 16, b.y + 18); await page.mouse.down();
    await page.mouse.move(b.x + 110, b.y + 18, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const popupButton = label => page.locator('body > div[role="toolbar"]').getByRole('button', { name: label });

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('Page', { exact: true }).first().click();

    // Collapsed cards still reorder by dragging the title area (numbers follow the order).
    const before = [s.get('e1').number, s.get('e2').number];
    await card('Legacy markup').getByText('Legacy markup', { exact: true }).dragTo(card('Editor note').getByText('Editor note', { exact: true }));
    await until(() => s.get('e1').number !== before[0], 'drag reorder renumbers pins');
    assert.deepEqual([s.get('e1').number, s.get('e2').number], [before[1], before[0]]);

    // Legacy stored markers render as real formatting, never as raw markers.
    await toggle('Legacy markup');
    const legacy = await html$('Legacy markup');
    assert.match(legacy, /<b>굵은 제목<\/b>/); assert.match(legacy, /<u>밑줄 문장<\/u>/);
    assert.match(legacy, /<i>기울임<\/i>/); assert.match(legacy, /<li>첫 항목<\/li>/);
    assert.doesNotMatch(await editorOf('Legacy markup').innerText(), /\*\*|__/);
    await toggle('Legacy markup');

    await toggle('Editor note');

    // Toolbar: one click applies real bold; stored as **…**.
    await selectAll('Editor note');
    await card('Editor note').getByRole('toolbar').getByRole('button', { name: '굵게' }).click();
    assert.match(await html$('Editor note'), /<b>/);
    await until(() => /\*\*[^*]+\*\*/.test(s.get('e1').content), 'bold autosaved in ** format');

    // Selection popup appears under a drag and its buttons work (italic, underline).
    await dragSelect('Editor note');
    assert.equal(await page.locator('body > div[role="toolbar"]').count(), 1);
    await popupButton('기울임').click();
    assert.match(await html$('Editor note'), /<i>/);
    await dragSelect('Editor note');
    await popupButton('밑줄').click();
    assert.match(await html$('Editor note'), /<u>/);

    // Native text drag is suppressed inside the editor and the expanded form.
    const prevented = await editorOf('Editor note').evaluate(el => {
      const results = [];
      for (let n = el; n && !n.classList.contains('p-card'); n = n.parentElement) {
        const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
        n.dispatchEvent(ev); results.push(ev.defaultPrevented);
      }
      return results;
    });
    assert.ok(prevented.length > 1 && prevented.every(Boolean), `dragstart prevented: ${prevented}`);

    // Pressing inside the editor must not trigger the card press-shrink.
    const b = await editorOf('Editor note').boundingBox();
    await page.mouse.move(b.x + 30, b.y + 14); await page.mouse.down(); await page.waitForTimeout(120);
    const transform = await card('Editor note').evaluate(el => getComputedStyle(el).transform);
    await page.mouse.up();
    assert.ok(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)', `card transform while editing: ${transform}`);

    // Bullet exit: Enter on an empty item and Backspace on an empty item both remove the dot.
    await editorOf('Editor note').evaluate(el => { el.innerHTML = '<div>항목</div>'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await selectAll('Editor note');
    await card('Editor note').getByRole('toolbar').getByRole('button', { name: '불릿 목록' }).click();
    assert.match(await html$('Editor note'), /<li>/);
    await caretToEnd('Editor note');
    await page.keyboard.press('Enter');
    assert.equal(((await html$('Editor note')).match(/<li>/g) || []).length, 2);
    await page.keyboard.press('Enter');
    assert.doesNotMatch(await html$('Editor note'), /<li>(<br>)?<\/li>/);
    await editorOf('Editor note').evaluate(el => {
      el.innerHTML = '<ul><li>남는 항목</li><li><br></li></ul>'; el.focus();
      const li = el.querySelectorAll('li')[1]; const range = document.createRange(); range.selectNodeContents(li); range.collapse(true);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    await page.keyboard.press('Backspace');
    assert.doesNotMatch(await html$('Editor note'), /<li>(<br>)?<\/li>/);
    assert.match(await html$('Editor note'), /<li>남는 항목<\/li>/);

    // Autosave: debounced while typing, then flushed immediately when switching pins.
    await caretToEnd('Editor note');
    await page.keyboard.type(' 자동저장');
    await until(() => s.get('e1').content.includes('자동저장'), 'debounced autosave', 4000);
    assert.equal(await editorOf('Editor note').count(), 1, 'autosave keeps the card open');
    await caretToEnd('Editor note');
    await page.keyboard.type(' 바로 전환');
    await toggle('Legacy markup'); // opening another pin collapses this one
    await until(() => s.get('e1').content.includes('바로 전환'), 'flush on switch', 1500);

    assert.deepEqual(errors, []);
    console.log('Editor checks passed: title drag reorders pins, legacy markers render, toolbar bold, popup italic/underline, dragstart suppressed, no press-shrink, bullet exit (Enter/Backspace), debounced autosave, flush on switch.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
