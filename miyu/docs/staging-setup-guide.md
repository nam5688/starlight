# 스테이징 Supabase 준비 안내 (운영자가 직접 · 한 단계씩) — 2026-10-17

> 운영자 승인(2026-10-17): **스테이징 Supabase 준비를 승인한다 — 운영 DB · 실제 고객 데이터와 분리된 환경.** DB 19~25번은 먼저 여기서 적용 · 검증하고, **운영 DB 적용은 별도 승인**이다.
> 이 환경은 **운영자가 직접 만든다** — 클라우드 세션(Claude Code)은 Supabase · Vercel · 토스 · 메일 계정에 접근할 수 없고, 키를 대화에 받지도 않는다. 아래는 순서와 확인 방법이며, **스테이징에서는 아직 한 번도 돌려 보지 못했다**(자동 시험은 개발용 임시 Postgres + 가짜 결제사 + 모의 AI까지).
> 시험할 흐름 12줄과 통과 기준은 [`staging-test-plan.md`](./staging-test-plan.md)에 있다.

## 1. 새 Supabase 프로젝트 만들기 (운영 프로젝트가 아니다)

1. Supabase 대시보드 → **New project** → 이름 `miyu-staging`(운영과 구분되는 이름), 지역은 운영과 같게, DB 비밀번호는 운영자가 따로 보관한다.
2. 프로젝트가 준비되면 **Project Settings → API**에서 세 값을 확인한다 — 주소(Project URL) · 공개용 키(publishable) · 서버 전용 비밀키(secret). **채팅 · 문서 · 커밋에 붙이지 않는다**(아래 3장 `.env.local`에만).
3. 운영 프로젝트의 키를 스테이징 환경에 넣지 않는다. (이번에 `VERCEL_ENV=preview` 배포에서는 DB 값이 들어와도 기본으로 무시하는 안전망을 넣었다 — 5장.)

## 2. DB 변경 1~25번을 한 번에 적용 (비어 있는 새 프로젝트 전용 파일)

- 파일: `miyu/supabase/apply-staging-all.sql`(마이그레이션 1~25번을 한 글자도 고치지 않고 이어 붙인 것 · `node scripts/render-apply-sql.ts --staging`으로 만든다).
- 사용: 새 프로젝트 → **SQL Editor → New query** → 파일 내용을 모두 붙여넣고 **Run (한 번만)**. 마지막 결과 표(읽기 전용 확인 조회)에서 **1~25번이 모두 "적용됨"**이면 끝이다.
- **안전장치**: 시작할 때 이 프로젝트에 앱의 표(`profiles` · `orders` · `assessments`)가 하나라도 있으면 **아무것도 바꾸지 않고 "시작 조건 불충족"으로 멈춘다** — 운영 프로젝트에 실수로 실행해도 막힌다(그래도 운영 프로젝트에서 실행하지 않는다). 전체가 한 트랜잭션이라 중간에 오류가 나면 모두 취소된다.
- 확인한 것(개발용 임시 Postgres 16 — 로컬 Auth 포함): ① 비어 있는 DB에서 끝까지 실행 · 25/25 적용됨 ② 순차 적용한 DB와 `public` 스키마 구조 동일(차이는 로컬 부트스트랩의 권한 한 줄뿐) ③ 표가 이미 있는 DB에서는 시작 조건에서 멈춤 ④ 파일이 마이그레이션과 어긋나지 않는지 서버 시험이 확인한다.
- **확인하지 못한 것**: 실제 Supabase SQL Editor의 실행 시간 · 한 번에 붙여넣을 수 있는 크기(약 27만 자) · 확인 창 동작. 붙여넣기가 막히면 알려 주면 번호별 파일(`supabase/migrations/`)로 나눠 적용하는 절차로 바꾼다.
- 운영 DB의 19~25번 적용은 이 파일을 쓰지 않는다 — [`db-rollout-19-25.md`](./db-rollout-19-25.md)의 번호별 절차(백업 · 순서 · 확인 · 되돌리기)를 따르고 **별도 승인**을 받는다.

## 3. 앱 환경 — 운영자 PC의 `.env.local` (스테이징 전용)

```powershell
cd <저장소>\miyu
Copy-Item .env.example .env.local      # 이미 있다면 건너뛴다(운영 값이 들어 있다면 새 파일 이름으로 따로 만든다)
notepad .env.local
```

