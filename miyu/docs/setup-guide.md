# 외부 서비스 연결 안내 (Supabase · 카카오 · 토스페이먼츠)

코드는 준비되어 있습니다. 아래 단계를 **순서대로 하나씩** 진행하면 카카오 로그인 → 결과 저장 → 테스트 결제가 동작합니다.
개발 서버를 켠 뒤 http://localhost:3000/setup 을 열면 지금 몇 단계까지 됐는지, 다음에 할 일이 무엇인지 보여줍니다.

> - 비밀키(Supabase secret key, 카카오 클라이언트 시크릿, 토스 시크릿 키)는 **대화창 · 코드 · 스크린샷 · 메신저에 붙여넣지 마세요.** 각 서비스 웹사이트와 내 컴퓨터의 `.env.local` 파일에만 직접 입력합니다.
> - 실결제(live 키)와 공개 배포는 운영자 확인 전에 하지 않습니다. 앱도 테스트 키만 받도록 막혀 있습니다.
> - 각 서비스 화면의 메뉴 이름은 바뀔 수 있습니다. 아래와 다르면 각 서비스의 공식 안내를 기준으로 하세요.

## 먼저 알아둘 것 — 헷갈리기 쉬운 두 주소

로그인 결과는 **카카오 → Supabase → 미유** 순서로 전달됩니다. 그래서 주소가 두 개 필요하고, 등록하는 곳이 다릅니다.

| | ① Supabase Callback URL | ② 미유 로그인 완료 주소 |
| --- | --- | --- |
| 등록하는 곳 | **카카오디벨로퍼스** (카카오 로그인 Redirect URI) | **Supabase** (Authentication → URL Configuration → Redirect URLs) |
| 역할 | 카카오가 로그인 결과를 Supabase로 보냄 | Supabase가 로그인을 마친 사람을 미유 사이트로 돌려보냄 |
| 모양 | `https://<프로젝트 주소>.supabase.co/auth/v1/callback` | 로컬: `http://localhost:3000/auth/callback` |
| 어디서 복사 | Supabase → Authentication → Providers → Kakao 화면의 Callback URL | 위 주소 그대로 (배포 후에는 `https://실제주소/auth/callback` 추가) |

---

## 1단계. Supabase 주소 · 키 입력과 연결 확인

1. https://supabase.com 에 가입하고 **New project**를 만듭니다. Region은 **Northeast Asia (Seoul)** 를 고릅니다. 데이터베이스 비밀번호는 내 비밀번호 관리 수단에만 보관합니다. 만들 때 **Data API** 옵션이 보이면 켜진 상태(기본값)로 둡니다.
2. PowerShell에서 미유 폴더로 이동한 뒤, 아래 한 줄을 실행합니다. `.env.local`이 **없을 때만** `.env.example`을 복사해 만들고, 이미 있으면 건드리지 않은 채 메모장으로 엽니다.

   ```powershell
   cd $HOME\Documents\starlight\miyu
   if (Test-Path .env.local) { "이미 있습니다. 덮어쓰지 않고 엽니다." } else { Copy-Item .env.example .env.local; "새로 만들었습니다." }; notepad .env.local
   ```

3. 이 파일이 Git 커밋에서 빠지는지 확인합니다.

   ```powershell
   git check-ignore -v .env.local
   ```

   `miyu/.gitignore:34:.env*	.env.local`처럼 규칙이 한 줄 나오면 커밋에서 제외된 것입니다. 아무것도 나오지 않으면 진행하지 말고 알려주세요.
4. Supabase에서 아래 세 값을 찾아 메모장의 `=` 뒤에 **직접** 붙여넣습니다. 앞뒤에 따옴표나 공백을 넣지 않습니다.

   | `.env.local` 이름 | Supabase에서 찾는 곳 | 모양 |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 첫 화면 **Connect** 또는 **Project Settings → Data API**의 Project URL | `https://….supabase.co` (끝에 `/` 없이) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Project Settings → API Keys**의 Publishable key | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | 같은 화면의 Secret key (서버 전용, 공개 금지) | `sb_secret_…` |

