# 유지보수 안내 — 무엇을 어디서 고치나

개발자가 아닌 운영자가 문구 · 가격 · 상품 범위를 바꿀 때 어디를 보면 되는지, 그리고 개발자가 코드 · DB · 의존성을 바꿀 때 지키는 규칙을 한곳에 적었다. 무거운 관리 도구(CMS)는 두지 않는다 — 파일 한 곳을 고치고 `npm run check`로 확인하는 방식이다.

## 1. 한 곳에서만 고치는 것 (운영자가 자주 바꿀 것)

| 바꾸려는 것 | 고칠 파일 | 고친 뒤 확인 |
| --- | --- | --- |
| **가격** · 상품 이름 | `lib/config/product.ts`의 `PERSONAL_REPORT` | 결제 금액은 서버가 이 값으로 정한다. 이미 만들어진 주문은 그때의 금액 그대로. `npm run check` |
| **고민 반영 리포트 가격** · 상품 이름 (내 고민 자세히 알려주기 → 새 리포트 발급) | `lib/config/product.ts`의 `CONCERN_REPORT` | 4,900원(운영자 확정 2026-10-13). 발급 버튼 문구 · 결제 금액이 이 값을 읽는다. 이미 만들어진 주문은 그때의 금액 그대로. 무료 발급 횟수는 정해지지 않았고 코드에도 없다 ([`concern-records.md`](./concern-records.md) 6장) |
| **무료 / 유료 범위 표** (홈의 비교표 · 가격 상자 · 안내 문구) | `lib/config/product.ts`의 `REPORT_SCOPE` | 홈 화면 표가 이 표를 읽는다. 표에 적은 것은 실제 리포트에 있어야 한다 — `lib/report/preview.test.ts`가 일부를 확인 |
| 무료 미리보기에서 보이는 항목 · 잠금 질문 | `lib/report/preview.ts` | 잠긴 내용은 이 파일이 만든 값에 **없어야** 한다 (테스트가 확인). 질문을 늘리면 구매 리포트에 그 답이 있어야 한다 |
| **상담방 이름 · 모드 이름 · 먼저 묻는 질문 · 열 수 있는 풀이** (8개) | `lib/report/reading/talk-room.ts`의 `ROOMS`(순서는 `ROOM_ORDER`) | 홈 카드 · 채팅방 목록 · 메뉴가 모두 이 표를 읽는다. 진로 / 재무 방은 지금 같은 "일과 돈" 풀이를 쓴다. `talk-room.test.ts` |
| **일일 운세 무료 혜택**(초기에만) | `lib/config/product.ts`의 `DAILY_FREE.enabled` | false로 바꾸면 무료 맛보기에서는 그날의 풀이 대신 질문만 보이고, 구매한 분은 그대로 본다. `talk-code.test.ts` |
| **하단 사업자 정보**(상호 · 대표자 · 소재지 · 사업자등록번호 · 통신판매신고번호 · 개인정보관리책임자) | `lib/config/business.ts` 한 곳 | 운영자가 보낸 값 그대로다. 저작권 줄의 서비스 이름이 "MI:U"로 적혀 있는데(운영자 원문 그대로) 화면 이름은 "ME:U"다 — 맞는지 운영자가 확인한다 |
| **방마다 무료 질문 수 · 방 등급**(무료 리포트 / 심층 리포트) | `lib/config/product.ts`의 `CHAT_ROOMS`(무료 리포트로 열리는 방과 방마다 무료 질문 수 `simple`, 심층 리포트의 방마다 무료 질문 `deepFreeQuestions`, 기본 3) · 규칙은 `lib/report/chat/quota.ts` | 무료 리포트(무료)로는 나를 알아보기(질문 0) · 오늘의 운세(하루 1) · 고민 상담(2) · 연애(2) 네 방만 열리고, 심층 리포트(개인 통합 리포트)를 받으면 모든 방이 열리며 방마다 무료 질문 3번이다. 다 쓰면 미유캐시(`MIYU_CASH.perQuestion` 3캐시)로 이어 간다. 방 카드 · 채팅 메뉴 · 잠긴 방 안내가 같은 표를 읽는다 |
| **시험 중 무료 질문 추가** | 환경변수 `AI_CHAT_EXTRA_QUESTIONS` (기본 0) | 실제 AI 시험 중에만 열린 방마다 무료 질문을 더 준다. 끝나면 비운다 |
| **질문 한 번의 글자 수 · 안내창 문구** | `lib/report/reading/talk.ts`의 `QUESTION_MAX`(무료 리포트 회원의 무료 질문 300자 · 심층 리포트 회원 질문 / 결제한 질문 500자) · `TALK_COPY.recharge` | 무료를 고치면 안내창 문구의 "두 배"가 맞는지 확인한다(테스트가 확인한다). 무료 맛보기에 내 자료로 읽은 내용이 없는 방은 무료 질문을 열지 않는다 |
| **유료 질문(질문 한 개당 결제) 가격** | `lib/config/product.ts`의 `MIYU_CASH`(`priceKrw` = 550원 부가세 포함 · `perQuestion` 장부 단위, 둘은 따로 정한다) · `QUESTION_PRICE_KRW`(= `priceKrw`) | 가격은 가설이다(선불 충전 · 보너스 · 지갑은 없다). 환불 · 청약철회 · 법적 검토는 `docs/question-payment.md`의 결정 항목. 결제는 결제사 확인 뒤에만 장부에 들어간다(DB 13번, 새 변경 없음) |
| **실제 AI 승인 한도(코드 상한)** | `lib/config/ai-candidates.ts`의 `LIVE_TEST_LIMITS`(5,000원 · 60회 · 7일) · 운영자가 `.env.local`에 `AI_APPROVED_*`를 적어야 호출 | 상한을 넘기는 값은 연결되지 않는다. 한도를 늘리려면 운영자 승인 뒤 이 값을 고친다 |
| **고민 기록소 노출** | `lib/config/product.ts`의 `CONCERN_RECORDS.visible` (지금 false) | false이면 주소 · 입구 · MY 목록 · 발급 동작이 모두 막힌다. 데이터 · 서비스 코드는 그대로 있다 |
| **채팅 요약 저장** | `lib/report/chat/summary.ts`(`SUMMARY_LIMITS` — 직접 저장 최대 100개 · 저장하지 않은 대화의 참고 기록 방마다 12개 · 보관 기간은 `lib/config/product.ts`의 `CHAT_SUMMARY_POLICY.referenceKeepDays`(90일, 정기 점검이 지움) · 글자 수 한도 · 다음 질문에 참고로 보내는 쌍 수) · `lib/services/summary-service.ts` · 문구는 `ROOM_COPY.summary` | 설명은 `docs/chat-summary.md`. 저장하지 않아도 참고 기록이 남는다는 점은 대화 종료 안내창 · 처리방침 3-1 · `docs/withdrawal-policy.md` 11번에 적었다 |
| **심화 검사 문항 · 세부 항목 · 소요 시간 어림** (초안, 화면 미연결) | `lib/assessment/drafts/deep-items-a/b/c.ts`(문항 36개) · `deep-questions.ts`(세부 항목 정의 · 채점) · `deep-design.ts`(설계 · `first` 표시 · 문항당 10초 어림 `SECONDS_PER_QUESTION` · 총 문항 범위 50~60 `TOTAL_QUESTION_BUDGET`) | 문항을 고친 뒤 `node scripts/render-assessment-deep-questions.ts` · `render-assessment-deep-design.ts`로 문서를 다시 만든다. 무료 분석 문항 수(22)가 바뀌면 `deep-design.test.ts`의 합계(58)를 다시 정한다. 소요 시간은 어림이며 시범 응답으로 재면 고친다 |
| **자유 질문의 실제 AI 연결(Claude)** | 환경변수 `AI_CHAT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` + 승인 값 `AI_CHAT_APPROVED_KRW` · `AI_CHAT_APPROVED_CALLS` · `AI_CHAT_APPROVED_FROM` · `AI_CHAT_APPROVED_THROUGH` | 운영자가 값을 직접 적어야만 연결된다. 코드 상한(`lib/config/ai-candidates.ts`의 `CHAT_TEST_LIMITS` 1,500원 · 40회 · 3일)을 넘기면 연결되지 않는다. 시험이 끝나면 `AI_CHAT_PROVIDER`를 비워 끊는다. 호출 수 · 비용은 `supabase/check-chat-usage.sql`(읽기 전용)로 본다. 승인액을 새로 정하면 `STAGE1_LEDGER`(누적 사용액)도 운영자가 확인한 값으로 고친다 |
| **인연 풀이의 나이 방향** | `lib/config/product.ts`의 `PARTNER_AGE_DIRECTION` (`enabled: false`로 끄면 나이 방향 문장 · 질문이 빠진다) | 운영자가 켜 두기로 결정(2026-10-15, 연상 · 동갑 · 연하 쪽 큰 방향 + 사용한 전통 해석 기준 설명). 바꿀 때는 `docs/partner-rules-audit.md` 4장을 먼저 본다 |
| 일일 운세 하루 한 번 무료 | `lib/config/product.ts`의 `DAILY_FREE` | 초기 혜택을 끝낼 때 `enabled: false` |
| 자유 질문 지시문 · 답 검사 · 한도 · 힘든 글 안내 · 승인 가드 | `lib/report/chat/`(`prompt.ts` · `validate.ts` · `plan.ts` · `question.ts` · `approval.ts` · `ai-config.ts`) | 지시문을 고치면 `CHAT_PROMPT_VERSION`을 올린다. `chat.test.ts`. 실제 AI로는 아직 시험하지 않았다 |
| 인연의 경향 · 오늘의 한 장 문구 규칙 | `lib/saju/interpret/partner.ts` · `day-plain.ts` (+ `rule-meta.ts`의 규칙 이력) | 고친 뒤 `node scripts/render-data-docs.ts`로 `docs/saju-rules.md`를 다시 만든다. 구체적 나이 · 직업 · 날짜 · 속마음은 쓰지 않는다 (`partner-day.test.ts`) |
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
| **개인 통합 리포트(읽기 구조)의 구성 · 글자 수 한도 · 고정 안내 문구 · 쉬운 말 규칙** | `lib/report/reading/plan.ts` (예시 화면 · 지시문 · 검사가 모두 이 값을 읽는다) | 지시문 버전 `READING_PROMPT_VERSION` (`lib/report/reading/prompt.ts`) | 리포트 `generated.ruleVersions` · `reports.generator_version` (모델 이름과 함께) |
| AI 지시문 — 읽기 구조(기본) | `lib/report/reading/prompt.ts` | `READING_PROMPT_VERSION` | 위와 같다. 고치면 `reading.test.ts`와 `sample-reading-report.test.ts`가 예시 · 생성기 · 검사가 같은 기준인지 확인한다 |
| 대화로 풀어보기의 고정 문구 · 묶음 이름 · 말풍선 나누기 | `lib/report/reading/talk.ts` (`TALK_COPY` · `GROUPS` · `BUBBLE_PAIR_MAX`) · 화면 `components/talk/talk-view.tsx` | 없음(저장된 리포트의 글을 나눠 보일 뿐 새 글을 쓰지 않는다) | 저장하지 않는다. 고치면 `talk.test.ts`가 "모든 말풍선이 저장된 리포트의 글인지"를 확인한다 |
| **안내 캐릭터 "미유" 그림 바꾸기** (운영자가 보낸 그림으로) | `public/miyu/{basic,happy,surprised,thinking,playful,worried,wave,glasses,aha}.webp` · 표정과 파일 연결은 `components/talk/miyu-moods.ts` | 없음 | 저장하지 않는다. **같은 이름의 정사각형 WebP(약 256px)로 파일을 교체**하면 채팅 얼굴 · 분석 카드 · 저장 이미지가 모두 바뀐다. 새 표정을 더하려면 `lib/report/reading/talk-room.ts`의 `TalkMood`와 `miyu-moods.ts`에 이름을 더한다. 저장 이미지는 `happy.webp`를 쓰고 못 불러오면 글자 "미"로 대신한다. 그림에 다른 이름이 적혀 있어도 화면에는 "미유"만 쓴다 |
| **상담방 이름 · "OO 모드로 접속합니다" 안내 · 먼저 묻는 질문과 선택지** | `lib/report/reading/talk-room.ts`의 `ROOMS` · `ROOM_COPY` | 없음 | 방을 더하면 `RoomId` · `ROOM_ORDER`와 `app/results/[id]/talk/[room]` · `app/report/sample/talk/[room]`의 방 이름 검사가 따라온다. 먼저 묻는 질문의 답은 풀이를 바꾸지 않고 이 기기 화면에만 남는다(서버 저장 없음). 이어 보기 저장 형식을 바꾸면 `ROOM_SAVE_VERSION`을 올린다 — 옛 버전의 저장은 무시하고 새 대화로 시작한다. 운영자가 정하지 않은 방 이름(일 · 진로 / 돈 · 소비)은 임시다 |
| AI 지시문 — 이전 형식(이미 저장된 리포트 · 비교용) | `lib/report/v2/prompt.ts` | `PROMPT_VERSION` | 리포트 `basis.ruleVersions` · `reports.generator_version` (모델 이름과 함께) |
| 원국 쉬운 풀이 · 상황 · 관계 조건 · 질문 · 보완 아이템 | `lib/saju/plain.ts` · `lib/report/{situations,partner,questions,starter-actions}.ts` · `lib/saju/items.ts` | `EXTRAS_VERSION` (`lib/report/extras.ts`) | 리포트 `extras.version` |
| 무료 미리보기 구조 | `lib/report/preview.ts` | `PREVIEW_VERSION` | (저장하지 않음 — 보여 줄 때 서버가 만든다) |
| 만세력 엔진 · 계산 기준 | `lib/saju/manseryeok-engine.ts` · `lib/saju/policy.ts` | 엔진 이름 · 버전 · 기준을 결과에 기록 | `assessments.saju` · 리포트 `basis.lines` |

