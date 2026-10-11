# 외부 서비스 연결 안내 (Supabase · 카카오 · 토스페이먼츠)

코드는 준비되어 있고, 아래 계정 설정과 키 입력만 하면 카카오 로그인 · 결과 저장 · 테스트 결제가 동작합니다.
모든 설정은 각 서비스의 웹사이트(브라우저)에서 하고, 키는 내 컴퓨터의 `.env.local` 파일에만 적습니다.

> 비밀키(Supabase secret key, 토스 시크릿 키)는 대화창 · 코드 · 스크린샷 · 메신저에 붙여넣지 마세요.
> 실결제(live 키)는 PG 계약·심사가 끝나고 운영자가 승인하기 전까지 넣지 않습니다. 앱도 테스트 키만 받도록 막혀 있습니다.

각 서비스 화면의 메뉴 이름은 바뀔 수 있습니다. 아래와 다르면 각 서비스의 공식 안내를 기준으로 하세요.

---

## 1. Supabase — 회원 · 결과 저장

1. https://supabase.com 에 가입하고 **New project**를 만듭니다. 지역은 **Northeast Asia (Seoul)** 를 고릅니다.
2. 프로젝트의 **SQL Editor**를 열고, `miyu/supabase/migrations/20261011000000_init.sql` 파일 내용을 전부 붙여넣은 뒤 **Run**을 누릅니다. (표 · 접근 정책이 만들어집니다. 한 번만 실행)
3. **Project Settings → API Keys**(또는 Data API)에서 아래 세 값을 확인합니다.
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key → `SUPABASE_SECRET_KEY` (서버 전용, 절대 공개 금지)
4. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (배포 후에는 실제 주소로 바꿈)
   - Redirect URLs에 추가: `http://localhost:3000/auth/callback` (배포 후 `https://실제주소/auth/callback`도 추가)

## 2. 카카오 — 로그인

1. https://developers.kakao.com 에서 **애플리케이션 추가하기**로 앱을 만듭니다.
2. **앱 설정 → 플랫폼 키**의 **REST API 키**를 확인합니다 (Supabase의 Client ID로 씀).
3. REST API 키 설정에서 **카카오 로그인 Redirect URI**에 아래 주소를 등록합니다.
   `https://<Supabase 프로젝트 주소>.supabase.co/auth/v1/callback`
4. **클라이언트 시크릿** 코드를 만들고 활성화합니다 (Supabase의 Client Secret으로 씀).
5. **제품 설정 → 카카오 로그인**을 켭니다.
6. **동의항목**
   - 닉네임(`profile_nickname`), 프로필 사진(`profile_image`)을 설정합니다.
   - 카카오계정(이메일, `account_email`)을 **선택 동의**로 설정합니다.
     Supabase는 카카오 로그인 때 이메일 동의 항목을 기본으로 함께 요청하므로, 이 항목이 없으면 로그인 단계에서 동의 항목 오류가 날 수 있습니다.
     이메일 항목은 비즈 앱에서만 열리므로, 필요하면 **비즈 앱 전환**(개인 개발자도 가능)을 진행합니다.
   - 고객이 이메일 제공을 거절해도 가입되도록 다음 단계의 설정을 켭니다. 미유는 이메일이 아니라 내부 회원번호로 회원을 구분합니다.

## 3. Supabase에 카카오 연결

1. Supabase **Authentication → Providers(Sign In / Providers) → Kakao**를 켭니다.
2. Client ID = 카카오 REST API 키, Client Secret = 카카오 클라이언트 시크릿을 넣습니다.
3. **Allow users without an email**을 켭니다.

## 4. 토스페이먼츠 — 테스트 결제

1. https://developers.tosspayments.com 에 가입합니다 (사업자 등록 전에도 테스트 키는 바로 받을 수 있습니다).
2. **API 키** 메뉴에서 **결제위젯 연동 키**(주문서형)의 테스트 키를 확인합니다.
   - 클라이언트 키 `test_gck_...` → `NEXT_PUBLIC_TOSS_CLIENT_KEY`
   - 시크릿 키 `test_gsk_...` → `TOSS_SECRET_KEY` (서버 전용)
   - `test_ck_` / `test_sk_`(API 개별 연동 키)가 아닌 **위젯 키**를 씁니다.
3. 결제수단은 **결제 UI 설정(상점관리자 · 결제위젯 어드민)**에서 정합니다. 카드를 기본으로 두고, 간편결제는 계약 · 심사가 끝난 뒤 추가합니다. (코드 수정 없이 반영)
4. 웹훅은 공개 주소가 생긴 뒤(배포 후) 등록합니다: 개발자센터 → 웹훅 → `https://실제주소/api/webhooks/toss`, 이벤트 `PAYMENT_STATUS_CHANGED`.
   로컬 주소(`localhost`)는 웹훅에 등록할 수 없습니다. 웹훅 없이도 결제 승인은 동작하고, 웹훅은 응답 유실 · 취소를 맞추는 보조 수단입니다.

## 5. 내 컴퓨터에 키 넣기 (Windows PowerShell)

`miyu` 폴더에서:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

메모장에서 위에서 확인한 값을 `=` 뒤에 붙여넣고 저장합니다. 그리고 `SITE_URL=http://localhost:3000`을 적습니다.
실행 중인 `npm run dev`가 있으면 `Ctrl + C`로 끄고 다시 실행합니다.

```powershell
npm run dev
```

## 6. 확인 순서

1. http://localhost:3000/analyze → 검사를 마치고 **카카오로 로그인하고 저장**
2. 카카오 로그인 후 결과 화면(`/results/...`)으로 돌아오면 저장 완료
3. **9,900원 결제하기** → 토스 결제 화면에서 테스트 결제 (실제로 돈이 나가지 않음)
4. 결제가 끝나면 같은 화면에 개인 통합 리포트가 나타남
5. **MY**에서 저장한 결과와 리포트를 다시 열 수 있음
6. Supabase **Table Editor**에서 `assessments`, `orders`, `reports` 표에 기록이 생겼는지 확인

문제가 생기면 화면에 나온 문구와 함께 알려주세요. 키 값은 보내지 마세요.

## 7. 배포(Vercel)는 승인 후

공개 배포는 운영자 확인 후 진행합니다. 배포할 때는:

- Vercel 프로젝트의 Root Directory를 `miyu`로 지정
- Project Settings → Environment Variables에 `.env.local`과 같은 이름으로 값 입력 (`SITE_URL`은 실제 주소)
- Supabase Redirect URLs, 카카오 Redirect URI · 사이트 도메인, 토스 웹훅 주소를 실제 주소로 추가
