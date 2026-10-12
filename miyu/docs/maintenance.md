# 유지보수 안내 — 무엇을 어디서 고치나

개발자가 아닌 운영자가 문구 · 가격 · 상품 범위를 바꿀 때 어디를 보면 되는지, 그리고 개발자가 코드 · DB · 의존성을 바꿀 때 지키는 규칙을 한곳에 적었다. 무거운 관리 도구(CMS)는 두지 않는다 — 파일 한 곳을 고치고 `npm run check`로 확인하는 방식이다.

## 1. 한 곳에서만 고치는 것 (운영자가 자주 바꿀 것)

| 바꾸려는 것 | 고칠 파일 | 고친 뒤 확인 |
| --- | --- | --- |
| **가격** · 상품 이름 | `lib/config/product.ts`의 `PERSONAL_REPORT` | 결제 금액은 서버가 이 값으로 정한다. 이미 만들어진 주문은 그때의 금액 그대로. `npm run check` |
| **무료 / 유료 범위 표** (홈의 비교표 · 가격 상자 · 안내 문구) | `lib/config/product.ts`의 `REPORT_SCOPE` | 홈 화면 표가 이 표를 읽는다. 표에 적은 것은 실제 리포트에 있어야 한다 — `lib/report/preview.test.ts`가 일부를 확인 |
| 무료 미리보기에서 보이는 항목 · 잠금 질문 | `lib/report/preview.ts` | 잠긴 내용은 이 파일이 만든 값에 **없어야** 한다 (테스트가 확인). 질문을 늘리면 구매 리포트에 그 답이 있어야 한다 |
| 홈 · 안내 화면 문구 | `app/page.tsx` · `components/home/*` | 가격 · 범위는 위 파일을 읽으므로 여기서 고치지 않는다 |
| 이용약관 · 개인정보 처리방침 | `app/terms/page.tsx` · `app/privacy/page.tsx` + **`lib/membership/terms.ts`의 `TERMS_VERSION` 올리기** | 버전을 올려야 기존 회원이 다시 동의한다 |
| 알림 문구 · 오류 안내 | `lib/ops/*` · `components/site/error-view.tsx` | 고객 정보 · 키를 넣지 않는다 |
| 서비스 색상 · 글꼴 크기 | `app/globals.css`의 토큰 | 화면 코드에서 색상값을 직접 쓰지 않는다 |

가격 · 범위를 바꾸는 날의 순서: ① 파일 고치기 → ② `npm run check` → ③ 배포 → ④ 새 주문 금액 확인(MY → 주문 상세). **할인 전 가격 · 마감 타이머는 만들지 않는다**(제품 원칙).

## 2. 해석 · 문항 · 지시문 (고치면 결과가 달라지는 것)

각 항목은 **버전 문자열**이 있고, 저장된 결과 · 리포트에 그 버전이 남는다. 고치면 버전을 올린다 — 이미 구매한 리포트는 만든 시점의 내용 그대로 다시 보여 주므로 영향이 없다 (`reports.content` 수정 불가 · 열 때 재생성 없음).

| 무엇 | 파일 | 버전 | 어디에 남나 |
| --- | --- | --- | --- |
| 검사 문항(MBTI 성향 · 기질 · 관계) | `lib/assessment/modules/*.ts` | `version: "dev-0.1"` (모듈별) | `assessments.content_version` |
| 대표 경향 분류 규칙 | `lib/assessment/dev-rules.ts` (12유형 초안: `tendency-v2.ts`, 화면 미연결) | 문항 버전에 포함 | `assessments.summary` |
| 무료 해석 문단 규칙 | `lib/report/free-insight.ts` | `INSIGHT_RULE_VERSION` | `assessments.summary.insight.version` |
| 사주 해석 근거 규칙 | `lib/saju/interpret/rules.ts` | `SAJU_RULE_VERSION` | 리포트 `basis.ruleVersions` · `reports.generator_version` |
| 응답 근거 규칙 | `lib/report/survey-evidence.ts` | `SURVEY_RULE_VERSION` | 리포트 `basis.ruleVersions` |
| AI 지시문 | `lib/report/v2/prompt.ts` | `PROMPT_VERSION` | 리포트 `basis.ruleVersions` · `reports.generator_version` (모델 이름과 함께) |
| 원국 쉬운 풀이 · 상황 · 관계 조건 · 질문 · 보완 아이템 | `lib/saju/plain.ts` · `lib/report/{situations,partner,questions,starter-actions}.ts` · `lib/saju/items.ts` | `EXTRAS_VERSION` (`lib/report/extras.ts`) | 리포트 `extras.version` |
| 무료 미리보기 구조 | `lib/report/preview.ts` | `PREVIEW_VERSION` | (저장하지 않음 — 보여 줄 때 서버가 만든다) |
| 만세력 엔진 · 계산 기준 | `lib/saju/manseryeok-engine.ts` · `lib/saju/policy.ts` | 엔진 이름 · 버전 · 기준을 결과에 기록 | `assessments.saju` · 리포트 `basis.lines` |

규칙:
- **사주 계산은 엔진 결과만 쓴다.** AI가 생년월일로 원국을 지어내지 않는다.
- 해석 규칙 · 지시문을 바꾸면 `npm test`의 관련 테스트(근거 ID 검사 · 표현 검사 · 미리보기 일관성)가 통과해야 한다.
- 문구는 모두 **초안 · 전문가 검토 전**이다. 전문가가 검토하면 버전 이름의 `-draft`를 떼고 검토 기록을 `docs/`에 남긴다.

