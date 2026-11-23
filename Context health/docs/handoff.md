# 작업 이어가기 (2026-10-23 기준)

**2026-11-21 추가:** AI 범위·비용 보호 변경은 [AI 보안 인수인계](handoff-ai-security-2026-11-21.md)를 먼저 읽는다. AI 서버 단독 배포 내용, 로컬에만 있는 클라이언트 변경, 테스트 결과와 운영 통합 검증의 미완료 항목을 기록했다. 아래 내용은 기존 10월 인수인계 기록이다.

새 기기·새 대화에서 이 파일부터 읽고 시작한다.

## 지금 상태
- 피드/친구 기능(피그마 📚 스터디 06, 1~3단계) 앱에 구현·배포 완료. 코치 탭은 피드로 교체(코드는 숨김만).
- 설계·구현 메모: `docs/ia_feed_social.md`, 간격 규칙: `docs/spacing_rules.md`, 모션: `docs/motion_and_ui_notes.md`
- 서버: `functions/social/` (router `index.js`, `workouts.js`, `youtube.js`, `curator.js`, `recommend.js`, `store.js`, `notify.js`)
- 클라이언트: `src/components/social/`, `src/lib/socialApi.js`, `usePullRefresh.js`, `push.js`
- 테스트: 에뮬레이터 띄우고 `node scripts/test-social.mjs` (20개 통과)
- 미리보기: `preview/social.html` (`?s=my` 등)

## 마지막에 한 것 (배포됨, 화면 확인은 아직)
- 식단도 저장·수정할 때마다 스토리에 올라감 (`updatedAt` 기준)
- 스토리는 올린 뒤 24시간 노출 (자정 기준 → 24시간으로 변경)
- 프로필 사진 테두리: 스토리 있을 때만 그라데이션 2.5px + 안쪽 흰 선 2px (인스타 방식)

## 자동 큐레이션
- 매일 07:00 KST `curateYoutube` — 운동 10 + 식단 5, 테마 큐레이터 6개 계정(배지 "큐레이터")
- 비밀값: `GEMINI_KEY`, `YOUTUBE_KEY` (Secret Manager에 있음, 다른 기기에서 다시 넣을 필요 없음)
- 10/23 실행 중간 결과: 하체 장인 11, 상체 공방 5 (식단 결과는 미확인) → `npx firebase-tools functions:log --only curateYoutube`로 확인

## 남은 일
- 스토리에 사진 첨부 (나중)
- 스토리 본 사람 목록, 인스타처럼 (나중)
- 식단 영상 분석 실데이터 확인
- 사용자가 더 할 일이 있다고 함 — 새 요청 받기

## 새 기기 준비
1. `npm install` / `cd functions && npm install`
2. `.env`, `functions/.env`는 git에 없음 → 기존 기기에서 복사
3. `npx firebase-tools login` 후 배포: `npm run build && npx firebase-tools deploy --only functions:social,hosting --non-interactive`
4. 커밋은 요청 시에만, push는 하지 않음 (로컬 main이 원격보다 앞서 있음)
