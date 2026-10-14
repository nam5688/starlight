// 해석 근거 규칙의 이력 — 규칙마다 출처 · 적용 조건 · 예외 · 검토 상태 · 버전을 적는다.
// 근거 ID(예: saju.tengod.인성.many)가 어느 규칙에서 나왔는지 ruleFor()로 찾는다. 규칙의 문장과 조건은 rules.ts · survey-evidence.ts에 있고,
// 여기는 그 규칙이 어떤 자료에서 왔고 어디까지 확인됐는지를 기록한다 (규칙을 바꾸면 이 기록과 version도 함께 바꾼다).
//
// 계산과 해석을 구분한다
// - calculation: 만세력 엔진이 계산하는 부분(십신 · 오행 개수 · 합충형 관계 · 대운 · 세운). docs/saju-engine.md의 교차 검증 범위에서 확인했다.
// - interpretation: 그 계산 결과를 "~로 봅니다"로 읽는 규칙. **검증된 사실이 아니다.** 전통 해석을 정리한 초안이며 명리 전문가 검토 전이다.
import type { Evidence } from "../../report/evidence.ts";

export const RULE_META_VERSION = "saju-rule-meta-0.1";

export type ReviewStatus = "unreviewed" | "dev-example" | "reviewed";

export type RuleMeta = {
  id: string;
  title: string;
  /** 근거 ID가 이 규칙에서 나왔는지 (전체 ID와 맞춘다) */
  match: RegExp;
  kind: "saju" | "survey" | "self";
  /** 엔진 계산(또는 응답 환산) 부분과 확인한 범위 */
  calculation: string;
  /** 해석 규칙 요약 */
  interpretation: string;
  /** 출처 종류: 문헌에서 확인한 것이 아니라면 그렇게 적는다 */
  source: string;
  conditions: string[];
  exceptions: string[];
  review: ReviewStatus;
  version: string;
};

const CALC_SAJU = "만세력 엔진(manseryeok 2.0.0) 계산 — 음력 변환 · 일 · 연 · 월 · 시주 · 절입 시각은 독립 만세력 3종과 교차 검증(1900~2049, docs/saju-engine.md). 십신 · 오행 개수 · 합충형 판정은 미유 규칙표(relations.ts)와 단위 테스트로 확인.";
const SRC_TRADITION = "전통 명리 해석의 일반적인 서술을 \"~로 봅니다\" 수준으로 정리한 초안. 특정 문헌 · 학파를 지정하지 않았고 개발 중 AI의 도움으로 정리해 문헌 근거는 확인하지 못했다. 출처 표기와 학파 기준은 전문가 검토 때 확정한다.";
const V = "0.1";
const COMMON_EXCEPTIONS = ["출생 시각을 모르면 시주가 없어 시주가 들어가는 근거는 만들지 않는다", "시주 · 절기 경계 10분 이내이거나 자시 관법에 따라 달라지는 기둥이 걸리면 그 기둥의 근거는 uncertain으로 표시해 해석에 쓰지 않는다"];

const saju = (m: Omit<RuleMeta, "kind" | "calculation" | "source" | "review" | "version" | "exceptions"> & Partial<Pick<RuleMeta, "calculation" | "exceptions">>): RuleMeta => ({
  kind: "saju",
  calculation: CALC_SAJU,
  source: SRC_TRADITION,
  review: "unreviewed",
  version: V,
  exceptions: COMMON_EXCEPTIONS,
  ...m,
});

