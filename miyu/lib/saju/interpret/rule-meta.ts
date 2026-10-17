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

/**
 * 원국 구조 규칙(structure.ts, 2026-10-16 운영자 요청: 지장간 · 월령 · 강약 · 조후부터 해석 재료를 보강). 두 층으로 구분한다.
 *  · 기본 자료(조회): 지장간 표 — 위키백과 "지장간"의 12지지 표와 대조해 확인했다. 그 외 학파별 변형은 문서에서 확인하지 못했다.
 *  · 구조 분석(규칙): 월령 득실 · 통근 · 투간 · 강약 후보 · 조후 후보 — 전통 해석을 단순화한 초안이며 원전과 대조하지 못했고 전문가 검토 전이다.
 * 격국 · 용신 · 희신 · 기신 · 신살은 이 단계에서 만들지 않았다.
 */
const STRUCTURE_EXCEPTIONS = [
  "출생 시각을 모르면 시주 없이 계산한다(글자 수 · 자리 수가 줄어든다)",
  "월주가 절기 경계에 걸려 달라질 수 있으면(uncertain) 월지에 기대는 근거는 해석의 근거로 쓰지 않는다",
  "격국 · 용신 · 희신 · 기신 · 신살을 정하는 데 쓰지 않는다 — 이 단계의 결과는 그 판단의 재료일 뿐이다",
  "점수 · 퍼센트로 환산하지 않고, 어떤 요소 때문에 그렇게 읽었는지를 근거 문장에 남긴다",
];
const structure = (m: { id: string; title: string; match: RegExp; calculation: string; interpretation: string; source: string; conditions: string[]; exceptions?: string[] }): RuleMeta => ({
  kind: "saju",
  review: "unreviewed",
  version: "0.1",
  ...m,
  // 이 규칙들의 계산은 표 조회와 개수 세기라 만세력 엔진의 십신 · 절기 계산과 달리 외부 엔진과의 교차 검증 대상이 아니다 — 저장소의 단위 테스트(structure.test.ts)로 확인한다
  calculation: m.calculation + " 이 계산은 외부 엔진과의 교차 검증 대상이 아니라 이 저장소의 단위 테스트(structure.test.ts)로 확인한다.",
  exceptions: [...(m.exceptions ?? []), ...STRUCTURE_EXCEPTIONS],
});
const SRC_STRUCTURE = "전통 명리(자평 계열)의 일반적인 서술을 단순화한 초안. 원전(자평진전 · 연해자평 등)과 대조하지 못했고 학파별 세부 기준 차이는 확인하지 못했다. 검색으로는 판정 기준을 문헌 수준으로 확인하지 못했다(2026-10-16). 해석 규칙의 문헌 근거는 확인하지 못했다.";
function structureRules(): RuleMeta[] {
  return [
    structure({ id: "structure-chart", title: "원국 여덟 글자와 자리(년 · 월 · 일 · 시, 천간 · 지지, 일간 기준 십신)", match: /^saju\.structure\.chart$/, calculation: "만세력 엔진이 계산한 네 기둥의 천간 · 지지와 일간 기준 십신(교차 검증 범위는 docs/saju-engine.md). 이 근거는 그 값을 한 줄에 모은 것이다.", interpretation: "같은 십신이라도 어느 기둥의 천간인지 지지인지에 따라 읽는 방식이 달라진다고 보고, 년주는 바깥 환경과 바탕 · 월주는 사회와 일의 자리 · 일주는 나와 가까운 관계 · 시주는 앞으로의 방향으로 읽는다.", source: "기둥별 자리의 의미는 전통 해석의 일반적인 서술이다(초안). 십신 계산은 만세력 라이브러리의 표를 쓴다. 해석 규칙의 문헌 근거는 확인하지 못했다.", conditions: ["항상 만든다(시각을 모르면 여섯 글자)"] }),
    structure({ id: "structure-hidden", title: "지장간(지지 속 숨은 글자)과 일간 기준 십신", match: /^saju\.structure\.hidden$/, calculation: "12지지별 지장간 표(여기 · 중기 · 정기) 조회 + 일간 기준 십신 계산. 표는 위키백과 '지장간'(ko.wikipedia.org/wiki/지장간)과 대조해 같음을 확인했다(2026-10-16).", interpretation: "겉으로 드러나지 않고 지지 안에 숨은 기운으로 보고, 정기를 그 지지의 중심 기운으로, 여기 · 중기를 보조로 읽는다.", source: "지장간 표: 위키백과 '지장간' 표와 같음(확인됨, 날짜 일수는 쓰지 않음). 해석 문장은 전통 해석의 일반적 서술(초안). 학파별 변형 표기는 문서에서 확인하지 못했다. 해석 규칙의 문헌 근거는 확인하지 못했다.", conditions: ["항상 만든다"] }),
    structure({ id: "structure-month", title: "월령(태어난 달의 기운)과 득령 · 실령", match: /^saju\.structure\.month$/, calculation: "월지의 정기 지장간이 일간 기준 어느 십신 그룹인지 계산(월지의 계절은 인묘진 봄 · 사오미 여름 · 신유술 가을 · 해자축 겨울).", interpretation: "월지 정기가 비겁 · 인성이면 득령(태어난 계절의 도움), 식상 · 재성 · 관성이면 실령으로 읽는다. 득령 여부만으로 강약을 정하지 않는다.", source: SRC_STRUCTURE, conditions: ["월지 정기의 십신 그룹이 정해질 때(항상)"], exceptions: ["월령을 얻었다고 해서 좋다 · 실령이라고 해서 나쁘다는 뜻이 아니다"] }),
    structure({ id: "structure-roots", title: "일간의 뿌리(통근)와 월지 지장간의 투간", match: /^saju\.structure\.roots$/, calculation: "일간과 같은 오행의 지장간이 어느 지지에 있는지(정기 · 중기 · 여기) 조회, 월지 지장간 글자가 천간(일간 포함)에 같은 글자로 있는지 비교.", interpretation: "정기에 뿌리가 있으면 단단한 뿌리, 중기 · 여기에만 있으면 약한 뿌리로 읽고, 월지 지장간이 천간에 드러났으면 숨은 기운이 겉으로 쓰이는 정도로 읽는다.", source: SRC_STRUCTURE, conditions: ["항상 만든다(뿌리가 없으면 없다고 적는다)"], exceptions: ["투간은 월지 지장간만 본다(다른 지지의 투간은 보지 않는다)", "같은 글자만 투간으로 센다(같은 오행의 다른 글자는 세지 않는다)"] }),
    structure({ id: "structure-strength", title: "일간 강약 후보(요소 기록)", match: /^saju\.structure\.strength$/, calculation: "세 요소의 방향을 기록한다 — ① 월령(득령 = 받는 쪽, 실령 = 덜 받는 쪽) ② 뿌리(정기에 뿌리 = 받는 쪽, 아니면 덜 받는 쪽) ③ 세력(천간 3곳 · 지지 4곳을 정기 십신으로 센 돕는 자리(비겁 · 인성)와 덜어내는 자리(식상 · 재성 · 관성)의 수 비교 — 세는 자리가 7곳(시각을 모르면 5곳)이라 같은 수는 나오지 않는다).", interpretation: "두 요소 이상이 같은 쪽이고 반대쪽 요소가 하나도 없을 때만 그 쪽을 후보로, 아니면 갈림으로 두며 갈림이면 강약을 단정하지 않는다. 점수 환산이나 임의의 기준 점수는 쓰지 않는다.", source: SRC_STRUCTURE + " 세 요소를 고른 것과 합치는 방식(두 요소 이상이 같은 쪽 · 반대쪽 없음)은 개발 중 정한 단순화이며 학파의 표준 기준이 아니다.", conditions: ["항상 만든다(갈림이면 weak, 한쪽이면 moderate)"], exceptions: ["세력을 센 때 지장간의 중기 · 여기는 세지 않는다(정기만)", "후보로 필요한 기운(용신)이나 격국을 정하지 않는다"] }),
    structure({ id: "structure-johu", title: "조후(계절의 한열) 후보", match: /^saju\.structure\.johu$/, calculation: "월지의 계절이 겨울(해 · 자 · 축)이면 화(불), 여름(사 · 오 · 미)이면 수(물) 기운이 원국 글자에 몇 개 있는지(지장간 포함 수도 따로) 센다. 봄 · 가을은 만들지 않는다.", interpretation: "계절이 추우면 따뜻하게 하는 화, 더우면 식히는 수를 반긴다고 보는 가장 큰 원칙만 쓴다.", source: SRC_STRUCTURE + " 일간 · 달마다 달라지는 세부 표(궁통보감 계열)는 적용하지 않았다.", conditions: ["월지가 겨울 또는 여름일 때만(해 · 자 · 축 · 사 · 오 · 미)", "필요한 기운이 원국 글자에 없으면 moderate, 있으면 weak"], exceptions: ["필요한 기운이 있다 · 없다만으로 좋고 나쁨을 정하지 않는다", "봄 · 가을과 진 · 술 달은 한열이 치우치지 않는다고 보아 만들지 않는다"] }),
  ];
}

