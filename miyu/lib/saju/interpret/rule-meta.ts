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

/** 근거 ID가 나온 규칙 (없으면 null — 새 근거를 만들면서 이 기록을 빠뜨리지 않았는지 테스트가 확인한다) */
export function ruleFor(evidenceId: string): RuleMeta | null {
  return RULE_META.find((r) => r.match.test(evidenceId)) ?? null;
}

export function ruleIdsOf(evidence: Pick<Evidence, "id">[]): string[] {
  return [...new Set(evidence.map((e) => ruleFor(e.id)?.id).filter((x): x is string => Boolean(x)))];
}
