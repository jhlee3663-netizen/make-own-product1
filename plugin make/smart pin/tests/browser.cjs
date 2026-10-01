// npm run build first; PLAYWRIGHT_PATH can point at an existing Playwright (or playwright-core) install.
// Drives the built React UI against the real code.ts through the mock Figma runtime.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { runtime, alice, bob, source } = require('./runtime.cjs');
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
  s.commit({ ...source('p1'), title: 'My protected note', content: 'Keep this original text', protected: true,
    requests: [{ id: 'c1', kind: 'comment', text: 'Looks good to me', actor: bob, at: Date.now() - 60000 }] }, alice, 'create');
  s.commit({ ...source('p2'), author: bob, number: 2, title: 'Bob note', content: 'Only Bob can edit this' }, bob, 'create');
  s.commit({ ...source('p3'), author: bob, editors: [alice], number: 3, title: 'Shared note', content: 'Alice co-edits this' }, bob, 'create');
  s.commit({ ...source('p4'), author: bob, assignee: alice, number: 4, title: 'Assigned note', content: 'Alice can change status only' }, bob, 'create');
  s.commit({ ...source('p5'), author: undefined, number: 5, title: 'Legacy note', content: 'Nobody knows who wrote this' }, { id: 'system', name: 'system' }, 'create');
  s.commit({ ...source('p6'), number: 6, title: 'Trashed note', content: 'Old text', deletedAt: Date.now() - 1000, deletedBy: alice, deleteReason: '작성자 삭제' }, alice, 'create');
  await r.send({ type: 'INIT' });

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
  const out = path.join(__dirname, '../evidence'); fs.mkdirSync(out, { recursive: true });
  const shot = async name => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(out, name) }); };
  const panel = page.locator('[aria-labelledby="sp-panel-title"]');
  const card = title => page.locator('.p-card', { hasText: title });
  const openCard = async title => { await card(title).getByText(title, { exact: true }).click(); await page.waitForTimeout(250); };
  const cardMenu = async (title, item) => { await card(title).getByRole('button', { name: '핀 메뉴' }).click(); await page.getByRole('menuitem', { name: item }).click(); };
  const sheet = name => page.getByRole('dialog', { name });
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);

    // ── What's new: shown once on first run, never again for this user ─────
    const wn = page.getByRole('dialog', { name: '핀마다 작성자가 기록돼요' });
    await wn.waitFor();
    await shot('whats-new-720.png');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByRole('heading', { name: '관리자를 한 명 정해주세요' }).waitFor();
    await page.getByRole('button', { name: '시작하기', exact: true }).click();
    await until(() => r.client.get('ui:whats-new-v7') === '1', "what's-new stored per user");
    await page.reload();
    await page.getByText('Page', { exact: true }).first().waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.getByText('새로워진 Smart Pin', { exact: false }).count(), 0, "what's-new must not reappear");

    await page.getByText('Page', { exact: true }).first().click();
    await shot('list-720.png');

    // ── Other user's pin: read view, no edit/delete, comment instead ────────
    await openCard('Bob note');
    await page.getByText('Bob님의 핀 · 읽기 전용', { exact: true }).waitFor();
    assert.equal(await card('Bob note').locator('[contenteditable="true"]').count(), 0);
    await shot('foreign-readonly-720.png');
    await card('Bob note').getByRole('button', { name: '핀 메뉴' }).click();
    assert.equal(await page.getByRole('menuitem', { name: '휴지통으로 이동' }).count(), 0);
    await page.getByRole('menuitem', { name: /의견 · 권한 · 이력/ }).click();
    // Opening from a card lands on that pin directly — no pin picker.
    await panel.getByRole('heading', { name: 'Bob note' }).waitFor();
    assert.equal(await panel.locator('select').count(), 0);
    assert.equal(await panel.getByText('핀 선택').count(), 0);
    await shot('pin-manage-720.png');
    await panel.getByRole('button', { name: /의견 및 요청/ }).click();
    await panel.getByRole('button', { name: '의견 · 요청 남기기' }).click();
    await sheet('의견 · 요청 남기기').getByLabel('의견 또는 요청 내용').fill('Please review this note');
    await sheet('의견 · 요청 남기기').getByRole('button', { name: '등록', exact: true }).click();
    await panel.getByText('Please review this note').waitFor();
    assert.equal(s.get('p2').requests.length, 1);
    assert.equal(s.get('p2').content, 'Only Bob can edit this');
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();
    await panel.getByRole('button', { name: '관리 닫기' }).click();

    // Deletion of someone else's pin is a request, not an action.
    await cardMenu('Bob note', /삭제 요청하기/);
    await sheet('의견 · 요청 남기기').getByLabel('의견 또는 요청 내용').fill('Duplicate of #1');
    await sheet('의견 · 요청 남기기').getByRole('button', { name: '등록', exact: true }).click();
    await until(() => s.get('p2').requests.some(q => q.kind === 'delete'), 'delete request stored');
    await panel.getByRole('button', { name: '관리 닫기' }).click();
    assert.equal(s.get('p2').deletedAt, undefined);

    // ── Owner: edit form with BottomCTA, status control, trash + undo ───────
    await openCard('My protected note');
    assert.equal(await card('My protected note').locator('[contenteditable="true"]').count(), 1);
    assert.equal(await page.getByRole('button', { name: '저장하기' }).count(), 1);
    await shot('owner-edit-720.png');
    await card('My protected note').getByRole('radio', { name: '보류' }).click();
    await until(() => s.get('p1').status === 'pending', 'owner status change');
    await card('My protected note').locator('[contenteditable="true"]').fill('Unsaved latest draft before delete');
    await cardMenu('My protected note', /휴지통으로 이동/);
    await until(() => s.get('p1').deletedAt, 'moved to trash');
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await until(() => !s.get('p1').deletedAt, 'undo restored');
    assert.equal(s.get('p1').content, 'Unsaved latest draft before delete');

    // ── Co-editor: can edit, autosave persists ──────────────────────────────
    await openCard('Shared note');
    await page.getByText('공동 편집자 · 원문을 수정할 수 있어요', { exact: true }).waitFor();
    const editor = card('Shared note').locator('[contenteditable="true"]');
    await editor.click(); await page.keyboard.press('End'); await page.keyboard.type(' and more');
    await until(() => s.get('p3').content.endsWith('and more'), 'co-editor autosave', 4000);
    await cardMenu('Shared note', /의견 · 권한 · 이력/);
    assert.equal(await panel.getByRole('button', { name: /소유권 이전/ }).count(), 0);
    await panel.getByRole('button', { name: '관리 닫기' }).click();

    // ── Assignee: read view with status control only ────────────────────────
    await openCard('Assigned note');
    await page.getByText('담당자 · 상태만 바꿀 수 있어요', { exact: true }).waitFor();
    assert.equal(await card('Assigned note').locator('[contenteditable="true"]').count(), 0);
    await card('Assigned note').getByRole('radio', { name: '완료' }).click();
    await until(() => s.get('p4').status === 'done', 'assignee status change');
    assert.equal(s.get('p4').content, 'Alice can change status only');

    // ── Unknown author: explained, with an authorship request entry point ──
    await openCard('Legacy note');
    await page.getByText('작성자 미상 · 읽기 전용', { exact: true }).waitFor();
    await card('Legacy note').getByRole('button', { name: '작성자 등록 요청' }).click();
    await sheet('의견 · 요청 남기기').getByLabel('의견 또는 요청 내용').fill('I wrote this in the kickoff');
    await sheet('의견 · 요청 남기기').getByRole('button', { name: '등록', exact: true }).click();
    await until(() => s.get('p5').requests?.some(q => q.kind === 'claim'), 'claim stored');
    await panel.getByRole('button', { name: '관리 닫기' }).click();
    assert.equal(s.get('p5').author, undefined);

    // ── Inbox: comments on my pins, one-tap acknowledge, live arrival ──────
    assert.equal(await card('My protected note').getByText('의견 1').count(), 1, 'card shows unread comment count');
    await page.getByRole('button', { name: /^관리/ }).first().click();
    await panel.getByRole('button', { name: /받은 의견함/ }).click();
    await panel.getByText('Looks good to me').waitFor();
    await shot('inbox-720.png');
    await panel.getByRole('button', { name: '확인', exact: true }).click();
    await until(() => s.get('p1').requests.find(q => q.id === 'c1').resolvedAt, 'comment acknowledged without a reason prompt');
    assert.equal(await page.getByRole('dialog', { name: /처리/ }).count(), 0);
    await panel.getByText('받은 의견이 없어요').waitFor();
    await panel.getByRole('button', { name: '관리 닫기' }).click();
    const p1 = s.get('p1');
    s.commit({ ...p1, requests: [...p1.requests, { id: 'c2', kind: 'comment', text: 'One more thought', actor: bob, at: Date.now() }] }, bob, '의견 / 요청 등록', p1.revision);
    await r.poll();
    await page.getByText('새 의견이 도착했어요').waitFor();
    await page.getByRole('button', { name: '보기', exact: true }).click();
    await panel.getByRole('heading', { name: '받은 의견함' }).waitFor();
    await panel.getByText('One more thought').waitFor();
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();

    // ── Management hub: ListRow entries, first admin, claim approval ────────
    await panel.getByRole('heading', { name: '관리' }).waitFor();
    for (const row of ['받은 의견함', '휴지통', '팀 권한 및 관리자', '백업 및 복원']) {
      assert.equal(await panel.getByRole('button', { name: new RegExp(row) }).count(), 1, row);
    }
    await shot('hub-720.png');
    await panel.getByRole('button', { name: /팀 권한 및 관리자/ }).click();
    await panel.getByRole('button', { name: '나를 첫 관리자로 등록' }).click();
    await sheet('나를 첫 관리자로 등록할까요?').getByLabel('변경 사유').fill('Team-approved administrator');
    await sheet('나를 첫 관리자로 등록할까요?').getByRole('button', { name: '관리자로 등록' }).click();
    await until(() => s.admins[0]?.id === 'alice', 'admin registered');
    await panel.getByRole('button', { name: '나를 첫 관리자로 등록' }).waitFor({ state: 'detached' });
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();
    await panel.getByRole('button', { name: /받은 의견함/ }).click();
    await panel.getByRole('button', { name: '#5 Legacy note' }).click();
    await panel.getByRole('button', { name: '승인', exact: true }).click();
    await sheet(/작성자로 등록할까요/).getByLabel('변경 사유').fill('Confirmed in kickoff notes');
    await sheet(/작성자로 등록할까요/).getByRole('button', { name: '승인' }).click();
    await until(() => s.get('p5').author?.id === 'alice', 'claim approved');

    // ── Trash: row menu → permanent delete with reason ──────────────────────
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();
    await panel.getByRole('button', { name: /^휴지통/ }).click();
    await panel.getByRole('button', { name: 'Trashed note 더보기' }).click();
    await page.getByRole('menuitem', { name: '영구 삭제' }).click();
    await sheet('영구 삭제할까요?').getByLabel('변경 사유').fill('No longer needed');
    await sheet('영구 삭제할까요?').getByRole('button', { name: '영구 삭제' }).click();
    await until(() => !s.get('p6'), 'purged');

    // ── Backup download ─────────────────────────────────────────────────────
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();
    await panel.getByRole('button', { name: /백업 및 복원/ }).click();
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: /JSON 백업 다운로드/ }).click();
    assert.ok((await download).suggestedFilename().endsWith('.json'));
    await panel.getByRole('button', { name: '뒤로', exact: true }).click();

    // ── 360px ───────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(300);
    await shot('hub-360.png'); await noOverflow();
    await panel.getByRole('button', { name: '관리 닫기' }).click();
    await shot('list-360.png'); await noOverflow();
    await openCard('My protected note');
    await shot('owner-edit-360.png'); await noOverflow();

    assert.deepEqual(errors, []);
    console.log("Browser checks passed: what's-new once, inbox + one-tap acknowledge + arrival toast, foreign read-only + comment + delete request, card→manage without picker, owner edit/status/trash/undo, co-editor autosave, assignee status-only, unknown-author claim, first admin, claim approval, purge, backup download, 720/360 without overflow.");
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
