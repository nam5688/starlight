# ME:U(미유)

사주 · MBTI · 기질 · 애착을 함께 정리하는 **개인 통합 분석 리포트** 웹서비스입니다.

현재 상태: **1단계 — 화면과 흐름.** 검사 문항과 결과는 개발용 예시이며, 카카오 로그인 · 결과 저장 · 결제는 아직 연결되지 않았습니다. 진행 단계는 [`docs/roadmap.md`](docs/roadmap.md), 상세 기획은 [`docs/product-spec.md`](docs/product-spec.md)에 있습니다.

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
| MY | http://localhost:3000/my | 로그인 연결 전 상태 |

휴대폰 화면으로 보려면 Chrome에서 `F12` → 왼쪽 위 휴대폰 아이콘(기기 툴바)을 누르고 폭을 390으로 맞춥니다.

---

## 검사 명령

```powershell
npm run check
```

타입 검사 → 린트 → 단위 테스트(채점 규칙) → 빌드를 차례로 실행합니다. 하나씩 실행하려면 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 환경변수 (2단계부터)

1단계에는 필요 없습니다. 이후 단계에서 키가 필요해지면:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

- `.env.local`에 값을 입력합니다. 이 파일은 git에 올라가지 않습니다.
- 배포할 때는 Vercel 프로젝트 설정 → Environment Variables에 입력합니다.
- 비밀키는 대화창, 코드, 스크린샷에 넣지 마세요.

## 폴더 구조

```
miyu/
├── app/                  화면 (메인, analyze, report/sample, my)과 서버 채점(analyze/actions.ts)
├── components/           화면 부품 (site · home · analyze · report · ui)
├── lib/
│   ├── assessment/       검사 모듈(문항) · 채점 · 대표 경향 임시 규칙 · 테스트
│   ├── report/           리포트 데이터 구조 · 무료 요약 생성(서버 전용)
│   ├── samples/          리포트 예시용 가상 데이터
│   ├── config/           상품·가격(가안) · 외부 연결 상태
│   ├── saju/             만세력 엔진 연결 지점(연결 전)
│   └── profile/          기본 정보 입력·검증
└── docs/                 기획서 · 진행 단계
```