규칙:
- **사주 계산은 엔진 결과만 쓴다.** AI가 생년월일로 원국을 지어내지 않는다.
- 해석 규칙 · 지시문을 바꾸면 `npm test`의 관련 테스트(근거 ID 검사 · 표현 검사 · 미리보기 일관성)가 통과해야 한다.
- 해석 규칙(`lib/saju/interpret/rules.ts` · `lib/report/survey-evidence.ts`)을 바꾸거나 새 근거 ID를 만들면 `lib/saju/interpret/rule-meta.ts`의 조건 · 예외 · 버전도 함께 고친다(빠뜨리면 `rule-meta.test.ts`가 알려 준다). 그다음 `node scripts/render-data-docs.ts`로 `docs/saju-rules.md`를 다시 만든다. 전문가 검토 없이 검토 상태를 "검토 완료"로 바꾸지 않는다.
- 문구는 모두 **초안 · 전문가 검토 전**이다. 전문가가 검토하면 버전 이름의 `-draft`를 떼고 검토 기록을 `docs/`에 남긴다.

## 3. 코드 구조 — 서로 섞이지 않게 나눈 경계

| 영역 | 폴더 | 규칙 |
| --- | --- | --- |
| 사주 계산 | `lib/saju/` (엔진) | 계산만 한다. 해석 · 화면을 모른다 |
| 해석 근거 규칙 | `lib/saju/interpret/` · `lib/report/survey-evidence.ts` | 계산 결과에서 근거 목록만 만든다 |
| AI 문장 작성 | `lib/report/ai/` · `lib/report/reading/`(기본) · `lib/report/v2/`(이전 형식) | 근거 목록 안에서만 쓰고, 형식 검사를 통과한 것만 저장. 접어 둔 근거 · 안내 문구 · 타임라인은 AI가 아니라 코드가 채운다. 제공사는 `TextModel` 약속 뒤에 숨긴다 |
| AI 제공사 연결 | `lib/integrations/ai/` (`providers.ts` Anthropic · OpenAI, `mock-local.ts`) | 승인 금액 · 날짜를 운영자가 적지 않으면 호출하지 않는다 (`scripts/run-ai-compare.ts`). 키는 환경변수에만 |
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
- `supabase/apply-4-to-10.sql`은 4~10번을 한 번에 적용하는 **고정된 묶음**이다 (`scripts/render-apply-sql.ts`가 마이그레이션 파일을 그대로 이어 붙여 만들며 직접 고치지 않는다 — 마이그레이션 4~10번을 고치면 서버 테스트가 알려 준다). 11번 이후(12번 대화 저장 포함)는 묶지 않고 새 파일 하나씩 적용한다.
- 새 표는 **RLS를 켜고 필요한 권한만** 준다. 서버만 쓰는 표(`ops_events` · `ai_usage` · `funnel_events`)는 정책을 두지 않고 비밀키(`service_role`)에만 권한을 준다. 기록 표는 고치기 방지 트리거를 둔다.
- 새 마이그레이션을 만들면 같은 작업에서 `supabase/tests/db.test.ts`에 접근 정책 · 쌓기만 가능 · 실제 동작 시험을 더하고, `docs/setup-guide.md`의 번호 표에 올린다.
- 코드 되돌리기와 DB 되돌리기는 **따로** 판단한다 → [`runbook.md`](./runbook.md)의 "되돌리기".

