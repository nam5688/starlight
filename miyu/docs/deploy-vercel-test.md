# Vercel 테스트 배포 안내 (나만 보는 링크 · 실결제 없음)

> 2026-10-16 작성. 목적: **작업 브랜치(`claude/miyu-claude-code-setup-klw8ms`)의 커밋 `8128fab` 또는 그 이후 버전**을 나만 볼 수 있는 주소로 올려 실제 환경(Supabase · 토스 **테스트 키** · 실제 AI)에서 시험한다.
> 실결제 켜기 · 공개 배포는 이 문서의 범위가 아니다(운영자 확인 전에는 하지 않는다). 키 · 비밀값은 **운영자가 Vercel 화면에 직접** 입력하고 대화에 붙여넣지 않는다.
> 한 번에 한 단계씩 진행한다. 다음 단계는 앞 단계를 마친 뒤에 본다.

## 0. 먼저 확인한 것 (직접 조회한 사실 · 공식 문서)

| 확인한 것 | 출처 | 그래서 |
| --- | --- | --- |
| GitHub 기본 브랜치 **`main`에는 `miyu/` 폴더가 없다.** 예전 템플릿(Astro Starlight)만 있고 마지막 커밋은 2025-08-11(Netlify 봇)이다 | GitHub에서 직접 조회(2026-10-16) | Vercel이 기본 브랜치를 배포하면 **미유가 아닌 코드**가 올라가거나 빌드가 실패한다. 아래 2 · 3단계가 이것을 막는다 |
| 작업 브랜치의 맨 위 커밋이 `8128fab`이었고(2026-10-16 조회), 이 안내를 만든 커밋이 그 뒤에 이어진다 | GitHub에서 직접 조회 | 배포된 커밋 번호가 `8128fab`이거나 그 뒤여야 한다(9단계에서 `/admin`으로 확인) |
| 저장소 `nam5688/starlight`는 **공개(public)** 이다 | GitHub 조회 | 코드 · 문서(가격 가설 · 운영 절차 포함)를 누구나 읽을 수 있다. 비밀키는 저장소에 올라가 있지 않다(`.env.local`은 올라가지 않는다). **비공개로 바꾸면 Vercel Hobby에서 배포가 막힐 수 있다** — 아래 "알려진 한계" |
| Vercel은 처음 가져올 때 **Production 브랜치(기본 `main`)** 를 배포한다. 그 밖의 브랜치는 Preview다 | Vercel 문서 | 2 · 3단계에서 Production 브랜치를 작업 브랜치로 바꾼다 |
| **정기 실행(Cron)은 Production 배포의 주소만 부른다.** Hobby는 하루 한 번만, 정해진 시(時) 안의 아무 때나(±59분) 실행한다. `CRON_SECRET`을 넣으면 Vercel이 `Authorization: Bearer …`로 자동으로 보낸다 | Vercel 문서 | 테스트 배포도 Production으로 만들어야 정기 점검이 돈다. 이 저장소의 `vercel.json`은 하루 한 번(UTC 18:17 = 한국 03:17 무렵)이다 |
| 배포 보호 기본값(Standard)은 **Production 도메인을 보호하지 않는다.** "All Deployments"로 바꿔야 Production 주소도 Vercel 로그인한 사람만 본다(모든 요금제 · 추가 비용 없음) | Vercel 문서 | 5단계에서 바꾼다. 보호를 켜면 **토스 웹훅 같은 외부 서버의 호출도 막힌다**(우리는 웹훅에 기대지 않는 구조라 시험에는 문제가 없다) |
| 커밋 · 브랜치 이름을 앱이 읽으려면 **"Enable access to System Environment Variables"** 가 켜져 있어야 한다. 환경변수를 바꾼 뒤에는 **다시 배포해야** 반영된다 | Vercel 문서 | 4단계 |
| Vercel 함수 실행 시간: **Hobby · Pro 기본 300초, Hobby 최대도 300초**(Pro 최대 800초) | Vercel 문서 | 실제 AI 리포트 생성이 300초를 넘으면 잘린다 → `AI_GENERATION_TIMEOUT_SECONDS=270`(아래 표). **실제 생성 시간은 아직 재지 못했다** |

**확인하지 못한 것**: 보호된 배포에서도 Vercel의 정기 실행이 도는지(문서에 적혀 있지 않다 — `/admin`의 "정기 점검 마지막 실행"으로 첫 하루 뒤 확인), 이 계정의 요금제(Hobby로 가정했다), Vercel 화면의 메뉴 이름이 이 안내와 다를 수 있는 것.

## 1단계 — Vercel 가입 · GitHub 연결

1. https://vercel.com 에서 **GitHub 계정으로 가입**한다(Hobby = 무료 플랜).
2. GitHub가 "Vercel이 저장소에 접근해도 되나요?"를 물으면 **`nam5688/starlight` 저장소**만 허용한다.

## 2단계 — 프로젝트 가져오기 (⚠ Root Directory를 `miyu`로)