| 이름 | 스테이징 값 | 비고 |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:3000` | 로그인 후 돌아올 주소 |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` | **스테이징 프로젝트의 값** | 운영 값이 아니다 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` · `TOSS_SECRET_KEY` | **토스 테스트 키**(`test_gck_…` · `test_gsk_…`) | 실결제 키를 넣지 않는다 |
| `PAYMENTS_LIVE_MODE` | 비움(또는 `false`) | 실결제 아님 — test_ 키만 받는다 |
| `ADMIN_USER_IDS` | 스테이징에 가입한 관리자 시험 계정의 User UID | Supabase → Authentication → Users |
| `MIYU_TEST_OPEN_SALES` | `saju-compat,report-compat` | **결제가 테스트 모드일 때만** 듣는다(실결제 모드에서는 적어도 열리지 않는다). 시험이 끝나면 지운다 |
| `AI_PROVIDER` | 비움 또는 `mock-local`(+`AI_MOCK_URL`) | **실제 AI는 이 시험에 쓰지 않는다**(별도 승인 `real-ai-run-guide.md`) |
| `TELEGRAM_*` · `CRON_SECRET` | 시험용 별도 값 또는 비움 | 운영 알림 방에 시험 알림이 섞이지 않게 |

## 4. Supabase Auth · 메일 · 로그인

| 항목 | 할 일 | 비고 |
| --- | --- | --- |
| Site URL · Redirect URLs | Authentication → URL Configuration에 `http://localhost:3000` 과 `http://localhost:3000/**` | 가입 · 재설정 메일 링크가 돌아올 주소 |
| 이메일 로그인 | Authentication → Providers → Email 켬 | 이메일 확인(confirm) 사용 여부는 운영과 같게 |
| **메일 발송** | Authentication → SMTP Settings에 시험용 SMTP를 설정 | 설정 전에는 가입 · 재설정 메일이 가지 않는다(`docs/setup-guide.md`). 기본 메일 서버의 발송 한도는 운영자가 Supabase 문서에서 현재 값을 확인 — 이 문서는 확인하지 못했다. **메일이 실제 도착하는지가 시험 1번의 확인 항목이다** |
| 카카오 로그인 | 먼저 이메일로 시험하고, 카카오는 스테이징용 Redirect URI를 카카오 개발자 콘솔에 더한 뒤 | 운영의 카카오 앱 설정을 바꾸기 전에 따로 판단 |
| 시험 계정 | 이메일 계정 3~4개(A · B · C · 관리자) | 실제 고객 정보 · 실제 연락처 금지 |

## 5. Vercel에서 스테이징을 보고 싶을 때 (선택)

- 기본은 **운영자 PC의 `npm run dev`**(`http://localhost:3000`)다.
- Vercel **Preview** 배포에 스테이징 DB를 연결해야 한다면: 미리보기 배포는 안전망 때문에 DB 값을 **기본으로 무시**한다(`lib/config/preview-guard.ts`). 스테이징 DB를 **일부러** 쓸 때만 그 Preview 환경에 `PREVIEW_ALLOW_DATABASE=yes`와 스테이징 키를 넣는다. 실결제(`PAYMENTS_LIVE_MODE=true`) · 실제 AI(anthropic)는 이 값을 줘도 미리보기에서 막힌다.
- **스테이징 DB를 연결한 Preview는 공유 링크로 공개하지 않는다**(링크를 아는 누구나 가입 · 저장을 시험할 수 있게 된다). Vercel 로그인(Vercel Authentication)이 켜진 채로 운영자만 본다.

## 6. 시험 순서

1. 가입 · 로그인(1줄) → 추천(2) → 포인트(3) → 쿠폰 · 0원 주문(4) → 질문권(5) → 사주 궁합(6) → 리포트 궁합(7) → 환불(8) → 후기(9) → 탈퇴(10) → 실패 복구(11) → 개인정보 · 접근(12).
2. 혜택 스위치는 관리자 `/admin/benefits`에서 **시험할 것만** 켠다. 끝나면 모두 끄고 `MIYU_TEST_OPEN_SALES`를 지운다.
3. 줄마다 "통과 / 실패 + 한 줄 사유(오류번호 · 시각 · 시험 계정 앞부분 · 결제 테스트 주문번호)"를 채팅에 붙인다 — **키 · 비밀번호 · 고객 개인정보는 붙이지 않는다**.
4. 돈이 오가는 줄(2 · 4 · 6 · 7 · 8)은 주문 상태 · 결제사 기록 · 질문권 · 포인트 장부가 서로 맞아야 한다(`/admin` 주문 조회 · 결제 대조 · `supabase/check-payments.sql`).

## 7. 운영자만 할 수 있는 것 (제가 대신 못 하는 것)

| 할 일 | 이유 |
| --- | --- |
| Supabase 새 프로젝트 만들기 · 키 확인 | 계정 접근 없음 · 키를 대화에 받지 않음 |
| SQL Editor에서 `apply-staging-all.sql` 실행 | 같은 이유 |
| 토스 테스트 키 발급 · 테스트 결제 · 테스트 취소 | 토스 계정 |
| SMTP 설정 · 카카오 콘솔 설정 | 외부 계정 |
| Vercel 환경변수 · 보호 설정 | Vercel 계정 |

**결과를 받으면** 내가 줄마다 확인해 실패한 줄의 원인을 고치고, 같은 줄을 다시 시험하게 요청한다. 스테이징 통과 전에는 운영 DB 적용 · 판매 스위치 · 혜택 스위치를 열자고 권하지 않는다.