## 3. 코드 구조 — 서로 섞이지 않게 나눈 경계

| 영역 | 폴더 | 규칙 |
| --- | --- | --- |
| 사주 계산 | `lib/saju/` (엔진) | 계산만 한다. 해석 · 화면을 모른다 |
| 해석 근거 규칙 | `lib/saju/interpret/` · `lib/report/survey-evidence.ts` | 계산 결과에서 근거 목록만 만든다 |
| AI 문장 작성 | `lib/report/ai/` · `lib/report/v2/` | 근거 목록 안에서만 쓰고, 형식 검사를 통과한 것만 저장. 제공사는 `TextModel` 약속 뒤에 숨긴다 |
| 결제 · 주문 | `lib/commerce/` · `lib/services/order-service.ts` · `reconcile-service.ts` | 서버 승인 확인 후에만 구매 권한. 리포트 생성과 상태를 따로 관리 |
| 용량 · 비용 | `lib/services/capacity-service.ts` | 새 판매만 막고 이미 결제한 고객은 계속 처리 |
| 운영 | `lib/ops/` · `server/ops.ts` | 비밀값 가리기 · 알림 중복 방지 · 오류번호 |
| 화면 | `app/` · `components/` | 규칙 계산을 하지 않는다. `lib/`가 준 값을 보여 준다 |

`lib/`(핵심 폴더)는 Next.js · React · 외부 SDK를 불러오지 않는다 (`lib/core.test.ts`가 검사). 채널 전용 코드는 `server/` · `app/` · `components/`에 둔다. 새 라이브러리는 꼭 필요할 때만, 먼저 `npm run deps`로 라이선스 · 보안을 본다.

## 4. DB 변경 규칙 (마이그레이션)

- **새 파일로만 추가한다** (`supabase/migrations/날짜_이름.sql`). 이미 적용한 파일은 고치지 않는다 — 적용한 DB에 다시 실행하라고 안내하지 않는다.
- **앞으로만 나아가는(forward-only) 변경**: 열 · 표 · 색인 · 함수를 **더하고**, 지우거나 이름을 바꾸는 일은 두 번에 나눈다 — ① 새 구조를 더하고 코드가 둘 다 읽을 수 있게 배포 → ② 모두 옮겨진 것을 확인한 뒤 옛 구조를 지우는 새 마이그레이션.
- **코드가 먼저 배포돼도 깨지지 않게 쓴다.** 새 표 · 열이 없을 때를 견디는 방식(`isMissingTableError` · 출처 열 없이 주문 생성 · 합계 함수가 없으면 나눠서 합산)이 이미 들어 있다. 이 방식으로 배포 순서가 틀려도 결제 · 리포트가 멈추지 않는다.
- 기존 검사 · 회원 · 주문 · 결제 데이터를 지우거나 초기화하는 마이그레이션은 만들지 않는다.
- 새 표는 **RLS를 켜고 필요한 권한만** 준다. 서버만 쓰는 표(`ops_events` · `ai_usage` · `funnel_events`)는 정책을 두지 않고 비밀키(`service_role`)에만 권한을 준다. 기록 표는 고치기 방지 트리거를 둔다.
- 새 마이그레이션을 만들면 같은 작업에서 `supabase/tests/db.test.ts`에 접근 정책 · 쌓기만 가능 · 실제 동작 시험을 더하고, `docs/setup-guide.md`의 번호 표에 올린다.
- 코드 되돌리기와 DB 되돌리기는 **따로** 판단한다 → [`runbook.md`](./runbook.md)의 "되돌리기".

## 5. 의존성 점검

`npm run deps` — 운영 패키지의 **라이선스 · 알려진 보안 취약점 · 새 버전**을 한 번에 본다. 마지막 점검(2026-10-12): 운영 패키지 44개 모두 허용 라이선스(MIT · Apache-2.0 · ISC · BSD · 0BSD · CC-BY-4.0 · OFL-1.1), LGPL-3.0은 sharp의 libvips(서버에서 수정 없이 사용, 검토됨), 취약점 0개. 새 버전: supabase-js · tosspayments-sdk는 패치/마이너, 나머지(`@types/node` · `eslint` · `typescript`)는 큰 버전 변경이라 별도 검토.

- 한 번에 **하나씩** 올리고 `npm run check` · `npm run test:db`를 다시 통과시킨 뒤 반영한다. 결제 SDK(`@tosspayments/tosspayments-sdk`)와 `next` · `@supabase/*`는 올린 뒤 결제 화면 · 로그인을 브라우저로 직접 확인한다.
- `npm audit fix --force`는 영향 확인 없이 쓰지 않는다 (개발 도구 체인의 경고는 운영 패키지 점검 `--omit=dev`와 분리해서 본다).
- 한 달에 한 번 `npm run deps`를 돌려 결과를 확인한다.

## 6. 글꼴

본문 글꼴은 Pretendard(OFL-1.1)를 이 사이트에 쓰는 글자만 남겨 줄인 파일이다 (`app/fonts/`, 사이트 안의 이름은 `Miyu Sans`). 화면 문구에 새 한글이 많이 늘면 `scripts/subset-font.py`를 다시 실행한다 (실행법은 파일 맨 위). 빠진 글자는 `Pretendard-rest.woff2`(필요한 화면에서만 받음)와 기본 글꼴로 대체되므로 글자가 깨지지는 않는다.
