# 후기(DB 변경 25번)만 적용하기 — 테스트 전용 DB 준비 자료 (2026-10-19)

> **외부 DB에는 아무것도 실행하지 않았다.** 이 문서와 SQL 파일 세 개는 운영자가 검토한 뒤 테스트 전용 프로젝트(`wdvrwwajakjdfrajgxcm`)에서 직접(또는 root가) 실행하기 위한 준비 자료다. 운영 DB는 대상이 아니다. 적용된 SQL 28번은 고치지 않았다.

## 1. 지금 "후기 준비 중"이 뜨는 이유와 이미 구현된 것

- **원인**: 화면(`/my/reviews`)이 `getMyReviewsView`로 후기 표를 읽는데, 테스트 DB에 25번이 없어 `reviews` 표가 없다 → Supabase 저장소가 "표 · 함수 없음"(PostgREST `PGRST205` · `42P01`)을 코드 `42P01`로 통일해 던지고 → 서비스가 `ready: false`로 받아 "준비 중"을 보인다(`lib/integrations/supabase/reviews.ts`의 `fail` · `lib/services/review-service.ts`의 `getMyReviewsView`). Windows가 테스트 DB OpenAPI에서 `reviews` · `review_admin_log` · `review_reports` · `submit_review_report`가 보이지 않는다고 읽은 것과 일치한다(**카탈로그에 실제로 없는지는 이 문서의 사전 확인 SQL이 직접 확인한다 — 아직 미검증**).
- **후기 기능은 이미 끝까지 구현되어 있다**(새로 만들지 않았고 새 표도 만들지 않는다 — 25번 하나가 전부다): 작성 · 저장(`createReview`) · 내 후기 목록 · 수정(`editReview`) · 공개/나만 보기 전환(`setReviewVisibility`) · 삭제(`deleteReview`, 글은 지우고 묘비를 남겨 같은 이용 건에 보상이 한 번뿐) · 이용 건 연결(결제 완료 + 리포트 완성인 본인 주문 · 답을 받은 AI 질문이 있는 본인 검사 결과 · 리포트 궁합) · 신고 · 운영자 조치 · 탈퇴 시 삭제. 화면은 `app/my/reviews/page.tsx` · `components/reviews/*`.
- **타인 공개는 이 작업이 새로 열지 않는다**: 공개 동의 체크는 기본 해제(`useState(initial?.publicConsent ?? false)`)이고, 공개되는 것은 작성자가 직접 공개에 동의한 글뿐이며, 후기가 없으면 메인에 아무것도 그리지 않는다(가짜로 채우지 않음). 후기 보상(질문권)은 혜택 설정 `feature.review_reward`가 켜져야 하고 기본은 꺼짐이며 **혜택 표(19번)가 없으면 꺼진 것으로 본다**(`loadReviewSettings`).
- **합성 데이터로 확인된 동작**(기존 시험 `lib/services/review-service.test.ts` 등 — 실제 사용자 후기는 쓰지도 공개하지도 않았다): 이용 자격(남의 주문 · 환불 · 만드는 중 · 없는 번호 거절) · 중복 작성 거절(동시 8번도 하나) · 빈 글 · 최소 글자 수 · 600자 한도 · 연락처 · 이메일 · 주민번호 · 카드번호 가림 · 본인 것만 수정 · 삭제(다시 쓰기, 보상은 다시 없음) · 공개 후기 목록에 작성자 식별값 없음 · 후기 표가 없는 DB에서 조회는 빈 값 · 쓰기는 준비 중 · 혜택 표가 없는 DB에서도 후기는 쓰고 보상만 꺼짐. 화면에는 `dangerouslySetInnerHTML`이 없어 글은 텍스트로만 그려진다(React가 이스케이프).

## 2. 25번이 하는 일 (원문 `supabase/migrations/20261104000000_reviews.sql`, 259줄 — 고치지 않았다)

| 만드는 것 | 내용 |
| --- | --- |
| 표 `reviews` | 후기 한 건 = (회원, 종류, 이용 건) 하나(고유 조건) · 별 1~5 · 글 600자 이하 · 공개 동의 · 상태(published / private / hidden / deleted) · 대가 표시 · 보상 기록 · 운영자 선정/숨김 · 인덱스 5개 · `updated_at` 트리거 |
| 표 `review_admin_log` | 운영자 조치 이력(글은 복사하지 않음, 사유 분류만) |
| 표 `review_reports` | 공개 후기 신고(방문자 익명 번호 + 사유) |
| 함수 `submit_review_report` · `review_admin_apply` | 신고 접수 · 운영자 조치(상태 변경과 이력을 한 번에) — **service_role만 실행** |
| 탈퇴 트리거 `profiles_reviews_withdraw` + 함수 `reviews_on_withdraw` | 프로필의 `withdrawn_at`이 채워지면 그 회원의 후기를 지운다(기존 탈퇴 함수를 다시 바꾸지 않는다) |
| **`funnel_events` 이름 검사 교체** | 허용 이름 5개 → 7개(`review_section_view` · `review_all_click` 추가). 결제 이벤트 같은 이름은 계속 거절하는 나열형 |

