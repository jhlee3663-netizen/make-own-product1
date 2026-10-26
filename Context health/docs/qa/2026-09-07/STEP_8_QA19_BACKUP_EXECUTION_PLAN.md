# 8단계 QA-19 백업 보호 활성화와 복원 검증

2026-09-10. 사용자 승인에 따라 운영 Firestore의 관리형 백업, PITR, 삭제 보호를 활성화했다. 운영 앱 코드와 `(default)`의 원본 문서는 수정하지 않았다. 적용 전 상태는 [qa19-recovery-readiness-2026-09-10.json](evidence/qa19-recovery-readiness-2026-09-10.json), 적용 및 복원 증거는 [qa19-backup-activation-and-diet-offline-2026-09-10.json](evidence/qa19-backup-activation-and-diet-offline-2026-09-10.json)에 기록했다.

## 적용 결과

| 항목 | 적용값 | 증거 |
|---|---|---|
| 운영 DB | `(default)`, Standard, `asia-northeast3` | `firestore:databases:get` 재조회 |
| 일일 백업 | 사용, 14일 보존 | schedule `de252b68-b9f2-4894-85ef-b1e492b239a6` |
| PITR | 사용, 7일 보존 | `POINT_IN_TIME_RECOVERY_ENABLED`, `604800s` |
| 삭제 보호 | 사용 | `DELETE_PROTECTION_ENABLED` |
| 첫 백업 | `READY` | backup `6b1f136c-254d-4ff0-9aff-c94f2616443f` |
| 백업 시점 | `2026-09-10T08:46:14.976854Z` | 백업 조회 결과 |
| 만료 시점 | `2026-09-24T08:46:14.976854Z` | 백업 조회 결과 |

백업 일정은 `2026-09-10T08:44:50.146957Z`, PITR·삭제 보호는 `2026-09-10T08:44:58.406449Z`에 적용됐다. 백업과 PITR에는 무료 사용량이 없고 저장 용량에 따라 비용이 붙으며 복원도 과금 대상이다.

공식 근거: [Firestore 백업과 복원](https://firebase.google.com/docs/firestore/backups), [재해 복구 계획](https://firebase.google.com/docs/firestore/disaster-recovery), [PITR](https://firebase.google.com/docs/firestore/pitr), [가격과 무료 범위](https://firebase.google.com/docs/firestore/pricing).

## 실제 복원 리허설

- 원본: `projects/context-health-3eb84/databases/(default)`
- 백업: `projects/context-health-3eb84/locations/asia-northeast3/backups/6b1f136c-254d-4ff0-9aff-c94f2616443f`
- 대상: `projects/context-health-3eb84/databases/qa-restore-20260910`
- 시작: `2026-09-10T08:55:00.961970Z`
- 종료: `2026-09-10T09:05:14.155571Z`
- 소요시간: 약 10분 13초
- 상태: **SUCCESSFUL**

복원 대상은 같은 프로젝트의 새 이름 DB다. `(default)`를 덮어쓰지 않으며 현재 앱도 새 DB에 연결되지 않는다. 백업 시점의 원본과 복원본을 읽기 전용으로 비교한 결과는 아래와 같다. UID는 원문 대신 SHA-256 해시 접두어만 증거에 기록했다.

| 비교 항목 | 백업 시점 원본 | 복원본 | 결과 |
|---|---:|---:|---|
| `users` | 5 | 5 | 일치 |
| `logs` | 98 | 98 | 일치 |
| `coachRooms` | 8 | 8 | 일치 |
| UID 없는 로그 | 0 | 0 | 일치 |
| 존재하지 않는 사용자 UID의 로그 | 0 | 0 | 일치 |
| 존재하지 않는 사용자 UID의 대화방 | 0 | 0 | 일치 |
| 복합 인덱스 | 2 | 2 | 정의 일치 |
| TTL field override | 0 | 0 | 일치 |

해시 처리한 5개 사용자별 로그·대화방 수도 모두 정확히 일치했다. 이 검사는 문서 내용 전체를 보고서로 내보내지 않고 소유자와 개수만 대조했다.

## 완료 조건과 현재 판정

- 실제 backup resource와 `READY` 상태: **충족**
- 새 이름 DB로 복원 성공: **충족**
- RTO 4시간 이내: **충족 — 약 10분 13초**
- 주요 컬렉션 문서 수 일치: **충족**
- 대표 계정 기록·UID 소유권 일치: **충족 — 5개 사용자 전부 대조**
- TTL·인덱스 대조: **충족**
- 복원 DB 보존 또는 삭제 결정: **충족 — 사용자 승인 뒤 2026-09-11 삭제**

현재 판단은 **QA-19 통과 및 검증 자원 정리 완료**다. 사용자 승인 뒤 검증용 DB의 삭제 보호만 해제하고 `2026-09-11T00:41:57.340071Z`에 삭제했다. 재조회 결과 DB 목록에는 운영 `(default)`만 남았고, 운영 DB의 PITR 7일·삭제 보호와 14일 보존 일일 백업 일정은 유지됐다.