5. 같은 파일의 `SITE_URL=` 뒤에 `http://localhost:3000` 을 적고 저장(`Ctrl + S`)합니다.
6. 개발 서버를 켭니다 (이미 켜져 있으면 `Ctrl + C`로 끄고 다시).

   ```powershell
   npm run dev
   ```

7. http://localhost:3000/setup 을 엽니다. 이 화면은 입력 형식만 보는 것이 아니라 **Supabase에 실제로 접속해** 주소 · 공개용 키 · 비밀키를 확인합니다.
   - 표 아래 **Supabase 연결**이 "연결됨"이면 1단계 완료입니다.
   - "형식 확인 필요" 또는 "맞지 않습니다"가 보이면 그 안내대로 값을 고치고, 개발 서버를 껐다 켠 뒤 새로고침합니다.
   - 키 값은 이 화면에 나오지 않습니다.

## 2단계. DB 테이블 만들기

SQL 파일 두 개를 **순서대로 한 번씩** 실행합니다.

1. Supabase 프로젝트 왼쪽 메뉴의 **SQL Editor**를 열고 **New query**를 누릅니다.
2. PowerShell(미유 폴더)에서 첫 번째 파일 내용을 클립보드에 복사합니다.

   ```powershell
   Get-Content supabase\migrations\20261011000000_init.sql -Raw -Encoding UTF8 | Set-Clipboard
   ```

3. SQL Editor에 붙여넣고(`Ctrl + V`) **Run**을 누릅니다. 아래쪽에 `Success. No rows returned`가 나오면 성공입니다.
   - 실행 전 "destructive operation" 확인 창이 뜨면, 이 파일은 미유 테이블을 새로 만들고 권한을 정리하는 내용이므로 확인을 누르면 됩니다. 다른 프로젝트의 SQL이 아닌지만 확인하세요.
4. **New query**로 새 창을 열고, 두 번째 파일(가입 동의 기록)도 같은 방법으로 실행합니다.

   ```powershell
   Get-Content supabase\migrations\20261012000000_consents.sql -Raw -Encoding UTF8 | Set-Clipboard
   ```

5. `/setup`을 새로고침합니다. **DB 상태**에 표 7개(`profiles` `assessments` `user_regions` `orders` `payment_events` `reports` `user_consents`)가 모두 "있음"이면 2단계 완료입니다.
   - 이미 실행한 파일을 다시 실행하면 "already exists" 오류가 납니다. 표가 모두 "있음"이면 그대로 두면 됩니다.
   - 첫 번째 파일 실행 중 오류가 났다면, 두 번째 파일로 넘어가지 말고 오류 문구를 알려주세요 (키 값은 보내지 않습니다).

### 2단계 추가 — 나중에 생긴 DB 변경 (3~15번)

기능이 추가되면서 SQL 파일이 더 생겼습니다. **어디까지 적용했는지 먼저 확인하세요 — `supabase/check-migrations.sql`을 SQL Editor에서 실행하면 번호별 "적용됨 / 아직 안 함 / 일부만"이 나옵니다 (읽기 전용, 자세한 순서는 [`update-guide.md`](./update-guide.md) 2장).** **이미 적용한 파일은 다시 실행하지 않고, 아직 안 한 것만 번호 순서대로 한 번씩** 실행합니다. 방법은 위와 같습니다 (New query → 아래 명령으로 복사 → 붙여넣기 → Run → `Success`).
기존 회원 · 검사 · 주문 데이터는 지우거나 바꾸지 않습니다. 파일을 고쳐서 다시 실행하라는 안내는 하지 않습니다. 바뀐 내용은 항상 새 파일로 추가됩니다.