## 3. 선행조건 · 기존 제약 · 권한 영향

**선행조건(있어야 한다)** — 모두 1~18번이 만든다. 19~22번(혜택)은 필요 없다.

| 필요한 것 | 만든 번호 | 25번이 쓰는 곳 |
| --- | --- | --- |
| 표 `profiles` · 열 `profiles.withdrawn_at` | 1~3번 · 10번 | 탈퇴 트리거 |
| 표 `funnel_events` | 8번 | 이름 검사 교체 |
| `auth.users` (Supabase Auth) | Supabase | 후기 표의 `user_id` 참조(회원 삭제 시 후기도 함께) |
| 역할 `service_role` · `authenticated` · `anon` | Supabase | 권한 부여 · 회수 |
| `gen_random_uuid()` | PostgreSQL 13+ | 후기 번호 기본값 |

**19~22번에 의존하지 않는 근거**: 25번 SQL 안에는 혜택 표 · `grant_credit`이 없다(`grant_credit` 언급은 주석뿐 — 보상 지급은 서버가 혜택 설정이 켜졌을 때만 `review:<후기 번호>` 키로 한 번 부른다). 테스트 DB의 상태(1~18 + 23 · 24 · 26 · 28번 적용, 19~22 · 25 · 27 미적용)를 흉내 낸 DB에서 그대로 적용돼 통과했다(아래 4장).

**기존 제약과 부딪히는 곳 — 하나뿐**: `funnel_events_name_check`를 지우고 7개 나열형으로 다시 만든다. 기존 행에 새 목록 밖의 이름이 있으면 새 제약 추가가 실패한다 → 사전 확인(20번 줄)과 적용 파일의 시작 조건이 먼저 걸러 "아무것도 바꾸지 않고" 멈춘다. 지금 허용 이름 5개는 모두 새 목록 안에 있으므로 정상 DB에서는 걸리지 않는다. 이 제약은 8번 파일에서 `name text … check (name in (…))`로 만들어져 자동 이름이 `funnel_events_name_check`다(사전 확인 21번 줄이 실제 정의를 보여 준다).

**권한 영향**(25번이 주고 거두는 전부):

| 대상 | anon | authenticated | service_role |
| --- | --- | --- | --- |
| `reviews` | 없음 | **본인 행 조회만**(정책 "본인 후기 조회", 쓰기 없음) | 읽기 · 쓰기 · 지우기 |
| `review_admin_log` | 없음 | 없음(정책도 없음) | 읽기 · 쌓기 |
| `review_reports` | 없음 | 없음(정책도 없음) | 읽기 · 쌓기 · 갱신 |
| 함수 `submit_review_report` · `review_admin_apply` | 실행 불가 | 실행 불가 | 실행 |
| 함수 `reviews_on_withdraw`(트리거용) | 실행 불가 | 실행 불가 | — |

세 표 모두 RLS를 켠다. 공개 후기는 브라우저가 직접 읽지 않고 서버가 공개 조건(published + 동의)으로 걸러 읽는다. **기존 표 · 함수 · 데이터는 바뀌지 않는다**(바뀌는 기존 항목은 위 제약 하나).

## 4. 이 환경에서 확인한 것 (로컬 Postgres 16 — 실제 Supabase가 아니다)

테스트 DB의 상태를 흉내 낸 임시 DB(1~18 · 23 · 24 · 26 · 28번 적용, 19~22 · 25 · 27번 없음, `auth.users`는 최소 구조)에서:

1. **사전 확인 SQL**: 17줄 모두 OK, 종합 "OK — 25번을 적용할 수 있다".
2. **적용 파일 1회 실행**: 정상 완료(COMMIT), 끝 확인 DO 통과, 사후 확인 13줄 모두 OK(종합 "OK — 25번이 적용됐다").
3. **재실행**: "시작 조건 불충족 — 25번이 만드는 것이 이미 있습니다 …"로 아무것도 바꾸지 않고 멈춤(처음 쓴 파일에서 `text[] || '문자열'` 오류를 찾아 `::text`로 고쳤다 — 이 확인 없이 쓰였다면 재실행 때 의미 없는 오류가 났을 것이다).
4. **기존 데이터 보존**: 프로필 2 · 방문 단계 2행이 있는 DB에 적용해도 그대로(2 · 2), 새 허용 이름은 들어가고 `payment_confirmed` 같은 이름은 계속 거절.
5. **탈퇴 트리거**: 후기 2건(회원 2명)에서 한 명의 `withdrawn_at`을 채우자 그 회원의 후기만 지워짐(2 → 1, 다른 회원 후기 유지).
6. 같은 로컬 DB에 모든 마이그레이션이 적용된 상태에서 **DB 시험 24개 통과**(`supabase/tests/reviews.db.test.ts` · `record-delete.db.test.ts`: RLS · 권한 · 고유 조건 · 보상 키 · 탈퇴 · 삭제).
7. 서버 시험 `server/apply-sql.test.ts`가 적용 파일이 마이그레이션에서 만든 그대로임 · 트랜잭션 순서 · 읽기 전용 확인 · `::text`를 확인한다.