1. Vercel 대시보드 → **Add New → Project** → `nam5688/starlight` 옆 **Import**.
2. **Root Directory → Edit → `miyu` 선택.** (이걸 안 하면 저장소 맨 위의 예전 템플릿을 빌드한다.) 프레임워크는 Next.js로 자동 인식된다.
3. 환경변수는 이 화면에서 넣지 않아도 된다(4단계에서 한다). **Deploy**를 누른다.
4. **첫 배포는 빨간색(실패)이어도 정상이다.** 처음에는 기본 브랜치 `main`을 배포하는데 거기에는 `miyu/`가 없다. 실패한 배포는 그대로 둔다 — 아무것도 공개되지 않는다.

## 3단계 — Production 브랜치를 작업 브랜치로 바꾸기

1. 프로젝트 → **Settings → Environments → Production → Branch Tracking**(메뉴 이름이 다르면 "Production Branch"를 찾는다).
2. 브랜치를 **`claude/miyu-claude-code-setup-klw8ms`** 로 바꾸고 저장한다.
3. 이제 이 브랜치에 올라온 커밋은 **Production 배포**가 되고(정기 점검이 돈다), `main`에 올라오는 것은 Preview로만 남는다.

## 4단계 — 환경변수 입력 (값은 직접, 대화에 붙여넣지 않는다)

1. 프로젝트 → **Settings → Environment Variables**.
2. **"Enable access to System Environment Variables"를 켠다**(배포된 커밋 번호를 `/admin`에서 보려면 필요).
3. 아래 표의 이름을 **Production** 범위로 입력한다(`NEXT_PUBLIC_` 이름 외에는 값이 화면에 다시 보이지 않게 Sensitive로 저장하는 것이 좋다).

| 이름 | 값을 얻는 곳 / 메모 |
| --- | --- |
| `SITE_URL` | 이 프로젝트의 Production 주소(`https://<프로젝트이름>.vercel.app`). 로그인 뒤 돌아올 주소로 쓴다 |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` | Supabase → 프로젝트 설정 → API (이미 쓰는 값과 같다). **secret key에는 `NEXT_PUBLIC_`를 붙이지 않는다** |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` · `TOSS_SECRET_KEY` | 토스 개발자센터의 **테스트 키**(`test_gck_…` · `test_gsk_…`). 라이브 키는 넣지 않는다 |
| `PAYMENTS_LIVE_MODE` | **비워 두거나 `false`.** `true`로 바꾸지 않는다(실결제는 운영자 승인 전에는 열지 않는다) |
| `CRON_SECRET` | 길고 추측하기 어려운 무작위 문자열. PowerShell: `[Convert]::ToBase64String((1..32 \| ForEach-Object { Get-Random -Maximum 256 }))` |
| `ADMIN_USER_IDS` | Supabase → Authentication → Users에서 내 계정의 User UID |
| `AI_PROVIDER` · `AI_CHAT_PROVIDER` · `ANTHROPIC_API_KEY` · `AI_APPROVED_KRW` · `AI_APPROVED_CALLS` · `AI_APPROVED_FROM` · `AI_APPROVED_THROUGH` | 실제 AI(Claude)를 쓸 때만. 승인 금액 · 호출 수 · 기간은 운영자가 직접 적은 값이어야 하고 코드 상한(5,000원 · 60회 · 7일)을 넘으면 연결되지 않는다 |
| `AI_GENERATION_TIMEOUT_SECONDS` | **`270`** — Vercel 함수는 300초에서 끊기므로 앱이 먼저 실패로 정리하게 한다(고객은 "다시 만들기"를 누를 수 있다) |
| `TOSS_WIDGET_VARIANT_KEY` | 비워 둔다. 토스 어드민에서 카드만 있는 결제 UI를 새로 만들었을 때만 그 이름을 적는다([`setup-guide.md`](./setup-guide.md)) |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | (선택) 운영 알림 |

환경변수를 저장해도 **이미 만든 배포에는 반영되지 않는다.** 5단계 뒤 배포를 시작하면 새 값으로 만들어진다.

## 5단계 — 나만 보게 보호하기

1. **Settings → Deployment Protection** → 보호 범위를 **All Deployments**로, 방법은 **Vercel Authentication**으로 저장한다.
2. 이제 주소를 열면 Vercel 로그인 화면이 먼저 나오고, 내 Vercel 계정으로 로그인한 사람만 볼 수 있다(Password Protection은 Hobby에서 쓸 수 없다).
3. **이 보호 때문에 토스 웹훅은 서버에 닿지 않는다.** 시험에서는 괜찮다 — 환불 · 승인은 웹훅이 아니라 결제 재조회로 맞춘다(질문을 쓰기 직전에도 한 번 더 확인한다). 라이브 전에 웹훅을 받아야 하면 보호 방법을 다시 정해야 한다(별도 결정).

## 6단계 — 배포 시작