export const RULE_META: RuleMeta[] = [
  saju({ id: "daymaster", title: "일간의 비유(십간 물상)", match: /^saju\.daymaster$/, interpretation: "일간 10종을 큰 나무 · 촛불 · 바위 같은 자연물에 비유해 성향의 방향을 한 줄로 읽는다.", conditions: ["일간(태어난 날의 천간) 10종 각각에 한 문장"], exceptions: ["일주는 날짜로 정해지지만 자시 관법(야자시 · 조자시)에 따라 달라질 수 있어, 그 경우 saju.uncertain.jasi-school로 알린다"] }),
  saju({ id: "element-many", title: "오행이 두드러짐", match: /^saju\.element\.[목화토금수]\.many$/, interpretation: "한 오행이 원국 글자 중 3개 이상이면 그 기운(목 성장 · 화 표현 · 토 안정 · 금 기준 · 수 생각)이 두드러진다고 읽는다.", conditions: ["원국 글자(지장간 제외)에서 같은 오행 3개 이상 — 4개 이상이면 strong, 3개면 moderate"], exceptions: [...COMMON_EXCEPTIONS, "지장간 속 오행은 세지 않는다(학파마다 기준이 달라 엔진 결과로 단정하지 않음)"] }),
  saju({ id: "element-none", title: "오행이 없음", match: /^saju\.element\.[목화토금수]\.none$/, interpretation: "원국 글자에 한 오행이 없으면 전통 해석에서 생활 속에서 의식적으로 채우라고 권하는 경우가 많다고 읽는다. 없다는 것이 결함이라는 뜻은 아니다.", conditions: ["원국 글자(지장간 제외)에 해당 오행 0개 — moderate"], exceptions: [...COMMON_EXCEPTIONS, "지장간에 있는 오행은 세지 않으므로 '아예 없다'는 뜻으로 단정하지 않는다", "이 규칙으로 특정 능력이 없다고 말하지 않는다"] }),
  saju({ id: "tengod-many", title: "십신 그룹이 두드러짐", match: /^saju\.tengod\.(비겁|식상|재성|관성|인성)\.many$/, interpretation: "비겁(나와 같은 기운) · 식상(만들어 내는 기운) · 재성(다스리는 기운) · 관성(나를 다스리는 기운) · 인성(나를 돕는 기운) 중 한 그룹이 3자리 이상이면 그 주제를 성향으로 읽는다.", conditions: ["일간을 뺀 천간 · 지지 자리에서 같은 그룹 3자리 이상 — 4자리 이상이면 strong, 3자리면 moderate"], exceptions: [...COMMON_EXCEPTIONS, "지장간 십신은 세지 않는다", "격국 · 신강신약 판정은 하지 않는다(학파 의존)"] }),
  saju({ id: "tengod-none", title: "십신 그룹이 없음", match: /^saju\.tengod\.(비겁|식상|재성|관성|인성)\.none$/, interpretation: "원국에 없는 그룹은 대운 · 세운에서 그 그룹을 만나는 시기에 그 주제가 상대적으로 크게 느껴질 수 있다고 읽는다.", conditions: ["일간을 뺀 자리에 해당 그룹 0자리 — 항상 weak"], exceptions: [...COMMON_EXCEPTIONS, "없는 그룹에 해당하는 능력이 없다고 단정하지 않는다", "시기에 크게 느껴진다는 부분은 검증된 사실이 아니라 전통 해석 규칙이다"] }),
  saju({ id: "combo-sanggwan-paein", title: "상관과 인성의 조합", match: /^saju\.combo\.sanggwan-paein$/, interpretation: "날카로운 표현력(상관)을 배움 · 검토(인성)가 다듬는 구조로 보고 말과 글, 전문성을 다루는 일과 연결해 읽는다.", conditions: ["인성 2자리 이상 그리고 상관 2자리 이상 — moderate"] }),
  saju({ id: "combo-siksang-saengjae", title: "식상과 재성의 조합", match: /^saju\.combo\.siksang-saengjae$/, interpretation: "만들어 낸 결과물이 성과 · 수입으로 이어지는 흐름으로 읽는다.", conditions: ["식상 2자리 이상 그리고 재성 1자리 이상 — moderate"] }),
  saju({ id: "combo-jae-in", title: "재성과 인성의 조합", match: /^saju\.combo\.jae-in$/, interpretation: "현실 판단(재성)과 배움 · 이상(인성) 사이에서 고민이 길어질 수 있다고 읽는다.", conditions: ["재성 2자리 이상 그리고 인성 2자리 이상 — weak"] }),
  saju({ id: "combo-gwan-in", title: "관성과 인성의 조합", match: /^saju\.combo\.gwan-in$/, interpretation: "책임 · 조직 안에서 배움을 통해 인정받는 흐름으로 읽는다.", conditions: ["관성 2자리 이상 그리고 인성 1자리 이상 — moderate"] }),
  saju({ id: "spouse-star", title: "배우자 별의 개수", match: /^saju\.spouse-star$/, interpretation: "전통 해석에서 배우자 · 연애와 관련해 보는 기운(여성 원국은 관성, 남성 원국은 재성)의 개수를 알려 준다. 개수만으로 관계의 좋고 나쁨이나 시기를 단정하지 않는다.", conditions: ["성별을 입력한 경우에만 — 항상 weak"], exceptions: [...COMMON_EXCEPTIONS, "성별 구분이 해석의 한 학파 기준이라는 점을 단정하지 않는다", "연애 · 결혼의 사건이나 시기를 말하는 데 쓰지 않는다"] }),
  saju({ id: "spouse-palace", title: "배우자 자리(일지)의 십신", match: /^saju\.spouse-palace$/, interpretation: "태어난 날의 지지(일지)를 배우자 자리로 보고, 그 자리의 십신 그룹에 따라 가까운 관계에서 중요하게 여기는 것을 읽는다(비겁 동등함 · 식상 표현 · 재성 현실 · 관성 책임 · 인성 이해와 보살핌).", conditions: ["일지의 십신 그룹이 정해질 때 — moderate"], exceptions: [...COMMON_EXCEPTIONS, "상대의 나이 · 직업 · 만날 시기를 말하는 데 쓰지 않는다"] }),
  saju({ id: "relation", title: "원국 안의 합 · 충 · 형", match: /^saju\.relation\.(year|month|day|hour)-(year|month|day|hour)\.(천간합|육합|반합|충|형)$/, interpretation: "두 기둥의 천간합 · 지지 육합 · 반합 · 충 · 형 관계로 해당 영역(기둥이 뜻하는 환경)이 서로 영향을 주고받는 지점을 읽는다.", conditions: ["천간합 · 지지 육합 · 삼합의 왕지를 포함한 반합 · 충 · 형 — 항상 weak"], exceptions: [...COMMON_EXCEPTIONS, "방합 · 파 · 해 · 천간충은 학파 차이가 커서 제외한다"] }),
  saju({ id: "void", title: "공망(비어 있다고 보는 자리)", match: /^saju\.void$/, interpretation: "공망 자리는 기대만큼 채워지지 않거나 늦게 채워진다고 보는 해석이 있어 참고로만 읽는다.", conditions: ["일주 기준 공망 지지가 일주 외 기둥에 있을 때 — 항상 weak"], exceptions: [...COMMON_EXCEPTIONS, "학파마다 기준이 달라 단정하지 않는다"] }),
  saju({ id: "uncertain", title: "달라질 수 있는 기둥", match: /^saju\.uncertain\.[\w-]+$/, interpretation: "절기 당일 · 경계 근처 · 자시 관법에 따라 연주 · 월주 · 일주 · 시주가 달라질 수 있음을 알리고 그 기둥의 해석은 단정하지 않는다.", conditions: ["엔진이 notes로 남긴 jeolgi-day · near-boundary · jasi-school"], exceptions: ["이 근거는 해석에 쓰지 않고 안내에만 쓴다(uncertain)"] }),
  saju({ id: "daeun", title: "대운(10년 단위의 시기)", match: /^saju\.daeun\.(current|next)$/, interpretation: "현재 · 다음 대운의 천간 · 지지가 어느 십신 그룹인지로 그 시기의 주제를 읽는다(비겁 자기 주도 · 식상 표현 · 재성 성과 · 관성 책임 · 인성 배움).", conditions: ["성별을 입력한 경우에만 대운을 계산한다", "기준 날짜가 속한 대운과 그다음 대운"], exceptions: [...COMMON_EXCEPTIONS, "대운 시작 시점은 출생 시각 · 지역 보정에 따라 몇 개월 달라질 수 있다", "시기 해석은 실제 사건을 알려 주지 않는다"] }),
  saju({ id: "daeun-relation", title: "대운 지지와 원국의 관계", match: /^saju\.daeun\.(current|next)\.(year|month|day|hour)\.(천간합|육합|반합|충|형)$/, interpretation: "대운 지지가 원국 기둥과 맺는 합 · 충 · 형으로 해당 영역의 주제가 두드러지는 시기를 읽는다.", conditions: ["대운 지지와 원국 지지의 관계가 있을 때 — 항상 weak"] }),
  saju({ id: "seun", title: "세운(해마다의 흐름)", match: /^saju\.seun\.\d{4}$/, interpretation: "기준 연도부터 3년의 세운 천간 · 지지가 어느 십신 그룹인지로 그해의 주제를 읽는다.", conditions: ["기준 날짜의 연도부터 3년"], exceptions: [...COMMON_EXCEPTIONS, "세운은 날짜만으로 정해져 같은 해를 다시 열어도 바뀌지 않는다", "시기 해석은 실제 사건을 알려 주지 않는다"] }),
  saju({ id: "seun-relation", title: "세운 지지와 원국의 관계", match: /^saju\.seun\.\d{4}\.(year|month|day|hour)\.(천간합|육합|반합|충|형)$/, interpretation: "세운 지지가 원국 기둥과 맺는 합 · 충 · 형으로 그해에 해당 영역의 주제가 두드러지는 지점을 읽는다.", conditions: ["세운 지지와 원국 지지의 관계가 있을 때 — 항상 weak"] }),
  {
    id: "survey-direction", title: "응답 경향(개발용 문항)", match: /^survey\.(novelty|caution|sensitivity|persistence|anxiety|avoidance)\.(high|low)$/, kind: "survey",
    calculation: "개발용 예시 문항(status: dev-example) 응답을 0~100으로 환산한 값. 백분위 · 정확도가 아니다.",
    interpretation: "환산값이 65 이상이면 높은 쪽, 35 이하이면 낮은 쪽의 행동 경향 문장(문항의 high/low 의미)을 근거로 쓴다. 가운데는 만들지 않는다.",
    source: "미유가 만든 개발용 예시 문항과 임시 규칙(dev-rules). 공식 검사가 아니며 실제 사람 응답으로 검증하지 않았다. 새 자체 문항(초안 0.2)은 아직 연결하지 않았다.",
    conditions: ["환산값 65 이상 또는 35 이하 — 80 이상 · 20 이하는 strong, 그 밖은 moderate"], exceptions: ["가운데 점수는 근거로 쓰지 않는다", "사주 근거와 점수를 합산하지 않는다", "높고 낮음을 좋고 나쁨으로 쓰지 않는다"], review: "dev-example", version: "survey-dev-0.1",
  },
  {
    id: "survey-closeness", title: "관계 불안과 거리 두기가 함께 높음", match: /^survey\.closeness\.both$/, kind: "survey",
    calculation: "관계 불안 · 거리 두기 환산값(개발용 문항).", interpretation: "두 값이 모두 55 이상이면 가까워지고 싶은 마음과 거리를 두고 싶은 마음이 함께 나타난다고 읽는다.",
    source: "미유 임시 규칙(survey-evidence.ts). 실제 사람 응답으로 검증하지 않았다.", conditions: ["관계 불안 55 이상 그리고 거리 두기 55 이상 — moderate"], exceptions: ["애착 유형 진단으로 쓰지 않는다"], review: "dev-example", version: "survey-dev-0.1",
  },
  {
    id: "self-mbti", title: "본인이 입력한 MBTI", match: /^self\.mbti$/, kind: "self",
    calculation: "본인이 입력한 4글자(검사 점수가 아님).", interpretation: "본인이 알고 있는 자기 인식 참고값으로만 쓴다. 성격 판정이나 사주 해석의 근거로 쓰지 않는다.",
    source: "사용자 입력.", conditions: ["MBTI를 입력한 경우 — 항상 weak"], exceptions: ["자체 응답으로 MBTI를 환산하지 않는다", "공식 MBTI 검사 결과가 아니다"], review: "unreviewed", version: "0.1",
  },
];


