// One-time walkthrough of what changed in v7. The illustrations are shrunken
// copies of the real UI (card, ··· menu, undo toast…) so each slide points at
// something the person will actually see next.
import React, { useEffect, useRef, useState } from 'react';
import { colors, radius, spacing, text, semantic, shadow, z, motion, GUTTER } from './tds';
import { Badge, Button, Icon } from './tds-ui';
import { Lang, t } from './i18n';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div aria-hidden="true" style={{ width: 260, maxWidth: '100%', height: 176, borderRadius: radius.xxl, background: semantic.bgSubtle,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: spacing[2], padding: spacing[4], boxSizing: 'border-box', position: 'relative' }}>
    {children}
  </div>
);
const Line = ({ w, c = colors.grey200 }: { w: number | string; c?: string }) => <span style={{ display: 'block', width: w, height: 7, borderRadius: radius.full, background: c }} />;
const MiniCard = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <div style={{ background: colors.background, borderRadius: radius.lg, padding: spacing[3], display: 'flex', gap: spacing[2], alignItems: 'flex-start', opacity: dim ? 0.45 : 1 }}>{children}</div>
);
const Num = ({ n, c = colors.blue500 }: { n: number; c?: string }) => (
  <span style={{ ...text('st13', 'bold', colors.background), width: 20, height: 20, borderRadius: radius.full, background: c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
);

function Illustration({ kind, lang }: { kind: 'author' | 'comment' | 'trash' | 'menu' | 'admin'; lang: Lang }) {
  switch (kind) {
    case 'author': return (
      <Stage>
        <MiniCard>
          <Num n={1} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Line w="70%" c={colors.grey300} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Badge color="blue" size="xsmall">{t(lang, 'filterMine')}</Badge>
              <span style={{ color: semantic.textTertiary, display: 'flex' }}><Icon name="lock" size={12} /></span>
            </div>
          </div>
        </MiniCard>
        <MiniCard dim>
          <Num n={2} c={colors.green500} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Line w="55%" c={colors.grey300} />
            <span style={text('st13', 'medium', semantic.textTertiary)}>{t(lang, 'roleViewer', 'Bob')}</span>
          </div>
        </MiniCard>
      </Stage>
    );
    case 'comment': return (
      <Stage>
        {([[t(lang, 'wnKindComment'), 'grey', '72%'], [t(lang, 'wnKindEdit'), 'blue', '58%'], [t(lang, 'wnKindDelete'), 'red', '64%']] as const).map(([label, color, w]) => (
          <MiniCard key={label}>
            <Badge color={color} size="xsmall">{label}</Badge>
            <div style={{ flex: 1, paddingTop: 4 }}><Line w={w} /></div>
          </MiniCard>
        ))}
      </Stage>
    );
    case 'trash': return (
      <Stage>
        <MiniCard dim><Num n={3} c={colors.grey400} /><div style={{ flex: 1, paddingTop: 6 }}><Line w="60%" /></div></MiniCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3], background: colors.grey800, borderRadius: radius.lg, padding: `${spacing[2] + 2}px ${spacing[3]}px` }}>
          <span style={{ ...text('st12', 'medium', colors.background), flex: 1 }}>{t(lang, 'wnTrashed')}</span>
          <span style={text('st12', 'bold', colors.blue300)}>{t(lang, 'toastUndo')}</span>
        </div>
      </Stage>
    );
    case 'menu': return (
      <Stage>
        <MiniCard>
          <Num n={4} c={colors.orange500} />
          <div style={{ flex: 1, paddingTop: 6 }}><Line w="62%" c={colors.grey300} /></div>
          <span style={{ color: colors.grey700, background: colors.grey100, borderRadius: radius.md, width: 24, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="more" size={16} /></span>
        </MiniCard>
        <div style={{ alignSelf: 'flex-end', width: 150, background: colors.background, borderRadius: radius.lg, padding: `${spacing[1]}px 0`, boxShadow: shadow.floating }}>
          {([['link', t(lang, 'menuCopyLink'), semantic.textPrimary], ['people', t(lang, 'menuManage'), semantic.textPrimary], ['trash', t(lang, 'deleteBtn'), colors.red500]] as const).map(([icon, label, c]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', color: c }}>
              <Icon name={icon} size={12} /><span style={text('st13', 'medium', c)}>{label}</span>
            </div>
          ))}
        </div>
      </Stage>
    );
    case 'admin': return (
      <Stage>
        <MiniCard>
          <span style={{ width: 28, height: 28, borderRadius: radius.md, background: colors.blue50, color: colors.blue500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="shield" size={16} /></span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={text('st12', 'semibold', semantic.textPrimary)}>{t(lang, 'wnAdminRow')}</span>
            <span style={text('st13', 'regular', semantic.textTertiary)}>{t(lang, 'wnAdminEmpty')}</span>
          </div>
          <span style={{ color: colors.grey400, display: 'flex', alignSelf: 'center' }}><Icon name="chevronRight" size={14} /></span>
        </MiniCard>
        <div style={{ ...text('st12', 'semibold', colors.blue600), alignSelf: 'center', background: colors.blue50, borderRadius: radius.md, padding: '6px 12px' }}>{t(lang, 'wnAdminCta')}</div>
      </Stage>
    );
  }
}

export function WhatsNew({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const slides = [
    { kind: 'author' as const, title: t(lang, 'wn1Title'), desc: t(lang, 'wn1Desc') },
    { kind: 'comment' as const, title: t(lang, 'wn2Title'), desc: t(lang, 'wn2Desc') },
    { kind: 'trash' as const, title: t(lang, 'wn3Title'), desc: t(lang, 'wn3Desc') },
    { kind: 'menu' as const, title: t(lang, 'wn4Title'), desc: t(lang, 'wn4Desc') },
    { kind: 'admin' as const, title: t(lang, 'wn5Title'), desc: t(lang, 'wn5Desc') },
  ];
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const last = i === slides.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  const slide = slides[i];
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="wn-title" tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape') onDone();
        if (e.key === 'ArrowRight' && !last) setI(i + 1);
        if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
      }}
      style={{ position: 'fixed', inset: 0, zIndex: z.sheet + 2, background: colors.background, display: 'flex', flexDirection: 'column', outline: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: `${spacing[4]}px ${GUTTER}px 0`, flexShrink: 0, minHeight: 32 }}>
        {!last && <Button size="small" color="light" variant="weak" style={{ background: 'transparent' }} onClick={onDone}>{t(lang, 'wnSkip')}</Button>}
      </div>
      <div key={i} className="tds-page-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: `0 ${spacing[6]}px`, textAlign: 'center', minHeight: 0 }}>
        <Illustration kind={slide.kind} lang={lang} />
        <p style={{ ...text('st12', 'semibold', colors.blue500), margin: `${spacing[6]}px 0 ${spacing[1]}px` }}>{t(lang, 'wnBadge')} · {i + 1}/{slides.length}</p>
        <h2 id="wn-title" style={{ ...text('t4', 'bold', semantic.textPrimary), margin: `0 0 ${spacing[2]}px`, letterSpacing: '-0.02em' }}>{slide.title}</h2>
        <p style={{ ...text('t7', 'regular', semantic.textSecondary), margin: 0, whiteSpace: 'pre-line', maxWidth: 360 }}>{slide.desc}</p>
      </div>
      <div role="tablist" aria-label={t(lang, 'wnBadge')} style={{ display: 'flex', justifyContent: 'center', gap: spacing[2] - 2, padding: `${spacing[4]}px 0`, flexShrink: 0 }}>
        {slides.map((_, k) => (
          <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`${k + 1} / ${slides.length}`} onClick={() => setI(k)}
            style={{ width: k === i ? 20 : 6, height: 6, borderRadius: radius.full, border: 'none', padding: 0, cursor: 'pointer',
              background: k === i ? colors.blue500 : colors.grey200, transition: `all .3s ${motion}` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: spacing[2], padding: `0 ${GUTTER}px ${spacing[7]}px`, flexShrink: 0, maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {i > 0 && <Button color="light" variant="weak" size="large" onClick={() => setI(i - 1)}>{t(lang, 'onboardPrev')}</Button>}
        <Button size="large" display="full" style={{ flex: 1 }} onClick={next}>{last ? t(lang, 'wnDone') : t(lang, 'wnNext')}</Button>
      </div>
    </div>
  );
}