| 번호 | 파일 | 하는 일 |
| --- | --- | --- |
| 3 | `20261013000000_profile_backfill.sql` | 테이블을 만들기 전에 가입한 회원의 빠진 프로필만 채웁니다 |
| 4 | `20261014000000_payment_env.sql` | 주문에 결제 환경(내 테스트 키 / 토스 문서 예제 키 / 실결제)을 기록할 칸을 추가합니다 |
| 5 | `20261015000000_personal_context.sql` | ‘내 고민 자세히 알려주기’(선택 입력)를 저장할 표를 만듭니다. 본인만 보고 · 고치고 · 지울 수 있습니다 |
| 6 | `20261016000000_ops_events.sql` | 운영 기록(결제 재확인 결과 · 오류번호 · 알림 이력) 표를 만듭니다. 서버만 읽고 쓰며 고치거나 지울 수 없습니다 |
| 7 | `20261017000000_ai_usage.sql` | AI 호출 기록(횟수 · 토큰 · 예상 비용) 표와 색인을 만듭니다. 고객 정보는 담지 않습니다 |
| 8 | `20261018000000_funnel_feedback.sql` | 방문 단계 기록 · 구매 후 만족도 표와, 주문에 유입 출처를 적을 칸을 추가합니다 |
| 9 | `20261019000000_performance.sql` | 하루 AI 비용 합계 함수와 결제 재확인용 색인을 더합니다 |
| 10 | `20261020000000_account_withdrawal.sql` | 회원 탈퇴(개인정보 삭제 + 주문 · 결제 기록만 분리 보관)를 처리하는 DB 함수를 더합니다. 실행만으로는 아무 데이터도 바뀌지 않습니다 |
| 12 | `20261022000000_talk_rooms.sql` | 로그인한 회원의 대화(상담방마다 눌렀던 행동 + 자유 질문 · 미유의 답)를 서버에 저장하는 표와, 자유 질문의 하루 횟수를 세는 표(질문 내용은 담지 않음)를 만들고, 탈퇴 함수에 대화 삭제를 더합니다. 그래야 폰을 바꿔도 대화가 이어집니다. 실행만으로는 기존 데이터가 바뀌지 않습니다 |
| 11 | `20261021000000_concern_records.sql` | ‘내 고민 자세히 알려주기’에서 새 리포트를 발급할 때 "그때의 고민"을 저장해 두는 표(고민 기록)를 만들고, 탈퇴 함수에 고민 기록 삭제를 더합니다. 기록은 만든 뒤 고쳐지지 않고 본인이 내용만 지울 수 있습니다. 실행만으로는 기존 데이터가 바뀌지 않습니다 |

```powershell
Get-Content supabase\migrations\20261013000000_profile_backfill.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261014000000_payment_env.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261015000000_personal_context.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261016000000_ops_events.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261017000000_ai_usage.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261018000000_funnel_feedback.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261019000000_performance.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261020000000_account_withdrawal.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261021000000_concern_records.sql -Raw -Encoding UTF8 | Set-Clipboard
Get-Content supabase\migrations\20261022000000_talk_rooms.sql -Raw -Encoding UTF8 | Set-Clipboard
```

(여러 줄을 한꺼번에 붙여넣지 말고, **한 줄 실행 → SQL Editor에서 Run → 다음 줄** 순서로 합니다.)