/**
 * 월 단위 "움직이는 달" 계산 규칙(months.ts)의 이력. 근거 목록(Evidence)을 만드는 규칙이 아니라 코드가 달력을 직접 계산하는 규칙이라 RULE_META와 따로 둔다
 * (RULE_META는 "모든 규칙이 실제 근거를 만든다"를 테스트가 확인한다). 같은 출처 · 같은 검토 상태 기준이며, 검증된 사실이 아니다.
 */
const MONTH_EXCEPTIONS = [
  "달은 절기 기준이라 양력 달과 며칠 어긋난다",
  "사건 · 날짜(만난다 · 헤어진다 · 돈이 들어온다)를 알려 주는 데 쓰지 않는다",
  "어느 달이든 이렇게 읽을 수 있는 면이 있다는 한계를 화면에 밝힌다",
  "일주가 uncertain(절기 당일 · 경계 · 자시 관법)이면 가까운 관계 달력은 참고로만 보라고 안내한다",
  "형 · 반합은 학파 차이가 있어 단계에 세지 않고 약한 표시만 한다. 파 · 해 · 원진 · 천간충은 쓰지 않는다",
];

export const MONTH_RULE_META: RuleMeta[] = [
  saju({
    id: "month-love-palace", title: "그 달의 지지와 일지(배우자 자리)의 육합 · 충", match: /^saju\.month\.love\.palace$/,
    interpretation: "그 달 지지가 태어난 날의 지지(일지, 배우자 자리)와 육합이면 가까운 관계가 묶이거나 가까워지는 쪽의 주제, 충이면 변화나 조정이 필요한 주제가 두드러진다고 읽는다. 각각 1점.",
    conditions: ["월운 지지와 원국 일지의 관계가 육합 또는 충일 때"], exceptions: MONTH_EXCEPTIONS,
  }),
  saju({
    id: "month-love-stem", title: "그 달의 천간과 일간의 천간합", match: /^saju\.month\.love\.stem$/,
    interpretation: "그 달 천간이 일간과 천간합이면 새로운 인연이나 결속에 마음이 열리기 쉬운 주제가 두드러진다고 읽는다. 1점.",
    conditions: ["월운 천간과 일간이 천간합(갑기 · 을경 · 병신 · 정임 · 무계)일 때"], exceptions: MONTH_EXCEPTIONS,
  }),
  saju({
    id: "month-love-star", title: "그 달에 배우자 별이 들어옴", match: /^saju\.month\.love\.star$/,
    interpretation: "그 달의 천간 또는 지지가 전통 해석의 배우자 별(여성 원국은 관성, 남성 원국은 재성)에 해당하면 배우자 · 연애와 관련해 보는 기운이 들어오는 달로 읽는다. 1점(천간 · 지지 중 어느 하나라도).",
    conditions: ["성별을 입력한 경우에만 — 성별이 없으면 이 규칙은 쓰지 않는다"], exceptions: [...MONTH_EXCEPTIONS, "성별 구분이 해석의 한 학파 기준이라는 점을 단정하지 않는다"],
  }),
  saju({
    id: "month-wealth", title: "그 달의 천간 · 지지가 재성", match: /^saju\.month\.money$/,
    interpretation: "그 달의 천간 또는 지지가 일간 기준 재성이면 성과 · 수입 · 관리 주제가 두드러진다고 읽는다. 천간 · 지지 각각 1점. 돈이 들어오는 달이라는 뜻이 아니다.",
    conditions: ["월운 천간 또는 지지의 십신이 편재 · 정재일 때"], exceptions: [...MONTH_EXCEPTIONS, "수익 · 투자 · 대출 판단에 쓰지 않는다"],
  }),
  saju({
    id: "month-level", title: "달의 단계 표시 규칙", match: /^saju\.month\.level$/,
    interpretation: "한 주제(가까운 관계 · 재물)에서 위 규칙의 점수가 2점 이상이면 \"움직임이 큰 달\", 1점이면 \"조금 움직이는 달\", 0점이면 \"차분한 달\"로 표시한다. 좋고 나쁨이 아니라 주제가 눈에 띄기 쉬운 정도다.",
    conditions: ["월 단위 점수는 위 네 규칙의 합이다 (두 주제는 따로 센다)"], exceptions: [...MONTH_EXCEPTIONS, "단계 기준(2점 이상)은 개발 중 정한 것이며 해석의 정확도를 뜻하지 않는다 — 표시 빈도는 docs/month-calendar.md에 직접 센 값으로 적는다"],
  }),
];