/**
 * 사주 풀이 재료 보강(fortune.ts, 2026-10-17 운영자 방향: 미유는 사주풀이가 중심 — 직업운 · 재물복 · 연애운 · 인복 · 개운법을 응답이 없어도 사주 근거로 끝까지 풀 수 있게 한다).
 * 십성 개수 세기 · 오행 개수 세기 · 표 조회는 계산이고, 육친 대응 · 일의 계열 · 재물 읽기 · 오행 대응(방향 · 색 · 수 · 장소)은 전통 해석을 단순화한 초안이다 — 원전과 대조하지 못했고 전문가 검토 전이다.
 * 격국 · 용신 · 희신 · 기신 · 신살 · 십이운성은 만들지 않았다(보완 후보는 원국 오행 개수와 태어난 계절만으로 정한 단순화이며 필요한 기운을 판정한 것이 아니다).
 */
const FORTUNE_EXCEPTIONS = [
  "출생 시각을 모르면 시주 없이 센다(자리 수가 줄어든다)",
  "격국 · 용신 · 희신 · 기신 · 신살 · 십이운성을 정하는 데 쓰지 않는다 — 이 근거는 풀이의 재료일 뿐이다",
  "개수만으로 좋고 나쁨 · 성패 · 실제 있었던 일을 정하지 않는다",
  "점수 · 퍼센트로 환산하지 않고, 어떤 자리 · 개수 때문에 그렇게 읽었는지를 근거 문장에 남긴다",
];
const SRC_FORTUNE = "전통 명리(육친론 · 십성 해석 · 오행 대응)의 일반적인 서술을 단순화한 초안. 원전과 대조하지 못했고 학파별 세부 기준 차이는 확인하지 못했다. 오행의 방향 · 계절 · 색과 하도의 생수 · 성수(목 3 · 8, 화 2 · 7, 토 5 · 10, 금 4 · 9, 수 1 · 6)는 널리 알려진 대응이지만 문헌에서 직접 확인하지 못했다. 해석 규칙의 문헌 근거는 확인하지 못했다.";
const fortune = (m: { id: string; title: string; match: RegExp; calculation: string; interpretation: string; conditions: string[]; exceptions?: string[] }): RuleMeta => ({
  kind: "saju",
  review: "unreviewed",
  version: "0.1",
  source: SRC_FORTUNE,
  ...m,
  // 이 계산은 개수 세기와 표 조회라 외부 엔진과의 교차 검증 대상이 아니다 — 이 저장소의 단위 테스트(fortune.test.ts)로 확인한다
  calculation: m.calculation + " 이 계산은 외부 엔진과의 교차 검증 대상이 아니라 이 저장소의 단위 테스트(fortune.test.ts)로 확인한다.",
  exceptions: [...(m.exceptions ?? []), ...FORTUNE_EXCEPTIONS],
});
function fortuneRules(): RuleMeta[] {
  return [
    fortune({ id: "fortune-sipsung", title: "십성 분포 한눈에(다섯 갈래의 자리 수와 월주의 십성)", match: /^saju\.sipsung$/, calculation: "만세력 엔진이 계산한 일간 기준 십신(천간 · 지지 정기)을 비겁 · 식상 · 재성 · 관성 · 인성 다섯 그룹으로 모아 자리 수와 위치를 센다(일간 자신은 세지 않는다).", interpretation: "많은 그룹은 힘을 쓰는 방식의 바탕, 월주의 십성은 사회 · 일에서 처음 드러나는 모습, 없는 그룹은 그 기운이 들어오는 시기에 그 주제가 크게 느껴지는 것으로 읽는다. 능력 부족으로 풀지 않는다.", conditions: ["항상 만든다"] }),
    fortune({ id: "fortune-career", title: "일의 계열 읽기(십성 분포 → 어울리는 일의 방향)", match: /^saju\.career$/, calculation: "십성 그룹 자리 수에서 가장 많은 쪽과 그다음 쪽을 정하고(같으면 인성 · 비겁 · 식상 · 재성 · 관성 순), 식상 → 재성 · 관성 + 인성 · 인성 + 식상 · 비겁 > 재성 조합이 있는지 센다.", interpretation: "식상은 표현 · 기술 · 창작, 관성은 조직 · 규칙 · 책임, 재성은 현실 실무 · 영업 · 사업 · 자산, 인성은 배움 · 연구 · 자격, 비겁은 독립 · 협업 · 경쟁이 있는 일의 계열로 읽는다. 직업 하나를 정하거나 성공을 보장하지 않는다.", conditions: ["항상 만든다"], exceptions: ["동률이면 정한 순서(인성 · 비겁 · 식상 · 재성 · 관성)로 앞쪽을 가장 많은 쪽으로 쓴다 — 학파의 기준이 아닌 단순화다"] }),
    fortune({ id: "fortune-wealth", title: "재물 읽기(재성 · 식상 · 비겁 · 관성의 구조)", match: /^saju\.wealth$/, calculation: "재성(정재 · 편재) · 식상 · 비겁 · 관성의 자리 수와 일간을 돕는 자리 · 덜어내는 자리 수(structure.ts)를 센다.", interpretation: "정재는 꾸준히 모으는 돈, 편재는 여러 갈래 · 한 번에 움직이는 돈, 식상 → 재성은 결과물이 돈으로 이어지는 흐름, 비겁 > 재성은 나누고 쓰는 돈이 큰 구조, 재성이 일간을 돕는 쪽보다 많으면 감당하기 어려워 나가기 쉬운 구조로 읽는다. 부자 · 가난을 정하지 않는다.", conditions: ["항상 만든다(재성이 없으면 없다고 적는다)"], exceptions: ["소득 · 소비 습관 · 저축은 입력받지 않았다 — 구조의 읽기이지 이 사람의 돈 습관이 아니다", "투자 · 대출 · 부동산 결정의 근거로 쓰지 않는다"] }),
    fortune({ id: "fortune-kin", title: "육친 읽기(인복 · 가족 · 친구 · 동료)", match: /^saju\.kin$/, calculation: "십성 그룹을 전통 육친 대응(인성 어머니 · 윗사람 · 스승 / 재성 · 편재 아버지 · 현실의 지원 / 비겁 형제 · 친구 · 동료 / 관성 상사 / 식상 후배)으로 옮겨 자리 수를 세고, 년주 · 월주의 십성과 도움을 주는 쪽(인성 + 비겁)이 천간에 드러난 수를 센다.", interpretation: "도움을 주는 쪽이 천간에 드러나거나 자리가 든든하면 도움 받는 인연 이야기로 읽고, 보완 후보 기운의 성향을 가진 사람을 가까이 두면 균형이 맞는다고 읽는다. 가족 관계의 좋고 나쁨 · 실제 있었던 일 · 가족 구성을 정하지 않는다.", conditions: ["항상 만든다"], exceptions: ["년주 · 월주가 절기 경계에 걸려 달라질 수 있으면 uncertain으로 표시해 해석에 쓰지 않는다", "가족 정보는 입력받지 않았다 — 자녀 · 출산 이야기는 하지 않는다", "년주 · 월주를 조상 · 부모의 자리로 읽는 것은 전통 해석 한 가지이며 학파마다 다르다"] }),
    fortune({ id: "fortune-partner", title: "인연의 경향(배우자 자리로 읽는 편한 상대의 분위기 · 큰 방향 · 오래 가는 관계의 조건)", match: /^saju\.partner$/, calculation: "일지(배우자 자리)의 십신 그룹을 정하고(partner.ts의 규칙과 같다), 성별을 입력했다면 배우자 별(여성 원국 관성 · 남성 원국 재성)의 자리 수를 센다.", interpretation: "일지의 십신 그룹에 따라 편하게 느끼기 쉬운 상대의 분위기와 오래 가는 관계에서 중요하게 여기기 쉬운 것을 읽고, 나이는 연상 · 또래 · 연하 쪽의 큰 방향까지만 읽는다. 구체적인 나이 · 직업 · 마음 · 만나는 날짜는 읽지 않는다.", conditions: ["항상 만든다(나이 방향은 PARTNER_AGE_DIRECTION이 켜져 있을 때만 쓴다)"], exceptions: ["일주가 절기 경계 · 자시 관법에 걸려 달라질 수 있으면 uncertain으로 표시해 해석에 쓰지 않는다", "나이 방향은 인연 풀이 중 근거가 가장 약하다(partner-age 규칙 참고) — 끄는 스위치는 lib/config/product.ts의 PARTNER_AGE_DIRECTION"] }),
    fortune({ id: "hour-unknown", title: "출생 시각을 모를 때(시주 없이 세 기둥으로 읽는 범위)", match: /^saju\.hour\.unknown$/, calculation: "만세력 엔진이 출생 시각이 없을 때 시주를 비우고 계산한 결과(hourPillarOmitted)를 읽어, 세 기둥(여섯 글자) 기준임과 시주에 따라 달라질 수 있는 근거(오행 개수 · 십성 분포 · 강약 후보의 세력 · 개운 보완 후보), 그대로 읽을 수 있는 근거(일간 · 일주 · 월령 · 월주의 십성 · 일지 · 년주와 월주의 육친 대응 · 대운)를 기록한다. 새로 계산하는 값은 없다.", interpretation: "시주를 몰라도 연주 · 월주 · 일주로 읽을 수 있는 풀이는 그대로 하고, 개수가 적거나 없다는 것을 사주 전체에 없다는 뜻으로 읽지 않으며, 시주로 읽는 풀이(자녀와 이어지는 자리 · 말년)는 읽지 않는다.", conditions: ["출생 시각을 입력하지 않았을 때만 만든다(시각을 알면 근거가 없다)"], exceptions: ["이 근거는 풀이의 범위를 정하는 기록이며 새로운 명리 판정이 아니다", "시주를 알면 오행 · 십성 개수와 강약 · 개운 후보가 달라질 수 있다"] }),
    fortune({ id: "fortune-fortify", title: "개운(보완 후보 기운과 전통 오행 대응 — 방향 · 색 · 수(數) · 장소 · 습관 · 가까이 둘 사람)", match: /^saju\.fortify$/, calculation: "원국 글자(지장간 제외)의 오행 개수에서 없거나 1개뿐인 기운을 개수가 적은 순으로 고르고(모두 2개 이상이면 가장 적은 기운, 동률은 일간을 돕는 쪽부터), 겨울 · 여름 태생이면 계절을 보완하는 기운을 그다음 후보로 더한다. 무료 화면의 보완 아이템(items.ts)이 적게 나타난 기운을 고르는 기준과 같다.", interpretation: "부족한 기운을 생활에서 보태는 상징적인 개운법으로, 그 기운의 방향 · 계절 · 색 · 수(數) · 장소 · 습관 · 어울리는 사람의 성향을 전통 오행 대응으로 소개한다. 실제 효과나 재물 · 건강의 변화를 보장하지 않는다.", conditions: ["항상 만든다"], exceptions: ["보완 후보는 개수와 계절만으로 정한 단순화이며 필요한 기운을 판정한 것이 아니다", "월주가 절기 경계에 걸려 달라질 수 있으면 계절 보완 후보는 만들지 않는다", "개인별 계산 없이 색 · 방향 · 숫자를 임의로 정하지 않는다 — 같은 원국이면 늘 같은 결과다"] }),
  ];
}

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
  ...structureRules(),
  ...fortuneRules(),
  {
    id: "survey-direction", title: "응답 경향(개발용 문항)", match: /^survey\.(novelty|caution|sensitivity|persistence|anxiety|avoidance)\.(high|low)$/, kind: "survey",
    calculation: "개발용 예시 문항(status: dev-example) 응답을 0~100으로 환산한 값. 백분위 · 정확도가 아니다.",
    interpretation: "환산값이 65 이상이면 높은 쪽, 35 이하이면 낮은 쪽의 행동 경향 문장(문항의 high/low 의미)을 근거로 쓴다. 가운데는 만들지 않는다.",
    source: "미유가 만든 개발용 예시 문항과 임시 규칙(dev-rules). 공식 검사가 아니며 실제 사람 응답으로 검증하지 않았다. 새 자체 문항(초안 0.2)은 아직 연결하지 않았다.",
    conditions: ["환산값 65 이상 또는 35 이하 — 80 이상 · 20 이하는 strong, 그 밖은 moderate"], exceptions: ["가운데 점수는 근거로 쓰지 않는다", "사주 근거와 점수를 합산하지 않는다", "높고 낮음을 좋고 나쁨으로 쓰지 않는다"], review: "dev-example", version: "survey-dev-0.1",
  },
  {
    id: "survey-axis", title: "평소 행동 방식(에너지 · 정보 · 판단 · 생활, 개발용 문항)", match: /^survey\.(ei|sn|tf|jp)\.(high|low)$/, kind: "survey",
    calculation: "개발용 예시 문항(status: dev-example) 응답을 0~100으로 환산한 네 가지 방향(에너지를 채우는 방식 · 정보를 받아들이는 방식 · 판단하는 기준 · 생활을 꾸리는 방식). 백분위 · 정확도가 아니다.",
    interpretation: "환산값이 65 이상이면 높은 쪽, 35 이하이면 낮은 쪽의 행동 경향 문장(방향의 high/low 의미)을 근거로 쓴다. 사주에서 읽은 성향이 이 사람에게 어떤 장면으로 나타나는지 구체화하는 재료이며 가운데는 만들지 않는다.",
    source: "미유가 만든 개발용 예시 문항과 임시 규칙(dev-rules). 방향 구성이 기존 성격 이론과 닮아 있다는 출처 점검(docs/assessment-source-audit.md)이 있고, 실제 사람 응답으로 검증하지 않았다. 글자 코드(네 글자)로 바꾸지 않는다.",
    conditions: ["환산값 65 이상 또는 35 이하 — 80 이상 · 20 이하는 strong, 그 밖은 moderate"], exceptions: ["가운데 점수는 근거로 쓰지 않는다", "사주 근거와 점수를 합산하지 않는다", "입력한 MBTI와 다르면 응답이 먼저이고 차이는 상황별로 설명한다", "유형 이름 · 네 글자 코드로 쓰지 않는다"], review: "dev-example", version: "survey-dev-0.2",
  },
  {
    id: "survey-closeness", title: "관계 불안과 거리 두기가 함께 높음", match: /^survey\.closeness\.both$/, kind: "survey",
    calculation: "관계 불안 · 거리 두기 환산값(개발용 문항).", interpretation: "두 값이 모두 55 이상이면 가까워지고 싶은 마음과 거리를 두고 싶은 마음이 함께 나타난다고 읽는다.",
    source: "미유 임시 규칙(survey-evidence.ts). 실제 사람 응답으로 검증하지 않았다.", conditions: ["관계 불안 55 이상 그리고 거리 두기 55 이상 — moderate"], exceptions: ["애착 유형 진단으로 쓰지 않는다"], review: "dev-example", version: "survey-dev-0.1",
  },
  {
    id: "self-mbti", title: "본인이 입력한 MBTI", match: /^self\.mbti$/, kind: "self",
    calculation: "본인이 입력한 4글자(검사 점수가 아님). 글자가 가리키는 선호의 방향은 일상의 말로 풀어 근거 문구에 붙인다(직접 쓴 한 줄 풀이, 공식 검사 설명이 아님).", interpretation: "본인이 알고 있는 자기 인식 참고값이다. 사주에서 읽은 성향이 이 사람에게 어떤 장면으로 나타나는지 구체화하는 데 쓰고(핵심 성향 · 가까운 관계 · 일 영역에서) 행동의 원인으로 단정하지 않으며 사주 · 응답과 다를 때 덮어쓰지 않는다 — 응답이 먼저이고 다르면 차이가 나타나는 상황으로 쓴다.",
    source: "사용자 입력.", conditions: ["MBTI를 입력한 경우 — 항상 weak"], exceptions: ["자체 응답으로 MBTI를 환산하지 않는다", "공식 MBTI 검사 결과가 아니다", "알파벳 글자를 이유로 쓰지 않는다(\"INFJ라서\" 금지)", "시기 · 운 때문에 성향이 바뀐다고 쓰지 않는다"], review: "unreviewed", version: "0.2",
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
    conditions: ["일지의 십신 그룹이 정해질 때 — 다섯 그룹이 세 방향으로 나뉜다"], exceptions: [...PARTNER_EXCEPTIONS, "세대 비유는 한 가지 전통 서술이며 학파마다 다를 수 있다 — 검증되지 않았다", "인연 풀이 중 근거가 가장 약하다: 고전 문헌에서 이 대응을 확인하지 못했고(대중 명리 서술을 단순화), 결과와의 관계를 확인한 자료도 없다 — 끄는 스위치는 lib/config/product.ts의 PARTNER_AGE_DIRECTION"],
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

const COMPAT_EXCEPTIONS = [
  "두 사람의 사주 원국만 읽는다 — 상대가 직접 한 응답(기질 · 성격 · 애착)을 대신 만들어 판정하지 않는다",
  "상대의 속마음 · 성격 · 구체적 나이 · 날짜 · 사건을 알려 주는 데 쓰지 않는다",
  "관계가 이어질 확률이나 궁합의 정확도로 쓰지 않는다 — 합이 있다고 늘 편하다는 뜻도, 충이 있다고 관계가 어렵다는 뜻도 아니다",
  "출생 시각을 모르는 사람은 시주 없이 읽는다. 일지 · 월지가 절기 · 자시 경계에 걸리면 uncertain으로 두고 해석에 쓰지 않는다",
  "학파마다 읽는 방식이 달라 한 가지 서술로 단순화했다 — 전문가 검토 전이며 검증된 사실이 아니다",
];

/**
 * 사주 궁합 규칙(compat.ts)의 이력. 근거 목록(Evidence)을 만드는 규칙(compat.*)과 코드가 직접 점수 · 유형을 계산하는 규칙(총점 · 커플 유형)을 함께 둔다.
 * 간단 궁합(무료)과 사주 궁합(유료)이 같은 규칙을 쓴다. 같은 출처 · 같은 검토 상태 기준이며 검증된 사실이 아니다.
 */
export const COMPAT_RULE_META: RuleMeta[] = [
  saju({
    id: "compat-day-stem", title: "두 사람의 일간 사이(천간합 · 같은 오행 · 상생 · 상극)", match: /^compat\.(day-stem|role)$/,
    interpretation: "일간끼리 천간합이면 서로에게 끌리는 힘이 있는 관계, 같은 오행이면 닮은 결로 이해하기 쉽지만 같은 곳에서 같이 막힐 수 있는 관계, 상생이면 한쪽이 다른 쪽을 받쳐 주는 관계, 상극이면 기준이 부딪혀 긴장이 생기기 쉽지만 서로를 단련시키는 관계로 읽는다. 상대의 일간이 내 일간의 어떤 십신 관계인지는 관계에서 느껴지기 쉬운 역할의 한 가지 서술로만 쓴다.",
    conditions: ["두 사람의 일간(원국 일주 천간)이 계산돼 있을 때 — 관계는 천간합 > 같은 오행 > 상생 > 상극 순으로 정해진다"], exceptions: COMPAT_EXCEPTIONS,
  }),
  saju({
    id: "compat-day-branch", title: "두 사람의 일지(배우자 자리) 사이의 육합 · 반합 · 충 · 형", match: /^compat\.day-branch$/,
    interpretation: "일지는 가까운 관계 · 배우자 자리를 보는 곳이다. 두 일지가 육합이나 반합이면 가까이 있을 때 편안하게 이어지기 쉽고, 충이나 형이면 방식이 크게 달라 조정할 일이 생기기 쉽다고 읽는다.",
    conditions: ["두 일지 사이에 육합 · 반합 · 충 · 형 · 같은 글자 중 하나 이상이 있을 때"], exceptions: [...COMPAT_EXCEPTIONS, "삼형 · 방합 · 파 · 해 · 원진은 학파 차이가 커서 쓰지 않는다"],
  }),
  saju({
    id: "compat-cross", title: "그 밖의 자리(월지 · 년지 · 시지 · 월간) 사이의 합 · 충 · 형", match: /^compat\.cross\.(pull|clash)$/,
    interpretation: "일지 말고도 월지 · 년지 · 시지 · 월간 사이에 합이 있으면 일과 바깥 생활에서도 호흡이 맞는 면이, 충이나 형이 있으면 일 · 생활 방식 · 바깥 환경에서 기준이 부딪히기 쉬운 면이 있다고 읽는다. 자리마다 무게가 달라 일지보다 작게 읽는다.",
    conditions: ["두 사람의 서로 다른 기둥 사이의 지지에 합 · 충 · 형이 있을 때 — 기둥의 무게는 일지 3 · 월지 2 · 년지 1 · 시지 1이고 두 기둥 사이는 둘 중 작은 쪽"], exceptions: COMPAT_EXCEPTIONS,
  }),
  saju({
    id: "compat-element", title: "서로 비어 있는 오행을 채우는지 · 같은 오행이 겹치는지", match: /^compat\.element\.(fill|overlap)$/,
    interpretation: "한쪽에 없는 오행(0개)을 다른 쪽이 두 개 이상 갖고 있으면 서로의 빈 곳을 채워 주는 조합으로, 두 사람 모두 같은 오행이 세 개 이상이면 닮은 면이 크고 같은 곳에서 같이 막힐 수 있는 조합으로 읽는다.",
    conditions: ["지장간을 뺀 원국 글자의 오행 개수 기준 — 없음은 0개, 채움은 상대가 2개 이상, 겹침은 둘 다 3개 이상"], exceptions: [...COMPAT_EXCEPTIONS, "없다는 것이 결함이라는 뜻이 아니다 — 오행 하나를 생활 기능 하나로 옮기지 않는다"],
  }),
  saju({
    id: "compat-pace", title: "먼저 움직이는 쪽과 확인하고 움직이는 쪽(비겁 · 식상 대 인성 · 관성)", match: /^compat\.pace$/,
    interpretation: "비겁 · 식상(자기 주도 · 표현 · 새로운 시도)이 인성 · 관성(배움 · 검토 · 책임 · 기준)보다 자리가 많으면 먼저 움직이는 쪽, 반대면 확인하고 움직이는 쪽으로 읽는다. 두 사람의 기울기를 짝지어 속도가 비슷한지 다른지를 본다.",
    conditions: ["일간을 뺀 원국 글자의 십신 그룹 자리 수 — 두 쪽의 차이가 1자리 이상이면 기운 것으로 본다(차이가 작을수록 약한 근거, weak)"], exceptions: [...COMPAT_EXCEPTIONS, "속도에 대한 실제 행동은 응답으로 확인해야 하며 이 근거만으로 단정하지 않는다", "재성은 어느 쪽에도 세지 않는다"],
  }),
  saju({
    id: "compat-score", title: "궁합 총점(재미 · 참고용 지수)", match: /^compat\.score$/,
    interpretation: "일간 사이 · 일지 사이 · 그 밖의 자리 사이의 합과 충 · 오행 보완과 겹침을 재료마다 점수로 옮겨 더한 값이다(바탕 60, 재료의 합에 1.4배를 곱해 더하고 0~100으로 자른다). 구간마다 그 조합이 어떤 모양인지만 말하고 좋고 나쁨으로 읽지 않는다.",
    conditions: ["두 사람의 원국이 계산돼 있을 때 — 같은 두 사람은 A · B 순서와 상관없이 항상 같은 점수다"], exceptions: [...COMPAT_EXCEPTIONS, "관계 성공 확률 · 궁합의 정확도가 아니다", "재료의 점수 · 바탕 · 곱하는 폭은 임의로 정한 값이며 검증되지 않았다(분포는 scripts/measure-compat.ts가 센다)", "화면에 계산 재료와 \"확률이 아니라 재미 · 참고용 지수\"라는 안내를 함께 적는다"],
  }),
  saju({
    id: "compat-type", title: "커플 유형 20가지(재미 · 공유용 분류)", match: /^compat\.type$/,
    interpretation: "끌림(합의 정도 3단계) · 부딪힘(충 · 형의 정도 3단계) · 속도(둘 다 먼저 · 둘 다 확인 · 한 명씩 · 그 밖) · 일간 사이(같은 오행 · 상생 · 상극)를 구분표에 넣어 20가지 이름 가운데 하나를 정한다. 모든 입력이 정확히 한 유형이 된다.",
    conditions: ["끌림 · 부딪힘의 단계는 합 · 충 · 형 점수가 각각 2.5 이상이면 1단계, 5.5 이상이면 2단계(10배한 정수로 센다)"], exceptions: [...COMPAT_EXCEPTIONS, "사주에서 검증된 유형이 아니라 재미 · 공유를 위한 분류다 — 좋고 나쁨이 느껴지지 않게 모든 유형에 잘 맞을 때와 조율이 필요할 때를 함께 적는다", "유명 캐릭터 · 기존 서비스의 유형 이름과 같은지는 확인하지 못했다"],
  }),
];

const PAIR_EXCEPTIONS = [
  "각자가 직접 답한 자기 응답만 비교한다 — 한쪽이 답하지 않은 영역 · 뚜렷하지 않은 영역은 비교하지 않고 만들어 채우지 않는다",
  "어느 쪽이 맞고 틀린 것이 아니라 같은 쪽 · 서로 다른 쪽으로만 말한다 — 두 사람의 점수를 더하거나 비교 점수 · 궁합 지수를 새로 만들지 않는다",
  "상대의 속마음 · 실제 행동을 알려 주는 근거로 쓰지 않는다. 가까운 관계 반응(관계 불안 · 거리 두기)은 애착 유형 이름으로 부르지 않는다",
  "입력한 MBTI는 알파벳 없이 선호의 방향만 비교하고 본인이 알려 준 참고 정보로 둔다 — 응답과 사주 풀이를 덮어쓰지 않는다",
  "규칙은 설계 가설이며 실제 사람의 응답 · 전문가 검토로 확인하지 못했다(두 사람의 응답을 함께 쓰는 리포트 궁합은 아직 만들지 않았다)",
];

/** 리포트 궁합(아직 만들지 않음)의 두 사람 응답 비교 규칙(compat/pair-evidence.ts). 사주 근거가 아니라 응답 근거라 kind는 survey다 */
export const PAIR_RULE_META: RuleMeta[] = [
  {
    id: "pair-survey", title: "두 사람의 같은 영역 응답 비교(같은 쪽 · 서로 다른 쪽)", match: /^pair\.(?!mbti$)[a-z]+$/, kind: "survey",
    calculation: "각자의 영역 점수(응답 환산값, 0~100)가 65 이상이면 높은 쪽, 35 이하이면 낮은 쪽으로 보고 두 사람 모두 뚜렷한 영역만 같은 쪽 · 서로 다른 쪽으로 비교한다(점수는 근거 문장에 쓰지 않는다). 단위 테스트(pair-evidence.test.ts)로 확인한다.",
    interpretation: "같은 쪽으로 답했다면 같은 장면에서 비슷하게 반응하기 쉬워 서로를 이해하기 쉽지만 같은 부분에서 함께 막힐 수 있다고, 서로 다른 쪽이면 같은 장면에서 다르게 반응하기 쉬워 오해가 생길 수 있지만 서로의 빈 곳을 채울 수도 있다고 한 가지로 서술한다.",
    source: "개발 중 정한 단순한 비교 서술이다. 관계 심리 연구의 특정 결과를 옮기지 않았고 문헌 근거는 확인하지 못했다.",
    conditions: ["두 사람 모두 같은 영역에서 뚜렷한 응답(65 이상 또는 35 이하)이 있을 때"], exceptions: PAIR_EXCEPTIONS, review: "unreviewed", version: "0.1",
  },
  {
    id: "pair-mbti", title: "두 사람이 알려 준 MBTI의 선호 방향 비교", match: /^pair\.mbti$/, kind: "self",
    calculation: "두 사람이 네 글자로 알려 준 MBTI를 네 가지 선호 방향으로 풀어 같은 곳 · 다른 곳을 센다(mbtiDirections). 단위 테스트로 확인한다.",
    interpretation: "선호가 같은 곳은 닮은 반응, 다른 곳은 다른 반응이 나타날 수 있는 장면을 구체화하는 참고로만 쓴다.",
    source: "본인들이 알려 준 자기 인식 정보다. 공식 검사 점수나 설명을 옮기지 않았다(직접 쓴 한 줄 풀이).",
    conditions: ["두 사람 모두 네 글자 형식으로 MBTI를 알려 줬을 때"], exceptions: PAIR_EXCEPTIONS, review: "unreviewed", version: "0.1",
  },
];

// ───────────── 개인 유형 · 럭키 지수 (운영자 확정 2026-10-17, D1 · D2 — 화면 스위치는 꺼 둔 상태) ─────────────
// 근거 목록(Evidence)을 만드는 규칙이 아니라 코드가 직접 계산하는 규칙이라 따로 적는다(match는 이 규칙의 가상 id). 모두 미유가 정한 설계 가설이며 전문가 검토 전이다.
const PERSONAL_EXCEPTIONS = [
  "진단이나 평생 유형이 아니다 — 지금의 사주 구조와 응답에서 가장 두드러진 경향에 붙인 이름이다",
  "사주와 응답을 하나의 점수로 합산하지 않는다 — 사주가 갈래를, 응답이 그 안의 모습을 따로 정한다",
  "근거가 부족하면(사주 갈래가 정해지지 않거나 응답이 한쪽으로 기울지 않으면) 이름을 붙이지 않고 \"혼합 경향\"으로 둔다",
  "입력한 MBTI는 쓰지 않는다(선택 입력이고 자기 인식 참고값이다)",
  "출생 시각을 모르면 다섯 자리로 센다. 월주가 절기 경계에 걸려 달라질 수 있으면 월지 가중치를 넣었을 때와 뺐을 때 후보가 같을 때만 정한다",
];

export const PERSONAL_TYPE_RULE_META: RuleMeta[] = [
  {
    id: "personal-type-tilt", title: "사주에서 큰 방향(갈래) 정하기", match: /^personal-type\.tilt$/, kind: "saju",
    calculation: "원국 일곱 자리(시각을 모르면 다섯 자리, 천간은 일간 제외 · 지지는 정기 십신)의 십신을 다섯 갈래(비겁 · 식상 · 재성 · 관성 · 인성)로 세고 월지는 한 자리를 더 센다. 가장 많은 갈래(2 이상)가 후보다. 단위 테스트(personal-type.test.ts)로 확인한다.",
    interpretation: "가장 많은 갈래를 그 사람 사주의 큰 방향으로 읽고 갈래마다 두 가지 모습(총 10유형) 가운데 응답이 고르게 한다. 갈래 → 유형 이름 표는 rules.ts의 GROUP_RULE 문장(배움 · 표현 · 현실 · 책임 · 독립과 협력)을 이름으로 옮긴 설계 가설이다.",
    source: "미유가 정한 규칙이다. 월지를 한 자리 더 세는 것은 전통 해석에서 태어난 달의 자리를 가장 무겁게 본다는 일반적인 서술에서 가져온 단순화이며 문헌에서 확인하지 못했다. 십신을 성격 유형으로 옮기는 표는 학파의 표준이 아니다.",
    conditions: ["만세력이 계산한 원국이 있을 때(not-connected · invalid에는 쓰지 않는다)", "가장 많은 갈래가 2자리 이상일 때"], exceptions: PERSONAL_EXCEPTIONS, review: "unreviewed", version: "0.1",
  },
  {
    id: "personal-type-flavor", title: "응답으로 갈래 안의 두 모습 가르기", match: /^personal-type\.flavor$/, kind: "survey",
    calculation: "기질 4 · 가까운 관계 2 · 평소 행동 방식 4가지 응답(0~100 환산값) 가운데 가운데(50)에서 15 이상 벗어난 뚜렷한 응답만 골라, 갈래마다 정한 두 모습의 구성 응답이 각 모습 쪽으로 기운 정도의 평균을 비교한다. 두 모습의 차이가 20 이상이어야 한쪽으로 정한다(후보 갈래가 둘 이상이면 가장 또렷한 갈래가 둘째보다 10 이상 앞서야 한다). 단위 테스트로 확인한다.",
    interpretation: "뚜렷한 응답이 한쪽 모습으로 기울면 그 모습의 이름을 붙이고, 뚜렷한 응답이 없거나 기울기가 작으면 정하지 않는다.",
    source: "뚜렷함 15 · 차이 20 · 후보 간격 10은 임의로 정한 값이며 검증되지 않았다(15는 survey-evidence.ts의 65 · 35 기준과 같다). 응답 문항 자체가 개발용 예시(dev-example)다.",
    conditions: ["갈래 후보가 정해졌을 때", "그 갈래의 두 모습을 가르는 응답 가운데 뚜렷한 것이 하나 이상일 때"], exceptions: PERSONAL_EXCEPTIONS, review: "unreviewed", version: "0.1",
  },
];

const LUCKY_EXCEPTIONS = [
  "성공 확률 · 정확도 · 사람의 가치가 아니다. 낮은 점수는 \"운이 나쁘다\"가 아니라 \"운이 먼저 굴러오기보다 행동으로 흐름을 만드는 힘이 중요한 타입\"이다",
  "사주 원국에서만 계산한다 — 응답 · MBTI · 성향 점수 · 대운 · 세운과 합산하지 않는다(시기에 따라 바뀌는 \"올해의 럭키 흐름\"은 v1 이후)",
  "신살(천을귀인 등) · 격국 · 용신은 쓰지 않는다 — 계산하지 않았다",
  "AI가 쓰는 리포트 본문에는 숫자를 쓰지 않고 코드가 그리는 카드에만 보인다. 지금 화면 스위치(LUCKY_INDEX.visible)는 꺼 둔 상태다",
  "출생 시각을 모르면 다섯 자리를 일곱 자리로 환산해 센다(시각을 알면 달라질 수 있다고 안내). 절기 · 자시 경계에 걸려 달라질 수 있으면 그렇다고 안내한다",
  "\"예측이 아니며 보장하지 않는다\"와 \"전문가 검토 전 초안 · 검증되지 않았다\"를 지수 옆에 적는다",
];
const lucky = (m: { id: string; title: string; match: RegExp; interpretation: string; conditions: string[] }): RuleMeta => ({
  kind: "saju",
  calculation: "만세력 엔진이 계산한 원국의 십신 · 지지 관계(합 · 충) · 지장간 구조(structure.ts)를 점수표(lucky.ts의 LUCKY_RULES)로 센 뒤 눈금(LUCKY_SCALE)으로 0~100에 옮긴다. 단위 테스트(lucky.test.ts)와 무작위 원국 분포 측정(scripts/measure-lucky.ts)으로 확인한다.",
  source: "미유가 정한 점수표다. 전통 해석의 서술(인성 = 돕는 기운 · 식상 = 표현 · 재성 = 현실과 재물 · 관성 = 책임 · 합 = 맞춰 감 · 충 = 움직임)에서 방향만 가져왔고, 어떤 원국에 몇 점을 주는지는 문헌에서 확인한 것이 아니다. 눈금과 구간 경계는 무작위 원국의 분포를 센 뒤 정했다.",
  exceptions: LUCKY_EXCEPTIONS,
  review: "unreviewed",
  version: "0.1",
  ...m,
});

export const LUCKY_RULE_META: RuleMeta[] = [
  lucky({ id: "lucky-people", title: "귀인 · 사람복", match: /^lucky\.people$/, interpretation: "나를 돕는 기운(인성) · 안정적인 책임의 기운(정관) · 동료의 기운(비겁)이 있고 가까운 자리(일지)가 다른 자리와 합을 이루면 도움이 되는 사람과 이어지기 쉽다고 읽고, 일지가 충을 이루면 가까운 자리가 부딪히는 구조로 보아 한 점 덜어 낸다.", conditions: ["항상 계산한다"] }),
  lucky({ id: "lucky-chance", title: "기회 연결", match: /^lucky\.chance$/, interpretation: "표현하는 기운(식상) · 현실을 다루는 기운(재성)이 있고 지지끼리 합(연결) · 충(움직임)을 이루며 월지 속 숨은 기운이 천간에 드러나면(투간) 기회가 이어지기 쉽다고 읽는다.", conditions: ["항상 계산한다"] }),
  lucky({ id: "lucky-wealth", title: "재물 흐름", match: /^lucky\.wealth$/, interpretation: "재성이 있고 식상이 재성으로 이어지며 태어난 달 자리가 재성이고 일간이 받는 쪽이면 재물이 현실로 이어지기 쉽다고 읽고, 비겁이 많은데 재성이 적으면 부담으로 보아 덜어 낸다.", conditions: ["항상 계산한다"] }),
  lucky({ id: "lucky-recovery", title: "회복 · 반전", match: /^lucky\.recovery$/, interpretation: "인성 · 비겁 · 일간의 뿌리(통근) · 태어난 달의 도움(득령)이 있으면 회복하는 바탕이 단단하다고 읽고, 지지의 충을 반전의 계기로 보며, 관성이 많은데 인성이 없으면 압박에 비해 받쳐 줄 기운이 적다고 보아 덜어 낸다.", conditions: ["항상 계산한다"] }),
  lucky({ id: "lucky-total", title: "총점과 가장 강한 럭키 포인트", match: /^lucky\.total$/, interpretation: "총점은 네 지수의 평균을 눈금으로 늘린 값이고, 가장 강한 포인트는 하위 지수 가운데 가장 높은 것(최고 65점 이상 · 둘째와 5점 이상 차이)의 고정 문구다. 뚜렷하지 않으면 \"고른 구조\"라고 한다.", conditions: ["항상 계산한다"] }),
];

/** 사주 궁합(유료, 판매하지 않음)의 두 사람 시기 근거(compat-timing.ts) — 운영자 확정 2026-10-17 D5: 계산된 대운 · 세운 범위 안에서만 */
export const COMPAT_TIMING_RULE_META: RuleMeta[] = [
  saju({
    id: "compat-timing", title: "두 사람이 지금 각자 지나는 시기(대운)와 기준 연도의 세운 주제를 나란히 놓기", match: /^compat\.timing\.(luck|year)$/,
    interpretation: "각자의 일간 기준으로 읽은 대운 · 세운의 십신 그룹(rules.ts가 읽는 주제를 period-plain.ts가 쉬운 말로 옮긴 것)이 겹치면 같은 이야기를 함께 하기 쉽다고, 다르면 서로 신경 쓰는 주제가 다를 수 있다고 한 가지로 서술한다. 두 시기가 \"맞물리는 해\"를 새로 만들지 않는다.",
    conditions: ["대운은 두 사람 모두 성별을 입력해 계산돼 있고 기준 시점이 대운 범위 안일 때만(없으면 만들지 않는다)", "세운은 기준 연도의 간지를 각자의 일간으로 읽으며 항상 만든다"],
    exceptions: [
      "관계의 좋고 나쁨 · 사건 · 인연이 깊어지는 때 · 추천 날짜 · 두 사람의 시기가 맞물리는 해를 말하지 않는다 — 그런 계산을 하지 않았다",
      "대운의 시작 · 끝은 엔진이 계산한 대략적인 시점(연-월)이다",
      "일주가 절기 당일 · 경계 · 자시 관법에 걸려 달라질 수 있으면(uncertain) 해석에 쓰지 않는다",
      "점수 · 확률로 바꾸지 않는다",
    ],
  }),
];

/** 사주 궁합 · 리포트 궁합(유료, 판매하지 않음)의 풀이 재료 두 가지(compat-extra.ts) — 새 판정 규칙이 아니라 이미 계산된 값(오행 개수 · 개운 보완 후보 · 오행 대응표)을 두 사람 몫으로 나란히 놓는 것이다(운영자 2026-10-17) */
export const COMPAT_EXTRA_RULE_META: RuleMeta[] = [
  saju({
    id: "compat-chart", title: "두 사람의 오행 분포를 나란히 놓기", match: /^compat\.chart$/,
    calculation: "각자의 원국 글자(천간 + 지지, 지장간 제외)의 오행 개수와 일간을 그대로 옮긴다(만세력 엔진이 계산한 elementCounts, 외부 만세력과의 교차 검증 대상). 새로 계산하는 값은 없다.",
    interpretation: "한쪽에 적은 기운을 다른 쪽이 갖고 있으면 서로 채워 주는 조합으로, 같은 기운이 둘 다 많으면 닮은 면이 큰 조합으로 읽는 compat.element.* 규칙의 재료를 풀이가 쓰기 쉽게 한곳에 보여 준다.",
    conditions: ["두 사람의 원국이 계산돼 있을 때 항상 만든다(출생 시각을 모르는 사람이 있으면 근거 강도를 weak로 낮추고 세 기둥 기준이라고 적는다)"],
    exceptions: [...COMPAT_EXCEPTIONS, "오행이 적거나 없다는 것이 결함이라는 뜻이 아니다", "출생 시각을 모르는 사람의 없음 · 적음은 시주에 있을 수 있어 전체에 없다고 읽지 않는다", "점수 · 확률로 바꾸지 않는다"],
  }),
  saju({
    id: "compat-fortify", title: "두 사람이 함께 쓸 수 있는 전통 개운(각자의 보완 후보 1순위와 오행 대응)", match: /^compat\.fortify$/,
    calculation: "각자의 보완 후보 1순위(fortune.ts의 fortifyOf — 원국 오행 개수에서 없거나 1개뿐인 기운을 개수가 적은 순으로 고르고, 겨울 · 여름 태생의 계절 보완 후보는 2순위 이하)를 두 사람 몫으로 나란히 놓고 그 기운의 전통 오행 대응(방향 · 색 · 수(數) · 장소, ELEMENT_FORTUNE)을 붙인다. 새로 계산하는 값은 없고 개운 대응표는 DIR-1(개인 심층)과 같은 표다.",
    interpretation: "부족한 기운을 생활에서 보태는 상징적인 개운법을 두 사람이 함께 머무는 공간 · 만나는 장소 · 소품의 색 · 산책 방향 · 즐겨 쓰는 번호로 옮겨 소개한다. 필요한 기운을 판정한 것이 아니고 효과를 보장하지 않는다.",
    conditions: ["두 사람의 원국이 계산돼 있을 때 항상 만든다(출생 시각을 모르는 사람이 있으면 weak · 세 기둥 기준, 절기 · 자시 경계에 걸린 기둥이 있으면 uncertain)"],
    exceptions: [...COMPAT_EXCEPTIONS, "오행의 방향 · 색 · 숫자 대응은 널리 알려진 서술이지만 문헌에서 직접 확인하지 못했다", "개인별 계산 없이 색 · 방향 · 숫자를 임의로 정하지 않는다 — 같은 두 사람이면 늘 같은 결과다", "격국 · 용신 · 희신 · 기신을 판정하는 데 쓰지 않는다"],
  }),
];

/** 리포트 궁합(아직 만들지 않음)의 장면 질문 두 사람 비교 규칙(compat/pair-scene-evidence.ts). 사주 근거가 아니라 응답 근거라 kind는 survey다 */
const PAIR_SCENE_EXCEPTIONS = [
  "두 사람 모두 그 영역의 두 장면에 선택지로 답했을 때만 근거를 만든다 — 거의 없었어요 · 맞는 선택지 없음 · 미응답은 그 영역을 읽지 않고 없는 응답을 만들어 채우지 않는다",
  "한 문항으로 사람이나 영역을 정하지 않고 어떤 이름표(유형)도 붙이지 않는다 — 점수 · 궁합 지수도 만들지 않는다",
  "속마음을 사실로 말하지 않는다 — 엇갈림은 \"마음이 없어서가 아니라 방식이 다른 것일 수 있다\"로, 닿음은 \"~모양일 수 있다\"로만 쓴다",
  "어느 쪽 답이 더 좋다고 말하지 않고 한 사람을 고치라고 하지 않는다 — 두 사람이 각자 해 볼 수 있는 것과 같이 해 볼 행동을 함께 쓴다",
  "사람 이름 · 생년월일은 근거에 들어가지 않는다(A님 · B님)",
];
export const PAIR_SCENE_RULE_META: RuleMeta[] = [
  {
    id: "pair-scene-cross", title: "건네는 방식 ↔ 크게 느끼는 방식의 닿음 · 엇갈림(애정 표현 · 혼자 시간 · 원하는 확인 · 도움 주고받기)", match: /^pair\.scene\.K[1235]$/, kind: "survey",
    calculation: "한 영역의 두 장면(내가 받고 싶은 것 · 내가 상대에게 하는 것)의 선택지 이름표가 같은지로, A가 건네는 방식과 B가 크게 느끼는 방식 · B가 건네는 방식과 A가 크게 느끼는 방식을 각각 닿음 · 다름으로 센다. 단위 테스트(pair-scene-evidence.test.ts)로 16개 답 조합 모두 읽히는지 확인한다.",
    interpretation: "닿으면 건넨 마음이 잘 전해지는 모양일 수 있다고, 다르면 건넨 마음이 덜 전해질 수 있지만 마음이 없어서가 아니라 방식이 다른 것일 수 있다고 한 가지로 서술한다. 서로가 해 볼 수 있는 것과 건넬 짧은 말은 선택지마다 고정한 문장이다.",
    source: "개발 중 정한 설계 가설이다. 사랑 표현 방식 · 성인 애착 · 사회적 지지 연구가 다루는 주제와 닮았으나(숨기지 않는다) 그 연구의 문항 · 채점 · 유형 이름을 가져오지 않았다. 문헌 근거는 확인하지 못했다.",
    conditions: ["두 사람 모두 그 영역의 두 장면에 선택지로 답했을 때"], exceptions: PAIR_SCENE_EXCEPTIONS, review: "unreviewed", version: "0.1",
  },
  {
    id: "pair-scene-same", title: "같은 장면의 두 사람 답 비교(계획 · 약속 · 연락 · 서운함 · 갈등 · 회복)", match: /^pair\.scene\.K[467]$/, kind: "survey",
    calculation: "한 영역의 두 장면에서 A와 B가 고른 선택지 이름표가 같은지 같은 장면끼리 센다. 단위 테스트로 16개 답 조합 모두 읽히는지 확인한다.",
    interpretation: "같은 방식이면 서로의 반응을 이해하기 쉽지만 같은 곳에서 함께 막힐 수 있다고, 다른 방식이면 같은 일을 서로 다르게 받아들이기 쉽지만 누가 맞고 틀린 것이 아니라 반응이 다른 것일 수 있다고 한 가지로 서술한다. 서로가 해 볼 수 있는 것과 건넬 짧은 말은 선택지마다 고정한 문장이다.",
    source: "개발 중 정한 설계 가설이다. 계획 · 즉흥 선호, 성인 애착, 갈등 처리 방식을 다룬 널리 알려진 연구와 닮았으나(숨기지 않는다) 문항 · 채점 · 유형 이름을 가져오지 않았다. 문헌 근거는 확인하지 못했다.",
    conditions: ["두 사람 모두 그 영역의 두 장면에 선택지로 답했을 때"], exceptions: PAIR_SCENE_EXCEPTIONS, review: "unreviewed", version: "0.1",
  },
];

/** 근거 ID가 나온 규칙 (없으면 null — 새 근거를 만들면서 이 기록을 빠뜨리지 않았는지 테스트가 확인한다) */
export function ruleFor(evidenceId: string): RuleMeta | null {
  return RULE_META.find((r) => r.match.test(evidenceId)) ?? null;
}

export function ruleIdsOf(evidence: Pick<Evidence, "id">[]): string[] {
  return [...new Set(evidence.map((e) => ruleFor(e.id)?.id).filter((x): x is string => Boolean(x)))];
}
