#!/usr/bin/env node
/**
 * Smart Pin — Deploy Script
 *
 * 1. dist/ui.html  →  deploy_github/index.html   (GitHub Pages 호스팅용)
 * 2. dist/ui.html → deploy_figma/ui.html (버전 일치 UI)
 * 3. manifest.json + dist/code.js  →  deploy_figma/
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = __dirname;
const DIST          = path.join(ROOT, 'dist');
const DEPLOY_GITHUB = path.join(ROOT, 'deploy_github');
const DEPLOY_FIGMA  = path.join(ROOT, 'deploy_figma');

// ── helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  [mkdir] ${path.relative(ROOT, dir)}`);
  }
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`  [copy]  ${path.relative(ROOT, src)}  →  ${path.relative(ROOT, dest)}`);
}

function writeFile(dest, content) {
  fs.writeFileSync(dest, content, 'utf8');
  console.log(`  [write] ${path.relative(ROOT, dest)}`);
}

// ── step 0: pre-flight check ──────────────────────────────────────────────────

const required = [
  path.join(DIST, 'ui.html'),
  path.join(DIST, 'code.js'),
  path.join(ROOT, 'manifest.json'),
];

for (const f of required) {
  if (!fs.existsSync(f)) {
    console.error(`\n[error] 필요한 파일이 없습니다: ${path.relative(ROOT, f)}`);
    console.error('npm run build 를 먼저 실행해주세요.\n');
    process.exit(1);
  }
}

// ── step 1: dist/ui.html → deploy_github/app.html (플러그인 UI; index.html은 웹 뷰어 전용)

console.log('\n[1] GitHub Pages 배포 파일 복사');
ensureDir(DEPLOY_GITHUB);
copyFile(path.join(DIST, 'ui.html'), path.join(DEPLOY_GITHUB, 'app.html'));

// ── step 2: version-matched standalone plugin UI ─────────────────────────

console.log('\n[2] Figma 팀원 배포용 UI 복사');
ensureDir(DEPLOY_FIGMA);

// Permissions and storage format must ship with the matching UI version.
// A remotely hosted UI can otherwise silently run against an older backend.
copyFile(path.join(DIST, 'ui.html'), path.join(DEPLOY_FIGMA, 'ui.html'));

// ── step 3: manifest.json + dist/code.js → deploy_figma/ ─────────────────────

console.log('\n[3] Figma 플러그인 필수 파일 복사');
copyFile(path.join(DIST, 'code.js'), path.join(DEPLOY_FIGMA, 'code.js'));

// manifest.json 경로 재작성: 원본은 "dist/code.js", "dist/ui.html" 이지만
// deploy_figma/ 에서는 루트에 바로 있으므로 경로를 맞춰줌
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
manifest.main = 'code.js';
manifest.ui   = 'ui.html';
fs.writeFileSync(path.join(DEPLOY_FIGMA, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('  [write] manifest.json (경로 재작성: dist/code.js → code.js, dist/ui.html → ui.html)');

if (process.argv.includes('--local')) {
  console.log('\n[done] 로컬 배포 파일 준비 완료. GitHub에는 게시하지 않았습니다.');
  process.exit(0);
}

// ── step 4: deploy_github/index.html → imbc_smart-pin (GitHub Pages) ─────────

const { execSync } = require('child_process');
const os   = require('os');
const PAGES_REPO = 'git@github.com:jhlee3663-netizen/imbc_smart-pin.git';
const CLONE_DIR  = path.join(os.tmpdir(), 'imbc_smart-pin_deploy');

console.log('\n[4] GitHub Pages push → imbc_smart-pin');
try {
  // 항상 깨끗한 상태로 시작 — 기존 클론 삭제 후 재클론
  if (fs.existsSync(CLONE_DIR)) {
    fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  }
  execSync(`git clone ${PAGES_REPO} "${CLONE_DIR}"`, { stdio: 'inherit' });
  // 최신 파일 복사 (UI + 플러그인 파일 전체)
  fs.copyFileSync(path.join(DEPLOY_GITHUB,  'index.html'),   path.join(CLONE_DIR, 'index.html'));
  fs.copyFileSync(path.join(DEPLOY_GITHUB,  'app.html'),     path.join(CLONE_DIR, 'app.html'));
  fs.copyFileSync(path.join(DEPLOY_FIGMA,   'code.js'),      path.join(CLONE_DIR, 'code.js'));
  fs.copyFileSync(path.join(DEPLOY_FIGMA,   'ui.html'),      path.join(CLONE_DIR, 'ui.html'));
  fs.copyFileSync(path.join(DEPLOY_FIGMA,   'manifest.json'),path.join(CLONE_DIR, 'manifest.json'));
  // 변경사항 commit & push
  // main 브랜치 업데이트
  execSync(
    'git checkout main && git add index.html app.html code.js ui.html manifest.json && git diff --cached --quiet || (git commit -m "deploy: update plugin UI" && git push origin main)',
    { cwd: CLONE_DIR, stdio: 'inherit' }
  );
  // gh-pages 브랜치 업데이트 (GitHub Pages 실제 서빙 브랜치)
  execSync(
    'git checkout gh-pages && git checkout main -- index.html app.html && git add index.html app.html && git diff --cached --quiet || (git commit -m "deploy: update plugin UI" && git push origin gh-pages)',
    { cwd: CLONE_DIR, stdio: 'inherit' }
  );
  execSync('git checkout main', { cwd: CLONE_DIR, stdio: 'pipe' });
  console.log(`  [push] imbc_smart-pin main + gh-pages 업데이트 완료`);
} catch (e) {
  console.error('[error] GitHub Pages push 실패:', e.message);
  process.exit(1);
}

// ── done ──────────────────────────────────────────────────────────────────────

console.log('\n[done] 배포 완료');
console.log(`  GitHub Pages  : ${DEPLOY_GITHUB}`);
console.log(`  Figma 플러그인 : ${DEPLOY_FIGMA}\n`);