/**
 * 인연의 경향 규칙(partner.ts)과 오늘의 한 장 규칙(day-plain.ts)의 이력 — 월 단위 달력처럼 코드가 직접 읽는 규칙이라 RULE_META와 따로 둔다.
 * 운영자가 2026-10-15에 "전통 해석에 따른 경향"을 보여 주기로 결정했다. 검증된 사실이 아니고 통계 · 조사 근거도 없으며, 구체적인 나이 · 직업 · 날짜는 말하지 않는다.
 */
const PARTNER_EXCEPTIONS = [
  "상대의 정확한 나이 · 직업 · 마음 · 만나는 날짜 · 결혼 여부와 시기를 말하는 데 쓰지 않는다",
  "나이 차는 연상 · 또래 · 연하 쪽의 큰 방향까지만 말하고 몇 살 차이라고 말하지 않는다",
  "통계 · 조사 결과를 쓴 것처럼 쓰지 않는다 (이 규칙에는 그런 근거가 없다)",
  "화면에 \"전통 해석이고 100% 정확하거나 검증된 사실이 아니에요\"를 작게 함께 적는다",
  "출생 시각을 모르면 시주 없이 일지 · 원국만 쓴다. 일주가 uncertain(절기 당일 · 경계 · 자시 관법)이면 참고로만 보라고 안내한다",
];