**하지 못한 것**: 실제 Supabase(테스트 프로젝트)에는 접속하지 않았다 · PostgREST 스키마 캐시가 새 표를 알아보는지(아래 5장) · 실제 사용자 데이터가 있는 DB에서의 락 · 시간 · 실제 Supabase SQL Editor의 "위험한 작업" 확인 창 동작은 확인하지 못했다.

## 5. 적용 순서 (운영자 · root가 테스트 전용 프로젝트에서)

| 단계 | 할 일 | 파일 |
| --- | --- | --- |
| 0 | (권장) 변경 전 상태를 기록한다: 프로필 · 방문 단계 행 수 | 사전 확인 32번 줄 |
| 1 | **사전 확인 — 읽기 전용.** 종합이 "OK"여야 한다. "막힘"이 있으면 적용하지 말고 결과 표를 그대로 알려 준다 | `supabase/review-25-precheck.sql` |
| 2 | **적용 — 한 번만.** SQL Editor에 파일 전체를 붙여넣고 Run. 하나의 트랜잭션이고, 시작 조건이 안 맞거나 끝 확인이 어긋나면 전체 취소 | `supabase/apply-25-reviews.sql` |
| 3 | **사후 확인 — 읽기 전용.** 종합이 "OK — 25번이 적용됐다"여야 한다(적용 파일 끝에도 같은 조회가 붙어 있다). 11번 줄의 행 수가 0단계 값과 같아야 한다 | `supabase/review-25-postcheck.sql` |
| 4 | 앱 확인: `/my/reviews`에서 "후기 준비 중"이 사라지고 이용 건(구매 · AI 질문)이 있으면 "후기 남기기"가 보이는지. 그래도 남으면 PostgREST가 새 표를 아직 모르는 것이므로 SQL Editor에서 `notify pgrst, 'reload schema';` 한 번 | 앱 화면 |
| 5 | (선택) OpenAPI/API 목록에 `reviews` · `review_reports` · `review_admin_log` · `submit_review_report` · `review_admin_apply`가 보이는지 Windows가 다시 읽는다 | — |

**후기 보상은 꺼진 채로 둔다**: 이 순서 어디에서도 혜택 설정을 켜지 않는다. 19~22번이 없는 동안은 설정을 읽을 수 없어 보상이 자동으로 꺼져 있고, 나중에 19번을 적용해도 `feature.review_reward`는 기본 `false`다(관리자가 직접 켜기 전에는 지급하지 않는다).

## 6. 앱 배포와 DB 적용의 선후 관계

- **어느 쪽이 먼저여도 안전하다.** 현재 배포된 코드는 25번 없이도 정상 동작한다(조회는 빈 값, 쓰기는 "준비 중", 홈과 기존 화면은 깨지지 않음 — 시험으로 확인). 25번을 적용하면 같은 코드가 후기 기능을 쓰기 시작한다. 이 문서의 작업은 코드를 바꾸지 않는다.
- 25번이 새 허용 이름 2개를 추가하므로, 메인 후기 영역이 화면에 보였을 때 보내는 방문 단계 이벤트(`review_section_view` 등)는 25번 전에는 저장되지 않고(방문 기록 실패는 화면에 영향 없음) 25번 뒤부터 저장된다.

## 7. 되돌리기

규칙상 마이그레이션을 고쳐 되돌리지 않고 새 마이그레이션으로 고친다. **후기가 0건일 때만** 아래 수동 되돌리기를 쓸 수 있다(후기 · 신고 · 이력이 있으면 지우지 말고 알려 달라 — 아래는 참고용이며 자동 실행하지 않는다). `funnel_events`에 새 이름 두 개의 행이 이미 있으면 5개 제약 복원이 실패하므로 그 행을 먼저 확인한다.

```sql
begin;
drop trigger if exists profiles_reviews_withdraw on public.profiles;
drop function if exists public.reviews_on_withdraw();
drop function if exists public.review_admin_apply(uuid, text, text, text, uuid);
drop function if exists public.submit_review_report(uuid, text, text);
drop table if exists public.review_reports;
drop table if exists public.review_admin_log;
drop table if exists public.reviews;
drop function if exists public.reviews_touch();
alter table public.funnel_events drop constraint if exists funnel_events_name_check;
alter table public.funnel_events add constraint funnel_events_name_check
  check (name in ('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view'));
commit;
```

## 8. 바뀐 파일

`supabase/review-25-precheck.sql`(새, 읽기 전용) · `supabase/apply-25-reviews.sql`(새, `node scripts/render-apply-sql.ts --reviews`가 만든다 — 직접 고치지 않는다) · `supabase/review-25-postcheck.sql`(새, 읽기 전용) · `lib/ops/apply-sql.ts`(`buildReviewsApplySql`) · `scripts/render-apply-sql.ts`(`--reviews`) · `server/apply-sql.test.ts`. 마이그레이션 파일은 고치지 않았고 앱 화면 · 서비스 코드도 바꾸지 않았다.