- 6~11번을 아직 안 했어도 결제 · 리포트 · MY는 그대로 동작합니다 (코드가 먼저 올라가고 DB 변경이 늦어도 주문 생성이 막히지 않도록 확인했습니다). 해당 번호를 적용하기 전에는 운영 기록 · AI 사용 기록 · 방문 단계 · 만족도가 쌓이지 않거나 집계가 비어 보일 뿐입니다. `/setup`의 DB 상태에서 `ops_events` 등으로 확인합니다.
- 5번을 아직 안 했어도 다른 화면은 그대로 동작합니다. 다만 ‘내 고민 자세히 알려주기’ 저장이 "DB 변경 5번을 먼저 적용해야 합니다"라고 안내합니다. `/setup`의 DB 상태에서 `personal_contexts` 상태로도 확인할 수 있습니다.
- 13번(결제한 질문 장부)을 아직 안 했어도 다른 화면은 그대로 동작합니다. 유료 질문(질문 한 개당 결제)만 막혀 결제도 시작되지 않으며, 방의 무료 질문을 다 쓰면 "무료 질문을 모두 썼어요"와 리포트 구매 안내만 보입니다 (`/setup`에서 `cash_wallets` 상태로 확인).
- 14번(채팅 요약 저장)을 아직 안 했어도 대화 · 질문은 그대로 동작합니다. [저장하기]만 "채팅 요약 저장을 준비하고 있어요"로 막히고 저장하지 않고 끝내기는 됩니다 (`/setup`에서 `chat_summaries` 상태로 확인).
- 15번(운영자 수동 질문 반영 — 결제는 됐는데 질문이 안 들어간 주문에 결제사 확인 뒤 `/admin`에서 질문 1개 넣기)을 아직 안 했어도 다른 기능은 그대로 동작합니다. 그 버튼만 "15번 파일을 먼저 실행하세요"로 막힙니다. 파일: `supabase/migrations/20261025000000_admin_credit_question.sql`.
- 12번을 아직 안 했어도 결제 · 리포트 · MY · 대화는 동작합니다. 대화가 이 기기 브라우저에만 남고(폰을 바꾸면 이어지지 않음) 자유 질문 입력은 "준비 중"으로 보입니다 (`/setup`에서 `talk_rooms` 상태로 확인).
- 11번을 아직 안 했어도 결제 · 리포트 · MY와 고민을 적고 저장하는 것은 동작합니다. 새 리포트 발급만 "DB 변경 11번을 먼저 적용해야 합니다"로 막히고 결제는 시작되지 않습니다 (`/setup`에서 `concern_records` 상태로 확인).

## 3단계. 카카오 로그인 켜기