export const PARTNER_RULE_META: RuleMeta[] = [
  saju({
    id: "partner-mood", title: "배우자 자리(일지)의 십신 그룹으로 읽는 편한 상대의 분위기", match: /^saju\.partner\.mood$/,
    interpretation: "일지의 십신 그룹이 비겁이면 친구처럼 동등한 분위기, 식상이면 말이 잘 통하고 즐거운 분위기, 재성이면 생활이 단단하고 현실적인 분위기, 관성이면 믿음직하고 중심이 잡힌 분위기, 인성이면 이해해 주고 보살펴 주는 분위기에 마음이 편해지기 쉽다고 읽는다.",
    conditions: ["일지의 십신 그룹이 정해질 때 (다섯 그룹 각각 한 문장)"], exceptions: PARTNER_EXCEPTIONS,
  }),
  saju({
    id: "partner-age", title: "육친의 세대 비유로 읽는 나이 차의 큰 방향", match: /^saju\.partner\.age$/,
    interpretation: "인성 · 관성(나를 돕거나 이끄는 기운, 위 세대 비유)이면 연상으로 느껴지는 쪽, 비겁(같은 기운)이면 또래 쪽, 식상 · 재성(내가 낳거나 다스리는 기운, 아래 세대 비유)이면 어리게 느껴지는 쪽으로 기울기 쉽다고 읽는다. 몇 살 차이라는 뜻이 아니다.",
    conditions: ["일지의 십신 그룹이 정해질 때 — 다섯 그룹이 세 방향으로 나뉜다"], exceptions: [...PARTNER_EXCEPTIONS, "세대 비유는 한 가지 전통 서술이며 학파마다 다를 수 있다 — 검증되지 않았다"],
  }),
  saju({
    id: "partner-long-term", title: "오래 가는 관계에서 중요하게 여기기 쉬운 것(결혼박사 방)", match: /^saju\.partner\.long$/,
    interpretation: "일지의 십신 그룹에 따라 오래 가는 관계에서 중요하게 여기기 쉬운 것(비겁 동등함 · 식상 표현과 즐거움 · 재성 현실의 약속 · 관성 책임과 신뢰 · 인성 이해와 보살핌)을 읽는다. 결혼 여부나 시기를 정하지 않는다.",
    conditions: ["일지의 십신 그룹이 정해질 때"], exceptions: PARTNER_EXCEPTIONS,
  }),
  saju({
    id: "partner-star", title: "배우자 별의 개수", match: /^saju\.partner\.star$/,
    interpretation: "성별을 입력한 경우 배우자 별(여성 원국 관성 · 남성 원국 재성)이 원국에 없으면 그 기운이 들어오는 시기에 관계 이야기가 크게 느껴질 수 있고, 3자리 이상이면 관계에서 기대와 생각이 많아질 수 있다고 읽는다.",
    conditions: ["성별을 입력한 경우에만"], exceptions: [...PARTNER_EXCEPTIONS, "성별 구분이 해석의 한 학파 기준이라는 점을 단정하지 않는다", "개수만으로 관계의 좋고 나쁨이나 시기를 단정하지 않는다"],
  }),
];

