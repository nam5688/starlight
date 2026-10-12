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
   - 카카오계정 이메일(`account_email`)을 **선택 동의**로 설정합니다. Supabase는 카카오 로그인 때 이메일 항목을 기본으로 함께 요청하므로, 이 항목이 없으면 로그인 단계에서 동의 항목 오류가 날 수 있습니다. 이메일 항목은 비즈 앱에서만 열리므로 필요하면 **비즈 앱 전환**(개인 개발자도 가능)을 진행합니다.

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
| 카카오 동의 화면에서 동의 항목 오류 | 카카오 동의항목에 이메일(선택 동의)이 설정됐는지, 비즈 앱 전환 여부 |
| 로그인 후 미유 첫 화면으로만 돌아오고 로그인이 안 됨 | Supabase Redirect URLs에 ② 주소가 있는지 |
| "로그인 설정 전"이 계속 보임 | `.env.local` 저장 후 개발 서버를 다시 켰는지 |
| 결과 저장 시 오류 | 2단계 SQL 두 개를 모두 실행했는지 (`/setup`의 DB 상태) |

## 공개 배포(Vercel)는 승인 후

공개 배포는 운영자 확인 후 진행합니다. 그때는:

- Vercel 프로젝트의 Root Directory를 `miyu`로 지정
- Project Settings → Environment Variables에 `.env.local`과 같은 이름으로 값 입력 (`SITE_URL`은 실제 주소)
- Supabase Site URL · Redirect URLs에 실제 주소 추가, 카카오에는 실제 사이트 도메인 등록, 토스 웹훅 주소 등록
- `/setup` 화면은 운영 빌드에서 열리지 않습니다