**카카오디벨로퍼스**(https://developers.kakao.com)에서:

1. **애플리케이션 추가하기**로 앱을 만듭니다 (앱 이름 예: 미유).
2. **앱 설정 → 플랫폼 키**에서 **REST API 키**를 확인합니다. Supabase의 Client ID로 씁니다.
3. REST API 키 설정 화면의 **카카오 로그인 Redirect URI**에 **① Supabase Callback URL**을 등록합니다.
   주소는 Supabase → Authentication → Providers → Kakao 화면의 **Callback URL**을 복사하거나, `/setup` 화면의 ①을 복사합니다.
   (여기에 `localhost:3000` 주소를 넣는 것이 아닙니다.)
4. 같은 곳에서 **클라이언트 시크릿** 코드를 만들고 사용 상태로 둡니다.
5. **카카오 로그인**을 사용(ON)으로 켭니다.
6. **동의항목**
   - 닉네임(`profile_nickname`), 프로필 사진(`profile_image`)을 설정합니다.
   - 닉네임(`profile_nickname`) · 프로필 사진(`profile_image`)을 **선택 동의**로 둡니다.
   - 이메일(`account_email`)은 **필요 없습니다.** 비즈 앱 전환도 필요 없습니다. 미유 코드는 카카오에 닉네임 · 프로필 사진만 요청하도록 고정되어 있습니다 (`server/kakao-options.ts`).
     Supabase 기본 설정은 이메일을 함께 요청해 KOE205 오류가 나는데, 미유는 요청 범위를 직접 지정해 이 문제를 피합니다 (운영자가 실제 로그인 · 재로그인으로 확인, 자동 테스트로 고정).

**Supabase**에서:

7. **Authentication → Sign In / Providers → Kakao**를 켭니다.
8. Client ID(REST API Key)에 카카오 REST API 키, Client Secret에 카카오 클라이언트 시크릿을 **직접** 입력합니다.
9. **Allow users without an email**을 켭니다. 미유는 이메일이 아니라 내부 회원번호로 회원을 구분하므로, 이메일 제공을 거절한 고객도 가입됩니다.
10. 저장 후 `/setup` 새로고침 → 3단계 완료 확인.

## 4단계. 미유 로그인 완료 주소 등록

Supabase **Authentication → URL Configuration**에서:

1. **Site URL**: `http://localhost:3000`
2. **Redirect URLs**에 추가: `http://localhost:3000/auth/callback` ← **② 미유 로그인 완료 주소**
3. 저장합니다. 이 단계는 5단계에서 로그인과 약관 동의를 실제로 마치면 `/setup`에 완료로 표시됩니다.

## 5단계. 카카오 로그인과 결과 저장 확인

1. http://localhost:3000/analyze 에서 검사를 끝까지 진행합니다.
2. 무료 요약 아래 **카카오로 로그인하고 저장**을 누르고, 카카오 로그인을 합니다.
3. 처음 가입이면 **가입 동의** 화면이 나옵니다. 필수 항목 3개에 체크하고 **동의하고 시작하기**.
4. 결과 화면(`/results/...`)으로 돌아오면 저장 완료입니다.
5. **MY**에서 결과가 보이는지 확인 → **로그아웃** → 다시 **카카오로 로그인**하면 같은 결과가 보여야 합니다.
6. Supabase **Table Editor**에서 `assessments`와 `user_consents`에 기록이 생겼는지 확인합니다.
7. `/setup` 새로고침 → 4 · 5단계 완료 확인.

여기까지 확인되면 결제로 넘어갑니다.

### 5단계 추가(선택) — 이메일 로그인(자체 로그인) 켜기

카카오 없이 이메일 · 비밀번호로도 가입하고 로그인할 수 있게 하는 설정입니다. 코드는 이미 있고, **Supabase에서 메일이 나가도록 설정하는 것만** 운영자 몫입니다.

1. Supabase **Authentication → Providers → Email**이 켜져 있는지 확인합니다 (기본값은 켜짐).
2. **Confirm email**(이메일 확인)을 **켜 둡니다** — 가입한 사람이 메일의 링크를 눌러야 가입이 끝납니다. (개발 중에 메일 없이 시험하려면 끌 수 있지만 공개 배포 전에는 켭니다.)
3. 4단계에서 등록한 **Redirect URLs**에 `http://localhost:3000/auth/callback`(배포 후에는 실제 주소)이 들어 있으면 이메일 링크도 같은 주소로 돌아옵니다. 추가할 것은 없습니다.
4. **실제 메일 발송**: Supabase 기본 메일 발송은 시간당 몇 통으로 제한되어 있어 **공개 서비스에는 맞지 않습니다.** **Authentication → Emails → SMTP Settings**에서 내가 쓰는 메일 서비스(SMTP) 정보를 넣어야 합니다. 이 값은 대화창에 붙여넣지 말고 Supabase 화면에만 직접 입력합니다. (이 단계는 메일 서비스를 정한 뒤에 합니다 — 정하기 전에는 이메일 가입 · 재설정 메일이 가지 않습니다.)
5. 메일 제목 · 본문은 **Authentication → Emails → Templates**에서 고칠 수 있습니다 (한국어로 바꾸는 것을 권장).
6. 확인: `http://localhost:3000/auth/email?mode=signup`에서 가입 → 메일의 링크를 **같은 브라우저**에서 열기 → 가입 동의 → 로그인 완료. 메일의 링크를 다른 브라우저(메일 앱 안의 브라우저 등)에서 열면 로그인 정보가 없어 실패하고 "다시 시도해 주세요"가 나옵니다. 그때는 같은 브라우저에서 다시 요청하면 됩니다.

비밀번호는 미유가 보관하지 않고 Supabase가 암호화된 값으로만 보관합니다. 카카오로 가입한 회원은 이메일이 없으므로 같은 사람이 두 방법으로 가입하면 **서로 다른 계정**이 됩니다(계정 합치기는 만들지 않았습니다).

## 6단계. 토스페이먼츠 테스트 키 입력

1. https://developers.tosspayments.com 에 가입합니다 (사업자 등록 전에도 테스트 키는 바로 받을 수 있습니다).
2. **API 키** 메뉴에서 **결제위젯 연동 키**의 테스트 키를 확인하고 `.env.local`에 **직접** 입력합니다.

   | `.env.local` 이름 | 값 |
   | --- | --- |
   | `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 클라이언트 키 `test_gck_…` |
   | `TOSS_SECRET_KEY` | 시크릿 키 `test_gsk_…` (서버 전용) |

   `test_ck_` / `test_sk_`(API 개별 연동 키)가 아니라 **위젯 키**(`gck` / `gsk`)를 씁니다. `PAYMENTS_LIVE_MODE`는 `false` 그대로 둡니다.
3. 개발 서버를 껐다 켜고 `/setup`에서 6단계 완료 확인.
4. 결제수단은 **결제위젯 어드민**에서 정합니다. 카드를 기본으로 두고, 간편결제는 계약 · 심사가 끝난 뒤 추가합니다 (코드 수정 없음).

## 7단계. 테스트 결제와 리포트 확인

1. 5단계에서 저장한 결과 화면에서 **개인 통합 리포트 전체 보기 · 9,900원**을 누릅니다.
2. 토스 결제 화면에서 테스트 결제를 진행합니다 (테스트 키라 실제로 돈이 나가지 않습니다).
3. 결제가 끝나면 같은 화면에 개인 통합 리포트가 나타납니다. 새로고침해도 같은 내용이어야 합니다.
4. Supabase **Table Editor**의 `orders`(status = paid)와 `reports`(status = ready)를 확인합니다.
5. `/setup`에서 7단계까지 완료되면 로컬 설정이 끝난 것입니다.

웹훅은 공개 주소가 생긴 뒤(배포 후)에 등록합니다: 개발자센터 → 웹훅 → `https://실제주소/api/webhooks/toss`, 이벤트 `PAYMENT_STATUS_CHANGED`. 로컬 주소는 웹훅에 등록할 수 없고, 웹훅 없이도 결제 승인은 동작합니다.

---

## 문제가 생기면

화면에 나온 문구와 `/setup` 화면의 상태(입력됨 · 비어 있음 · 형식 확인 필요)를 알려주세요. **키 값은 보내지 마세요.**

| 증상 | 확인할 것 |
| --- | --- |
| 카카오 화면에서 "Redirect URI 불일치" (KOE006 등) | 카카오디벨로퍼스에 ① 주소가 정확히 등록됐는지 |
| 카카오 화면에서 동의 항목 오류 (KOE205) | 최신 코드인지 (`server/kakao-options.ts`가 있어야 함), 카카오 동의항목에 닉네임 · 프로필 사진이 설정됐는지 |
| 로그인 후 미유 첫 화면으로만 돌아오고 로그인이 안 됨 | Supabase Redirect URLs에 ② 주소가 있는지 |
| "로그인 설정 전"이 계속 보임 | `.env.local` 저장 후 개발 서버를 다시 켰는지 |
| 결과 저장 시 오류 | 2단계 SQL 두 개를 모두 실행했는지 (`/setup`의 DB 상태) |

## 공개 배포(Vercel)는 승인 후

공개 배포는 운영자 확인 후 진행합니다. 그때는:

- Vercel 프로젝트의 Root Directory를 `miyu`로 지정
- Project Settings → Environment Variables에 `.env.local`과 같은 이름으로 값 입력 (`SITE_URL`은 실제 주소)
- Supabase Site URL · Redirect URLs에 실제 주소 추가, 카카오에는 실제 사이트 도메인 등록, 토스 웹훅 주소 등록
- `/setup` 화면은 운영 빌드에서 열리지 않습니다


---

## 운영 설정 (공개 배포 전 · 나중에)

아래 값은 `.env.local`(로컬) 또는 Vercel 환경변수(배포)에 넣습니다. 키 · 토큰 값은 대화창에 붙여넣지 않습니다. 이름과 설명은 `.env.example`에 있습니다.

| 이름 | 무엇에 쓰나 | 얻는 곳 |
| --- | --- | --- |
| `ADMIN_USER_IDS` | 관리자 화면(`/admin`)에 들어갈 회원 번호. 비워 두면 아무에게도 열리지 않습니다 | Supabase → Authentication → Users에서 내 계정의 **User UID** (카카오로 한 번 로그인한 뒤) |
| `CRON_SECRET` | 정기 점검 주소(`/api/cron/reconcile`)의 인증값. 길고 추측하기 어려운 무작위 문자열 | PowerShell: `[Convert]::ToBase64String((1..32 \| ForEach-Object { Get-Random -Maximum 256 }))` 로 만들어 환경변수에 넣기 |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | 운영 알림(결제 확인 필요 · 리포트 실패 · 새 구매 중단). 둘 다 있을 때만 텔레그램으로 보내고, 없으면 서버 로그에만 남깁니다 | 텔레그램 BotFather로 봇 만들기 → 내 채팅 번호 확인 |
| `AI_CHAT_EXTRA_QUESTIONS` | **실제 AI 시험 중에만** 열린 방마다 무료 질문을 이만큼 더 줍니다. 비우면 0. 방마다 무료 질문 수는 코드(`lib/config/product.ts`의 `CHAT_ROOMS`)에서 정하고, 다 쓰면 질문 한 개당 결제(300원)로 이어 갑니다 | 시험이 끝나면 비웁니다 |
| `AI_CHAT_PROVIDER` · `ANTHROPIC_API_KEY` · `AI_CHAT_APPROVED_KRW` · `AI_CHAT_APPROVED_CALLS` · `AI_CHAT_APPROVED_FROM` · `AI_CHAT_APPROVED_THROUGH` | **자유 질문의 실제 AI(Claude) 시험.** 제공사 `anthropic` · 키 · 승인 금액(원) · 승인 호출 수 · 승인 기간(한국 날짜)을 **운영자가 직접** 적어야만 연결됩니다. 하나라도 비어 있거나 상한(1,500원 · 40회 · 3일)을 넘으면 연결되지 않고 입력창은 "준비 중"으로 보입니다. 키는 대화에 붙여넣지 않습니다 | Anthropic 콘솔에서 키 발급(이미 비교 실험에 쓴 `ANTHROPIC_API_KEY`와 같은 값). 승인 값은 `docs/ai-quality-comparison-plan.md` 8-5의 제안을 확인한 뒤 적습니다 |
| `AI_MAX_CONCURRENT` · `AI_SALE_QUEUE_LIMIT` · `AI_DAILY_BUDGET_KRW` 등 | AI를 연결한 뒤의 동시 생성 · 새 구매 중단 · 하루 예산 한도 (`.env.example` 참고) | AI 제공사를 정하고 승인한 뒤 가격표를 보고 정합니다 |

정기 점검은 배포 후 Vercel Cron(또는 외부 예약 실행)으로 **5~10분마다** `GET /api/cron/reconcile`을 `Authorization: Bearer <CRON_SECRET>`와 함께 호출하게 합니다. 이 작업이 (1) 결제사에서는 승인됐는데 우리 쪽에 반영되지 않은 주문을 맞추고 (2) 고객이 화면을 열지 않아 멈춰 있는 리포트를 이어서 만들고 (3) 실패 · 지연 리포트를 운영자에게 알립니다. 자세한 운영 절차는 [`runbook.md`](./runbook.md).