1. 3 · 4 · 5단계를 마쳤으면 저에게 **"브랜치 바꿨어요"** 라고 알려 주세요. 작업 브랜치에 작은 기록 커밋을 올리면 Vercel이 자동으로 Production 배포를 만듭니다. (Vercel의 Deploy Hooks로 직접 시작하는 방법도 있다 — Settings → Git → Deploy Hooks, 브랜치는 작업 브랜치로. 이 주소는 아는 사람 누구나 배포를 시작할 수 있으니 비밀로 둔다.)
2. 프로젝트 → **Deployments**에서 새 배포의 **Environment = Production**, **Branch = `claude/miyu-claude-code-setup-klw8ms`** 인지 확인한다. 빨간색(실패)이면 로그 맨 아래 문장을 알려 주세요(키를 보내지는 마세요).

## 7단계 — 로그인 · 결제 · 토스 주소 등록 (새 주소를 외부 서비스에 알리기)

새 주소가 생기면 아래 세 곳에 등록해야 로그인 · 결제가 돌아온다([`setup-guide.md`](./setup-guide.md)의 같은 단계와 같다).

- **Supabase**: Authentication → URL Configuration → Site URL과 Redirect URLs에 새 주소(+ `/auth/callback`).
- **카카오 디벨로퍼스**: 웹 사이트 도메인 등록(카카오 로그인의 Redirect URI는 Supabase 주소라 그대로).
- **`SITE_URL`** 환경변수가 같은 주소인지 확인.

토스 쪽 웹훅 주소는 등록하지 않는다(보호 때문에 어차피 닿지 않는다).

## 8단계 — 토스 결제위젯에서 카드만 보이는지 확인

[`setup-guide.md`](./setup-guide.md)의 "카드만 열기"와 [`question-pack-live-test.md`](./question-pack-live-test.md)의 결제 화면 확인을 따른다.

## 9단계 — 올라간 버전이 맞는지 확인 (`/admin`)

1. 새 주소의 `/admin` (내 계정으로 로그인, `ADMIN_USER_IDS`에 내 번호가 있어야 한다).
2. **"배포 정보 · 정기 점검"** 에서: 환경이 **Vercel · Production**인지, 브랜치가 **`claude/miyu-claude-code-setup-klw8ms`** 인지, 커밋 7자리(링크를 누르면 GitHub의 그 커밋)를 본다.
3. 그 커밋이 **GitHub 작업 브랜치 커밋 목록에서 `8128fab`이거나 그보다 위(더 최근)** 에 있으면 맞다. 아래에 있거나 목록에 없으면 옛 코드다 — 저에게 알려 주세요.
4. "확인 필요" 문구가 있으면 그 문장대로 고친다(예: 커밋 번호를 읽지 못함 → 4단계 2번).
5. **정기 점검 마지막 실행**은 배포한 **다음 날**(한국 새벽 3시대) 다시 열어 시각이 찍혔는지 본다. 기록 없음이면 Settings → Cron Jobs에서 정기 실행이 켜져 있는지, `CRON_SECRET`이 있는지 확인한다.

## 알려진 한계 · 결정이 필요한 것

- **정기 점검이 하루 한 번뿐이다(Hobby).** 그래서 "고객이 다시 접속하지 않아도 환불이 반영되는가"는 정기 점검에만 기대지 않는다: **질문을 쓰기 직전에 결제사 기록을 다시 확인한다**(결제사 조회가 실패하면 질문은 막지 않고 운영 기록 · 알림에 남긴다). 5~10분마다 점검이 필요하면 Pro로 올리고 `vercel.json`의 시각을 바꾼다.
- **보호된 배포에서 정기 실행이 도는지는 문서로 확인하지 못했다.** `/admin`의 마지막 실행 시각이 확인 방법이다.
- **실제 AI 리포트 생성 시간은 재지 못했다.** Hobby는 300초를 넘길 수 없다. 270초를 넘기면 실패로 정리되고 "다시 만들기"로 이어서 받을 수 있지만, 자주 그렇다면 Pro(최대 800초)가 필요하다.
- **저장소가 공개다.** 비공개로 바꾸려면: Vercel Hobby는 비공개 저장소에서 커밋 작성자가 Hobby 계정 소유자와 같아야 배포된다(공식 문서) — 지금 커밋 작성자는 Claude라서 배포가 막힐 수 있다. 비공개 전환 + Hobby 배포를 함께 원하면 먼저 알려 주세요(커밋 작성 방식 또는 Pro 중 선택).
- **`main`은 그대로 템플릿이다.** `main`에 미유 코드를 합치는 것은 공개 배포에 가까운 결정이라 지금 하지 않는다(합칠 때는 합치기 요청(PR)을 따로 만든다).
- **되돌리기**: Vercel → Deployments → 이전 정상 배포 → Instant Rollback. DB는 되돌리지 않는다([`runbook.md`](./runbook.md)).
- 이 안내의 Vercel 화면 이름 · 메뉴 위치는 공식 문서를 읽고 쓴 것이며 실제 화면에서 확인하지는 못했다. 다르면 알려 주세요.
