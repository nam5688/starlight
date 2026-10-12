# ME:U(미유)

사주 · MBTI · 기질 · 애착을 함께 정리하는 **개인 통합 분석 리포트** 웹서비스입니다.

현재 상태: 화면 · 검사 흐름에 더해 **카카오 로그인 · 가입 동의 · 결과 저장 · 토스페이먼츠 테스트 결제 · 리포트 저장**이 구현되어 있습니다. 검사 문항과 리포트 문장은 개발용 예시입니다.
키를 넣기 전에는 로그인 · 결제가 "설정 전"으로 표시되고, 나머지 화면은 그대로 볼 수 있습니다.

- 외부 서비스 연결 순서: [`docs/setup-guide.md`](docs/setup-guide.md) — 개발 서버를 켜고 http://localhost:3000/setup 에서 진행 상황 확인
- **최신 버전 적용 · DB 적용 이력 확인 · 기존 결제 대조 · 관리자 · 텔레그램 연결:** [`docs/update-guide.md`](docs/update-guide.md) (ZIP으로 받아 쓰는 경우 이 문서부터)
- 운영자 판단 자료: [`docs/operator-decisions.md`](docs/operator-decisions.md) · 자체 성향 질문 설계(초안): [`docs/assessment-design-v1.md`](docs/assessment-design-v1.md) · AI 품질 확인 계획: [`docs/ai-quality-comparison-plan.md`](docs/ai-quality-comparison-plan.md)
- 진행 단계: [`docs/roadmap.md`](docs/roadmap.md) · 상세 기획: [`docs/product-spec.md`](docs/product-spec.md) · 사업 설계: [`docs/business-plan.md`](docs/business-plan.md)

---

## 내 컴퓨터(Windows)에서 실행하기

아래 명령은 **Windows PowerShell** 기준입니다. (시작 메뉴에서 "PowerShell" 검색 → 실행)
Git Bash나 WSL을 쓰고 있다면 알려주세요. 그 환경에 맞는 명령으로 다시 정리하겠습니다.

### 1. 처음 한 번만 설치

1. **Node.js** — https://nodejs.org 에서 **LTS** 버전 설치 프로그램을 내려받아 기본 설정으로 설치합니다. (22.18 이상 필요)
2. **Git** — https://git-scm.com/download/win 에서 설치합니다. (Claude Code를 Windows에서 쓸 때도 필요합니다)
3. 설치 후 PowerShell을 새로 열고 확인합니다.

```powershell
node -v
git --version
```

`v22.18.0` 이상과 git 버전이 보이면 됩니다.

### 2. 코드 내려받기 (처음 한 번)

```powershell
cd $HOME\Documents
git clone https://github.com/nam5688/starlight.git
cd starlight
git switch claude/miyu-claude-code-setup-klw8ms
cd miyu
npm install
```

### 3. 실행

```powershell
npm run dev
```

`Ready` 문구가 나오면 브라우저에서 **http://localhost:3000** 을 엽니다.
끝낼 때는 PowerShell 창에서 `Ctrl + C`를 누릅니다.

다음부터는 PowerShell에서 아래만 실행하면 됩니다.

```powershell
cd $HOME\Documents\starlight\miyu
npm run dev
```

### 자주 생기는 문제

- **`npm.ps1 파일을 로드할 수 없습니다` 오류**: PowerShell 보안 설정 때문입니다. 설정을 바꾸지 않고 `npm` 대신 `npm.cmd`로 실행하면 됩니다. 예: `npm.cmd install`, `npm.cmd run dev`
- **`node`를 찾을 수 없다는 오류**: Node.js 설치 후 PowerShell을 닫았다가 다시 여세요.
- **3000번 포트가 사용 중**: 다른 `npm run dev` 창이 켜져 있는지 확인하세요. 화면에 다른 주소(예: 3001)가 안내되면 그 주소로 접속합니다.

---

## 확인할 화면