const DAY_EXCEPTIONS = [
  "오늘 무슨 일이 생긴다고 말하는 데 쓰지 않는다 — 하루의 분위기를 읽는 전통 해석일 뿐이다",
  "다섯 그룹 모두 같은 무게로 읽고, 좋은 날 · 나쁜 날을 가르거나 점수를 매기지 않는다",
  "돈 · 투자 · 건강 · 계약 같은 결정을 이 한 장으로 정하지 말라고 안내한다",
  "화면에 \"전통 해석이고 100% 정확하거나 검증된 사실이 아니에요\"를 작게 함께 적는다",
  "일주가 uncertain(절기 당일 · 경계 · 자시 관법)이면 참고로만 보라고 안내한다",
];

export const DAY_RULE_META: RuleMeta[] = [
  saju({
    id: "day-stem-group", title: "오늘 일진 천간의 십신 그룹으로 읽는 하루의 분위기", match: /^saju\.day\.stem$/,
    interpretation: "오늘 일진의 천간이 내 일간 기준으로 비겁이면 내 기준과 페이스가 또렷해지는 날, 식상이면 표현하고 시도하고 싶어지는 날, 재성이면 현실을 챙기고 정리하고 싶어지는 날, 관성이면 책임과 약속이 눈에 들어오는 날, 인성이면 배우고 쉬며 정리하고 싶어지는 날로 읽는다. 영역별(일 · 사람 · 돈 · 마음) 한 줄 팁은 그 분위기에 맞춘 고정 문구다.",
    conditions: ["오늘(한국 날짜)의 일진과 내 일간으로 정해진다 — 같은 날 같은 원국이면 같은 결과"], exceptions: DAY_EXCEPTIONS,
  }),
  saju({
    id: "day-branch-relation", title: "오늘 지지와 내 일지의 육합 · 충", match: /^saju\.day\.branch$/,
    interpretation: "오늘 일진의 지지가 내 일지와 육합이면 사람 사이가 부드럽게 이어지기 쉬운 쪽의 주제, 충이면 계획이 바뀌거나 조정할 일이 생기기 쉬운 쪽의 주제를 가볍게 덧붙여 읽는다. 반합 · 형은 쓰지 않는다.",
    conditions: ["오늘 지지와 내 일지가 육합 또는 충일 때만"], exceptions: DAY_EXCEPTIONS,
  }),
];

/** 근거 ID가 나온 규칙 (없으면 null — 새 근거를 만들면서 이 기록을 빠뜨리지 않았는지 테스트가 확인한다) */
export function ruleFor(evidenceId: string): RuleMeta | null {
  return RULE_META.find((r) => r.match.test(evidenceId)) ?? null;
}

export function ruleIdsOf(evidence: Pick<Evidence, "id">[]): string[] {
  return [...new Set(evidence.map((e) => ruleFor(e.id)?.id).filter((x): x is string => Boolean(x)))];
}