### 빌드와 환경변수

`/analyze` 같은 화면은 빌드할 때 미리 만들어지고, 그때 읽은 환경변수(예: 로그인이 설정됐는지)가 굳는다. **빌드하는 곳에도 같은 환경변수가 있어야 한다** (호스팅은 빌드 환경에 변수를 넣고, 내 PC는 `.env.local`이 있는 폴더에서 `npm run build`). 변수 없이 빌드한 뒤 실행할 때만 변수를 넣으면 일부 고객에게 "로그인 설정 전"이 보일 수 있다. 환경변수를 바꾼 뒤에는 다시 빌드한다.

## 5. 의존성 점검

`npm run deps` — 운영 패키지의 **라이선스 · 알려진 보안 취약점 · 새 버전**을 한 번에 본다. 마지막 점검(2026-10-12): 운영 패키지 44개 모두 허용 라이선스(MIT · Apache-2.0 · ISC · BSD · 0BSD · CC-BY-4.0 · OFL-1.1), LGPL-3.0은 sharp의 libvips(서버에서 수정 없이 사용, 검토됨), 취약점 0개. 새 버전: supabase-js · tosspayments-sdk는 패치/마이너, 나머지(`@types/node` · `eslint` · `typescript`)는 큰 버전 변경이라 별도 검토.