| 화면 | 주소 | 확인할 것 |
| --- | --- | --- |
| 메인 | http://localhost:3000 | 소개 → 리포트 예시 → 제공 항목 → 이용 방법·가격 → 자주 묻는 질문 |
| 내 분석 시작하기 | http://localhost:3000/analyze | 기본 정보 → MBTI 성향 → 기질 → 관계 → 무료 요약. 이전 버튼과 휴대폰 뒤로 가기, 답변 수정 |
| 리포트 예시 | http://localhost:3000/report/sample | 결과 7단계 구성, 상세 분석 펼치기 |
| MY | http://localhost:3000/my | 카카오 로그인, 저장한 결과 목록, 소식 받기 설정 (키 설정 후) |
| 가입 동의 | `/auth/consent` | 처음 로그인한 회원의 약관 동의 (키 설정 후) |
| 결과 | `/results/...` | 저장된 무료 요약 + 리포트 구매 / 구매 후 리포트 (로그인 후) |
| 약관 · 처리방침 | http://localhost:3000/terms · /privacy | 초안 |
| 설정 점검 | http://localhost:3000/setup | 외부 서비스 연결 진행 상황 (개발용, 키 값은 보이지 않음) |
| 결제 | `/checkout/...` | 토스페이먼츠 결제 화면 (테스트 결제) |

휴대폰 화면으로 보려면 Chrome에서 `F12` → 왼쪽 위 휴대폰 아이콘(기기 툴바)을 누르고 폭을 390으로 맞춥니다.

---

## 검사 명령

```powershell
npm run check
```

타입 검사 → 린트 → 단위 테스트(채점 · 결제 흐름 · 쿠키 암호화) → 빌드를 차례로 실행합니다. 하나씩 실행하려면 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

`npm run test:db`(DB · 접근 정책 검사)는 Linux 개발 환경에서 로컬 검증용 DB를 띄운 뒤 실행합니다 (`supabase/tests/local-stack.sh`). Windows에서는 실행하지 않아도 됩니다.

`npm run deps`는 운영 패키지의 라이선스 · 알려진 보안 취약점 · 새 버전을 한 번에 보여 줍니다 (인터넷 필요, 새 도구 설치 없음).

## 환경변수

카카오 로그인 · 저장 · 결제를 쓰려면 키가 필요합니다. 값 얻는 방법은 [`docs/setup-guide.md`](docs/setup-guide.md)에 있습니다.

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

- `.env.local`에 값을 입력합니다. 이 파일은 git에 올라가지 않습니다.
- 값을 바꾼 뒤에는 `npm run dev`를 껐다가(`Ctrl + C`) 다시 실행합니다.
- 배포할 때는 Vercel 프로젝트 설정 → Environment Variables에 입력합니다.
- 비밀키는 대화창, 코드, 스크린샷에 넣지 마세요.

## 폴더 구조

```
miyu/
├── app/                  화면과 서버 함수 (메인, analyze, results, checkout, payments, my, auth, admin, api/webhooks · cron)
├── components/           화면 부품
├── lib/                  채널과 무관한 핵심 로직 (다른 채널에서도 재사용)
│   ├── assessment/       검사 모듈(문항) · 채점
│   ├── report/           리포트 데이터 · 무료 요약 · 개발용 생성기 · v2(근거 기반 AI 생성기 · 형식 검사)
│   ├── commerce/         주문 · 리포트 상태 규칙
│   ├── services/         저장 · 주문 · 결제 승인 · 재확인 · 리포트 · 용량 한도 · 관리자 · 지표 · 회원 동의 흐름
│   ├── ops/              운영 알림 · 오류번호 · 비밀값 가리기
│   ├── membership/       가입 동의 항목 · 약관 버전
│   ├── growth/           다음 행동 규칙
│   ├── integrations/     Supabase 저장소 · 토스페이먼츠 연결
│   └── samples/ config/ saju/ profile/
├── server/               웹 서버 전용 (환경변수, 로그인 세션 · 회원 상태, 결과 보관 쿠키, 설정 점검)
├── supabase/             DB 마이그레이션 · 로컬 검증
├── scripts/              글꼴 줄이기 · 의존성 점검
├── instrumentation.ts    서버 오류를 운영 기록 · 알림으로 남김
├── proxy.ts              로그인 세션 갱신
└── docs/                 기획서 · 진행 단계 · 연결 안내 · 적용 안내 · 출시 점검표 · 운영 매뉴얼 · 유지보수 · 문항 설계 · 판단 자료
```