- 한 번에 **하나씩** 올리고 `npm run check` · `npm run test:db`를 다시 통과시킨 뒤 반영한다. 결제 SDK(`@tosspayments/tosspayments-sdk`)와 `next` · `@supabase/*`는 올린 뒤 결제 화면 · 로그인을 브라우저로 직접 확인한다.
- `npm audit fix --force`는 영향 확인 없이 쓰지 않는다 (개발 도구 체인의 경고는 운영 패키지 점검 `--omit=dev`와 분리해서 본다).
- 한 달에 한 번 `npm run deps`를 돌려 결과를 확인한다.

## 6. 글꼴

본문 글꼴은 Pretendard(OFL-1.1)를 이 사이트에 쓰는 글자만 남겨 줄인 파일 두 개다 (`app/fonts/`). `next/font/local`로 불러오며(설정은 `app/fonts/miyu-fonts.ts` — `scripts/subset-font.py`가 만든다), 핵심 파일은 첫 화면과 함께 미리 받고 `font-display: optional`이라 늦게 도착해도 글자가 바뀌며 화면이 흔들리지 않는다. 화면 문구에 새 한글이 많이 늘면 `scripts/subset-font.py`를 다시 실행한다 (실행법은 파일 맨 위, 글꼴 도구 `fonttools`는 개발 PC에만 필요). 빠진 글자는 나머지 파일(필요한 화면에서만 받음)과 기본 글꼴로 대체되므로 글자가 깨지지는 않는다. 화면 스타일이 바뀌지 않는 것 같으면 `.next` 폴더(빌드 캐시)를 지우고 다시 빌드한다.

## 브라우저 점검(개발 환경) 때 알아 둘 것

- `NEXT_PUBLIC_*` 환경변수는 **빌드할 때 화면 코드에 박힌다**. 로컬 검증 환경에서 운영 빌드(`next start`)로 확인할 때는 점검용 환경변수 파일을 읽은 채로 빌드해야(`set -a; . app.env; set +a; npm run build`) 값이 반영된다 — 서버만 다시 켜서는 바뀌지 않는다.
- Next.js 16은 다른 화면으로 이동해도 이전 화면을 숨긴 채 DOM에 남겨 두므로, 브라우저 자동 점검에서 화면의 `main`을 찾을 때는 보이는 것만(`main:visible`) 고른다.
