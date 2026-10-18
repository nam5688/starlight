// 개인 심층 리포트 7개 대주제 — 운영자 확정 구성(2026-10-17, 앞서 검토한 12개 장 안은 운영자가 취소했다). 이 파일의 구성 · 한도 · 고정 문구가 지시문(story7-prompt.ts) · 검사(story7-validate.ts) · 조립(story7-assemble.ts) ·
// 모의 작성기가 쓰는 한 곳이다(story-7 형식으로 신규 생성에 연결, `lib/config/product.ts`의 `REPORT_GENERATION.format`). **실제 AI로 검증하기 전에는 판매에 쓰지 않는다**(운영자 결정) — 판매 스위치는 그대로다.
// 7개 대주제는 모든 리포트에 고정으로 보이고, 장마다 **다른 핵심 질문 하나**에만 답한다. 7개를 억지로 길게 쓰지 않는다 — 장마다 소유한 근거 수에 맞춰 문단 상한이 달라진다(`maxParagraphs`).
// 장의 종류는 둘이다: **근거를 소유하는 장**(1 · 3 · 4 · 5 · 6)과 **앞 장을 엮는 장**(2 · 7). 엮는 장은 자기 근거가 없으므로 앞 장을 다시 쓰지 않고 `mustAdd`(새로 보태야 할 것)만 쓴다.
// 12개 장 안에서 겹쳤던 근거를 합쳤다: 사주 구조 · 기질 · 핵심 성향 → 1, 연애 · 애착 · 갈등 · 회복 → 3(같은 관계 응답 두세 개를 두 장이 나눠 쓰던 문제), 일 · 재물 → 5(소제목으로 구분), 겉과 속 → 폐기(근거 없음).
// **사주 중심 풀이로 방향 고정(운영자 2026-10-17)**: 미유는 사주풀이가 중심이고 성격 · 기질 · 애착 · MBTI는 그 풀이를 개인화하는 보조 정보다. 7개 대주제는 그대로 두고(목차를 늘리지 않는다) 장마다 **새로 알려 주는 사주 정보**를 정했다 —
// 1 일간 · 오행 · 십성 / 2 매력 · 쓴소리(뿌리 · 강약 후보) / 3 연애운 · 잘 맞는 상대 / 4 인복 · 가족 · 친구 · 동료 · 가까이 둘 사람 / 5 직업운 · 적성 · 재물복 / 6 대운 · 세운 + 행운의 색 · 방향 · 숫자 · 장소 · 개운법 / 7 마지막 조언.
// 반복의 기준은 낱말 횟수가 아니라 "앞 장에서 말한 결론을 새 정보 없이 되풀이하는가"다(코드는 낱말을 세지 않고, 사람이 읽는 평가가 본다). 신살 · 십이운성 · 격국 · 용신은 계산하지 않았으므로 계산한 것처럼 쓰지 않는다.
// 검토 문서: docs/story-7-sections-review.md · 측정: `node scripts/measure-story7.ts` · 기존 story-v1의 검사 · 한도는 그대로이고 이 초안은 그 위의 제안이다.
import type { Topic } from "../evidence.ts";

export type Story7Kind = "owner" | "synthesis";
export type StoryV1Source = "headline" | "cards" | "core" | "relation" | "work-money" | "flow" | "actions" | "focus";

export type Story7BlockId = "tendency" | "strength-burden" | "love" | "people" | "work-money" | "flow" | "advice";

export type Story7Section = {
  no: number;
  id: string;
  /** 저장 · 화면에서 이 장이 쓰는 블록 이름 — 채팅방 · 주제 이동이 이미 쓰는 id(tendency · strength-burden · love · work-money)를 그대로 쓴다. 6번은 flow, 7번은 advice(저장 모양은 types.ts) */
  blockId: Story7BlockId;
  /** 이동 막대에 보이는 짧은 이름 */
  navLabel: string;
  title: string;
  kind: Story7Kind;
  /** 운영자가 적은 세부 항목 — 이 장이 다루는 것 */
  includes: string[];
  /** 이 장만 답하는 질문 — 다른 장에서 같은 질문에 답하면 반복이다 */
  question: string;
  /** 같은 특징을 이 장 밖에서 다시 설명하지 않기 위한 기준 */
  repeatGuard: string;
  /** 엮는 장만: 앞 장을 다시 말하지 않고 새로 보태야 하는 것(없으면 한 문단으로 줄인다) */
  mustAdd?: string;
  /** 소제목이 있는 장(5번 "일" · "재물") */
  parts?: string[];
  /** 사주 근거 중 이 장이 앞세우는 것(id 모양) */
  sajuOwns: RegExp[];
  /** 응답 근거(survey · self) 중 이 장이 먼저 가져가는 것 — story-v1의 `prefer`와 같은 뜻 */
  prefer: RegExp;
  /** 응답 근거를 맞닿는 주제로 연결할 때 쓰는 주제(비우면 우선 소유 없음) */
  personalTopics: Topic[];
  /** 응답 근거가 모자랄 때 빌려 올 수 있는 주제 — 빌리면 다른 장과 같은 근거를 다시 쓰는 것이라 반복 압력으로 센다 */
  borrowTopics: Topic[];
  /** 응답 근거를 몇 개 이상 가져야 하는가(근거가 그만큼 있을 때) */
  personalMin: number;
  /** 문단 수 상한 — 지금 소유 근거가 많은 장만 길게 쓸 수 있다 */
  maxParagraphs: number;
  /** 상황형 28문항 후보에서 이 장이 앞세우는 장면(검토자 분류, 한 장면은 한 장에만) — 28문항은 아직 검증 전 초안이다 */
  scenes: string[];
  /** AI가 쓰지 않고 코드가 계산하는 재료 */
  code: string[];
  /** 지금 story-v1의 어느 칸에서 오는가 */
  from: StoryV1Source[];
  /** 표시 — 문장으로 쓴다. 없으면 null */
  duplicate: { with: number[]; why: string } | null;
  moreSaju: string | null;
  gap22: string | null;
  gap28: string | null;
};

const NEVER = /^$/;

export const STORY7_SECTIONS: Story7Section[] = [
  {
    no: 1, id: "me", blockId: "tendency", navLabel: "나는 누구", title: "나는 어떤 사람일까?", kind: "owner",
    includes: ["한마디로(대표 OOO형은 코드가 붙인다)", "일간 · 일주 · 오행의 분포", "십성 구조(많은 쪽 · 없는 쪽)", "월령 · 조후처럼 근거 목록에 있는 구조", "성격 · 기질 · 입력한 MBTI로 구체화"],
    question: "이 사주의 중심 구조(일간 · 오행의 분포 · 십성이 많고 없는 쪽 · 태어난 달의 기운)가 어떤 사람을 만드는가 — 그리고 평소 행동 방식(성격 · 기질 · 입력한 MBTI)이 그 모습을 이 사람에게 어떻게 구체적으로 보이게 하는가",
    repeatGuard: "여기서 푼 구조(일간 · 오행 · 십성의 분포)를 뒤 장에서 다시 해설하지 않는다 — 뒤 장은 그 구조가 그 장의 질문에서 새로 만드는 결론만 쓴다. 본문에는 명리 용어를 쓰지 않고 생활 말로 옮긴다([고객이 읽는 글])",
    sajuOwns: [/^saju\.daymaster$/, /^saju\.element\./, /^saju\.structure\.(chart|hidden|month|johu)$/, /^saju\.sipsung$/, /^saju\.hour\.unknown$/],
    prefer: /^survey\.(ei|sn|tf|jp|novelty|caution)\./, personalTopics: ["personality"], borrowTopics: ["personality"], personalMin: 2, maxParagraphs: 5, scenes: ["s01", "s02", "s06", "s07", "s09", "s10"],
    code: ["대표 유형명 OOO형(personal-type.ts · 화면 스위치 꺼짐)", "럭키 지수 카드(lucky.ts · 화면 스위치 꺼짐)", "원국 표(무료 화면에 이미 있음)"],
    from: ["headline", "core"],
    duplicate: { with: [2, 3, 5], why: "여기서 쓴 신중함 · 판단 방식이 5번(일 · 재물)과 2번(강점 · 부담)의 재료가 될 수 있다 — 같은 성향이 나와도 장마다 읽는 명리 근거와 결론이 달라야 한다" },
    moreSaju: "격국 · 용신 · 신살 · 십이운성은 계산하지 않는다(판정 보류) — 구조는 일간 · 오행 · 십성 분포 · 월령 · 조후 후보까지. 뿌리(통근) · 강약 후보는 2번이 푼다",
    gap22: "응답 근거는 기질 4 + 평소 행동 방식 4 + MBTI뿐이고 뚜렷한 쪽만 근거가 된다. 유형명 규칙(personal-type.ts)은 22문항 점수에서 계산된다",
    gap28: "구분 9개 중 정보를 받는 방식(2~3장면)은 읽을 수 없다. 유형명 분류 입력이 점수가 아닌 장면 읽기 결과로 바뀌면 규칙을 다시 설계해야 한다",
  },
  {
    no: 2, id: "strength-weakness", blockId: "strength-burden", navLabel: "강점 · 약점", title: "나의 강점과 약점", kind: "owner",
    includes: ["나만의 매력(타고난 강점)", "쓴소리(조심해야 할 행동 · 반복되기 쉬운 패턴)", "뿌리와 강약 후보에 따라 강점이 쓰이는 조건 · 부담이 되는 조건", "회복"],
    question: "이 사주가 힘을 받는 구조(일간의 뿌리 · 돕는 기운과 덜어내는 기운의 균형)가 어떤 조건에서 매력이 되고 어떤 조건에서 부담이 되는가, 그리고 이 사람이 조심해야 할 행동 패턴과 회복 방법은 무엇인가",
    repeatGuard: "1번에서 푼 오행 · 십성 구조를 다시 설명하지 않고 \"뿌리 · 강약 후보\"가 만드는 조건만 쓴다. 단순 긍정 · 부정 형용사 나열 금지 — 쓴소리는 막연한 훈계가 아니라 이 구조에서 반복되기 쉬운 행동 하나를 짚는다",
    sajuOwns: [/^saju\.structure\.(strength|roots)$/, /^saju\.void$/],
    prefer: /^survey\.(persistence|caution|ei|novelty)\./, personalTopics: ["personality"], borrowTopics: ["personality"], personalMin: 1, maxParagraphs: 3, scenes: ["s08", "s11", "s14"],
    code: ["카드의 강점 · 힘들 수 있는 포인트 키워드(이 장의 결론을 줄인 것)"],
    from: ["cards", "core"],
    duplicate: { with: [1, 3, 5, 7], why: "강점 · 부담은 모든 장에서 나오는 판단이라 이 장이 가장 겹친다 — 그래서 이 장은 뿌리 · 강약 후보라는 자기 근거로만 쓰고, 다른 장에서는 강점 · 부담이라는 판단어를 쓰지 않는다" },
    moreSaju: "강약은 후보이고 요소가 한쪽으로 모였을 때만 말한다. 조건을 만들 때 없는 십성 · 오행을 능력 부족으로 풀지 않는다(전통 해석의 조건형 풀이는 허용한다)",
    gap22: "회복을 묻는 문항이 없어 \"회복 방법\"을 읽을 응답 근거가 에너지 방식(평소 행동 방식 한 가지) 하나뿐이다 — 회복은 사주 근거로 조건형으로 쓴다",
    gap28: "회복 장면 s08 · s11 · s14 세 개가 있어 \"혼자 / 사람 곁 / 몸을 움직여\" 같은 회복 방식을 읽을 수 있다(사람 시험 전)",
  },
  {
    no: 3, id: "love-attachment", blockId: "love", navLabel: "연애 · 애착", title: "연애와 애착", kind: "owner",
    includes: ["연애운 · 배우자 자리", "잘 맞는 상대의 분위기와 큰 방향(연상 · 또래 · 연하 쪽)", "연애 성향 · 애정 표현 · 친밀감", "갈등과 화해(애착)"],
    question: "배우자 자리와 합 · 충이 말하는 연애의 모습과 어떤 분위기의 상대가 편한가, 그리고 가까운 사람 앞에서 마음을 주고 표현하는 방식 · 거리의 속도 · 어긋났을 때 확인하고 회복하는 순서",
    repeatGuard: "애착 유형 이름을 쓰지 않고 한 문항으로 단정하지 않는다. 친구 · 가족 · 동료 이야기는 4번에서 쓴다(연애 풀이를 다시 쓰지 않는다). 상대의 구체적인 나이 · 직업 · 마음 · 만나는 날짜 · 결혼 여부와 시기는 쓰지 않는다",
    sajuOwns: [/^saju\.spouse-/, /^saju\.partner$/, /^saju\.relation\.(?:day-[a-z]+|[a-z]+-day)\./, /^saju\.frame\.(?:L[1-5]|base-love|base-peer|audience\.(?:teen|child))$/],
    prefer: /^survey\.(anxiety|avoidance|closeness|sensitivity)/, personalTopics: ["love", "marriage", "relationship"], borrowTopics: ["love", "relationship"], personalMin: 1, maxParagraphs: 4,
    scenes: ["s15", "s16", "s17", "s18", "s19", "s20", "s21", "s24"],
    code: ["인연의 경향(partner.ts — 연상 · 또래 · 연하 쪽, 코드가 계산)", "연애운이 강해지는 달 달력(months.ts · 성별 필요)"],
    from: ["relation"],
    duplicate: { with: [4], why: "타인 반응 민감도 응답을 연애와 인간관계가 함께 쓰면 같은 말이 두 번 나온다 — 연애에는 가까운 관계 반응, 인간관계에는 에너지 방식만 앞세운다" },
    moreSaju: "연애 경험 · 현재 연애 상태 입력이 없어 상태를 지어내지 않는다 — 근거는 배우자 별 · 자리(성별은 엔진이 이미 반영) · 인연의 경향(일지) · 일지가 낀 합 · 충과 응답이다",
    gap22: "애정 표현 · 갈등 뒤 회복 · 도움 요청을 묻는 문항이 없고 관계 불안 · 거리 두기 두 개(둘 다 높을 때 한 개 더) + 민감도뿐이다 — 연애운 · 잘 맞는 상대는 응답이 없어도 사주 근거(배우자 자리 · 인연의 경향)로 끝까지 쓴다",
    gap28: "장면 8개(s15~s21 · s24)로 가장 풍부하다 — 확인 · 회복 구분은 읽을 수 있고 도움 받는 방식은 s18 · s21 2장면이라 읽지 못한다",
  },
  {
    no: 4, id: "people", blockId: "people", navLabel: "인간관계", title: "인간관계와 인연", kind: "owner",
    includes: ["인복(도움을 주는 사람)", "가족 인연(전통 육친으로 읽는 경향)", "친구 · 동료", "가까이 둘 사람의 특징"],
    question: "연애 밖의 사람들(윗사람 · 친구 · 동료 · 가족) 사이에서 도움을 받는 인연의 모습은 어떻고, 관계의 폭과 깊이 · 협력이 쉬운 조건과 부딪히기 쉬운 조건, 그리고 가까이 두면 균형이 맞는 사람은 어떤 분위기인가",
    repeatGuard: "연애 풀이를 다시 쓰지 않는다. 가족은 전통 육친 대응으로 읽는 경향까지만 쓰고(가족 구성 · 가족과 있었던 일 · 관계의 좋고 나쁨을 아는 것처럼 쓰지 않는다 · 자녀 · 출산 이야기는 하지 않는다), 귀인을 신살로 계산한 것처럼 쓰지 않는다 — 도움을 주는 사람은 인성 · 비겁 · 관성의 자리와 보완 기운의 성향으로 읽는다",
    sajuOwns: [/^saju\.kin$/, /^saju\.tengod\.(인성|비겁)/, /^saju\.relation\.(?!(?:day-[a-z]+|[a-z]+-day)\.)/],
    prefer: /^survey\.(ei|sensitivity)\./, personalTopics: ["relationship"], borrowTopics: ["relationship"], personalMin: 1, maxParagraphs: 4, scenes: ["s04", "s12", "s22", "s26"],
    code: [],
    from: ["relation"],
    duplicate: { with: [3, 1], why: "3번과 같은 민감도 · 에너지 응답, 1번과 같은 에너지 방식을 다시 쓰기 쉽다" },
    moreSaju: "**가족 인연은 전통 육친 대응(인성 어머니 · 윗사람 · 스승, 편재 아버지 · 현실의 지원, 비겁 형제 · 친구 · 동료, 관성 상사)으로 읽는 조건형 풀이까지만** — 가족 구성 · 관계 입력이 없고 년주 · 월주를 조상 · 부모 자리로 읽는 규칙은 전문가 검토 전이다(규칙 이력 fortune-kin). **귀인 · 사람복은 신살로 계산하지 않았다** — 도움을 주는 쪽(인성 · 비겁)과 보완 기운의 성향을 가진 사람으로만 읽는다",
    gap22: "친구 · 가족 · 동료 맥락을 묻는 문항이 없다 — 인복 · 가족 · 곁에 둘 사람은 사주 근거(육친 · 십성 · 보완 기운의 성향)로 쓰고, 응답은 에너지 방식 · 민감도 두 근거로 협력 장면을 구체화하는 데만 쓴다",
    gap28: "장면 s04 · s12 · s22 · s26 네 개(친구 · 모임 · 낯선 사람) — 가족 · 동료 장면은 없고, 구분을 읽을 맥락 두 가지는 못 채운다",
  },
  {
    no: 5, id: "work-money", blockId: "work-money", navLabel: "일 · 재물", title: "일과 재물", kind: "owner",
    includes: ["직업운 · 적성(어울리는 일의 계열)", "일하는 방식 · 맞는 업무 환경", "재물복 · 돈이 들어오고 나가는 양상"],
    question: "이 사주가 말하는 일의 계열과 힘이 잘 쓰이는 조건(역할 · 권한 · 속도 · 협업 · 평가 기준), 그리고 돈이 들어오는 길과 나가기 쉬운 길(재물복의 구조) — 명리 근거가 말하는 범위까지",
    repeatGuard: "일 소제목과 재물 소제목이 같은 응답(신중함 · 생활 방식)을 되풀이하지 않는다 — 재물은 돈이 들어오고 나가는 구조로만 쓴다. 적성을 직업 하나로 단정하거나 성공 · 부자를 보장하지 않는다. 투자 · 대출 · 부동산 · 창업 권유 금지",
    parts: ["일", "재물"],
    sajuOwns: [/^saju\.tengod\.(식상|관성|재성)/, /^saju\.combo\./, /^saju\.(career|wealth)$/, /^saju\.frame\.(?:W[1-7]|base-wealth)$/],
    prefer: /^survey\.(sn|tf|jp|novelty|caution|persistence)\./, personalTopics: ["work", "money"], borrowTopics: ["work", "money"], personalMin: 1, maxParagraphs: 5,
    scenes: ["s03", "s05", "s13", "s23", "s25", "s27", "s28"],
    code: ["재물 · 소비 흐름 달력(months.ts — 사건이 아닌 주제 표시)"],
    from: ["work-money"],
    duplicate: { with: [1], why: "신중함 · 지속성 · 새로움은 1번의 기질과 같은 근거다 — 1번은 \"성향\", 5번은 \"일 장면에서의 조건\"으로만 쓴다" },
    moreSaju: "재물은 모든 리포트에 있다 — 재성의 정재 · 편재 구성 · 식상 → 재성 · 비겁 > 재성 · 재성이 일간을 돕는 쪽보다 많은 구조처럼 근거 목록의 `saju.wealth`가 읽는 범위까지 \"돈이 들어오고 나가는 양상\"을 쓴다(재물복 · 재물운이라는 말을 쓸 수 있다). 부자 · 가난을 정하지 않고 소득 · 소비 · 저축은 입력받지 않았다. 일의 계열은 `saju.career`가 읽는 범위까지 쓰며 직업 하나로 단정하지 않는다",
    gap22: "일 · 돈을 직접 묻는 문항이 없다 — 직업운 · 재물복은 응답이 없어도 사주 근거(십성 분포 · 재물 읽기)로 끝까지 쓰고, 응답은 일하는 방식을 구체화하는 데만 쓴다",
    gap28: "일 장면 6개(s03 s13 s23 s25 s27 s28)로 풍부하나 재물은 s05 한 장면뿐이라 읽을 수 없다",
  },
  {
    no: 6, id: "timing", blockId: "flow", navLabel: "앞으로의 운", title: "앞으로의 운과 변화", kind: "owner",
    includes: ["지나온 시기 회고(지난 대운 · 세운에서 읽히는 연애 · 일 · 재물 · 성장의 주제 — 근거에 적힌 나이 범위 안에서 가능성으로)", "계산된 대운 · 세운 시기 풀이(지금과 앞으로)", "행운의 색 · 방향 · 숫자 · 장소", "일상에서 활용하는 개운법"],
    question: "지나온 시기에는 어떤 주제가 두드러졌을 수 있고(근거에 적힌 나이 범위 안에서, 가능성으로), 지금과 가까운 앞으로는 어떤 주제가 두드러지는가 — 연애 · 일 · 재물의 흐름이 하나의 이야기로 이어지게. 이 사람이 그 시기를 어떻게 받아들일까 — 그리고 부족한 기운을 생활에서 보태는 전통 개운법(보완 기운의 방향 · 색 · 숫자 · 장소 · 습관)은 무엇인가",
    repeatGuard: "시기 이야기(대운 · 세운 · 올해 · 연도 · 지난 시기의 나이 범위)는 이 장에만 쓴다 — 다른 장에서 다시 말하지 않는다(PERIOD_TALK 규칙 유지). 3번 · 5번에서 푼 연애 · 재물 구조는 다시 해설하지 않고 시기와 이어지는 결론만 쓴다. 지난 시기는 확인된 사건이 아니라 가능성으로만 쓰고, 근거에 적힌 나이 · 연도 밖의 나이 · 연도와 근거 없는 사건 예언은 금지. 개운법은 근거 목록의 보완 기운(`saju.fortify`)의 대응만 일관되게 쓰고 임의로 색 · 방향 · 숫자를 바꾸지 않으며, 재산 증가 · 건강 회복 · 투자 성공을 보장하지 않는다",
    sajuOwns: [/^saju\.(daeun|seun)\./, /^saju\.fortify$/, /^saju\.frame\.(?:L6|W8|R[1-6])\./, /^saju\.frame\.base-past$/], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, maxParagraphs: 6, scenes: [],
    code: ["큰 흐름 타임라인(luckTimeline)", "월별 달력(months.ts)"],
    from: ["flow"],
    duplicate: { with: [7], why: "7번의 실천 조언이 시기 · 개운법을 다시 말하면 반복이다" },
    moreSaju: "개운은 원국 오행 개수와 태어난 계절만으로 정한 보완 후보(용신 판정이 아니다)의 전통 오행 대응이다 — 방향 · 계절 · 색 · 수(數) · 장소는 표 하나(fortune.ts)에서 같은 기운이면 늘 같은 결과로 나온다",
    gap22: null, gap28: null,
  },
  {
    no: 7, id: "advice", blockId: "advice", navLabel: "종합 조언", title: "미유의 종합 조언", kind: "synthesis",
    includes: ["앞으로 이 풀이를 어떻게 활용하면 좋을지 — 실천 가능한 조언 2~3가지"],
    question: "앞 장을 모두 보았을 때 지금 무엇을 먼저 할 것인가 — 알려 준 고민이 있으면 그 고민에, 없으면 이 분석에서 읽힌 우선순위에",
    repeatGuard: "앞의 장을 다시 요약하지 않는다. 앞 장에서 쓴 처방(예: 회복 신호 · 개운 습관)을 같은 말로 되풀이하지 않는다. 알려 준 고민이 없으면 고민을 지어내지 않는다",
    mustAdd: "서로 다른 앞 장 둘 이상의 결론이 만나는 곳에서만 나오는 행동 2~3개와 \"왜 이 순서인가\" — 시점이나 기간을 임의로 정하지 않는다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, maxParagraphs: 2, scenes: [], code: [],
    from: ["actions", "focus"],
    duplicate: { with: [2, 6], why: "행동이 앞 장의 결론을 다시 쓰는 자리다" },
    moreSaju: null,
    gap22: "**\"현재 고민을 반영한\"을 받을 입력 경로가 지금 화면에 없다** — 고민 입력(내 고민 자세히 알려주기 · 고민 기록소)이 `CONCERN_RECORDS.visible = false`로 숨겨져 있어 심층 리포트 생성 때 고민이 거의 항상 비어 있다. 고민이 없으면 이 장은 고민을 반영한 조언이 아니라 \"분석에서 읽힌 우선순위\" 조언이 된다",
    gap28: "28문항은 고민을 묻지 않는다 — 7번 장의 입력 문제는 문항 교체로 해결되지 않는다",
  },
];

export const STORY7_BY_NO = (no: number): Story7Section => {
  const s = STORY7_SECTIONS.find((x) => x.no === no);
  if (!s) throw new Error(`없는 대주제 번호: ${no}`);
  return s;
};

/** 28문항의 장면 번호(s01~s28) 28개를 한 장에 하나씩 나눈 표 — 장면 소유자 */
export const STORY7_SCENE_OWNER: Record<string, number> = Object.fromEntries(STORY7_SECTIONS.flatMap((s) => s.scenes.map((sc) => [sc, s.no])));

// ── 제품 연결에 쓰는 값 (지시문 · 검사 · 조립 · 모의 작성기 · 시험이 같은 값을 쓴다) ──

export const STORY7_FORMAT = "story-7";
/** 지시문 버전 — 0.7은 고객이 읽는 글을 사람의 성향 · 경험 · 관계 · 기회 이야기로 쓰게 한 판이다(운영자 조율 2026-10-18 — 본문에서 명리 용어를 빼고 내부 근거는 그대로 둠, 엔진 · 프레임 · 7개 장 · 분량 · BLOCK 정책 불변, 실제 AI로 시험하지 못했다). 0.6은 명리 조합 해석 프레임 근거(지난 · 지금 · 앞으로의 대운 · 세운과 만 나이 범위)와 기본 풀이 · 연령대 범위를 연결한 판이다(운영자 2026-10-18, 실제 AI로 시험하지 못했다). 0.3은 사주 중심 풀이로 방향을 고정한 판이고, 0.4는 출생 시각을 모르는 사람의 풀이 범위(세 기둥 기준 · 시주 풀이 금지)와 사주 모습 · 응답의 일치 · 차이 설명을 더한 판이다(운영자 2026-10-17). 0.2까지의 실제 AI 글(1건)은 형식 검사를 통과하지 못했고 0.3 · 0.4로는 아직 한 번도 시험하지 못했다(검증되지 않음) */
export const STORY7_PROMPT_VERSION = "story-7-prompt-0.7";

/** 글자 · 문장 수 한도 — 7개 대주제는 장마다 소유한 근거 수에 맞춰 문단 수 상한(`maxParagraphs`)이 달라지고, 나머지 한도는 영역별 이야기(story-v1)와 같은 값이다 */
export const STORY7_LIMITS = {
  /** 맨 위 핵심 문장 — 0.2까지의 10~40자는 실제 AI 글(41자)이 형식 검사에 걸렸다. 사주 풀이 한마디가 조금 길어질 수 있어 46자까지 */
  headline: { min: 10, max: 46 },
  sectionHeadline: { min: 8, max: 40 },
  /** 한 문단은 4문장까지 — 사주 근거를 풀고 이어서 생활 풀이를 쓰려면 3문장으로는 모자랐다(실제 AI 글이 4문장 문단 두 곳에서 걸렸다) */
  paragraph: { min: 60, max: 420, sentencesMax: 4 },
  /** 5번 일과 재물 — 소제목마다 문단 수(두 소제목 합은 그 장의 maxParagraphs 이하, 재물 소제목은 근거가 약해도 비워 두지 않는다) */
  part: { min: 1, max: 3 },
  years: { min: 1, max: 3, themeMax: 40 },
  scenarios: { min: 1, max: 2, whenMax: 90, thenMax: 220 },
  actions: { min: 2, max: 3, titleMax: 30, detailMin: 20, detailMax: 220 },
  /** 두 제목이 이 몫 이상 같은 낱말이면 같은 말로 본다 */
  headlineOverlapMax: 0.5,
} as const;

/**
 * 사주 용어 한도 — 사주 중심 풀이는 일간 · 일주 · 오행 · 십성을 풀어 주는 글이라 영역별 이야기의 한도(한 문장 둘 · 한 문단 둘 · 첫 문단 0)보다 넓힌다(실제 AI 글이 "사주 용어 4개 · 한 문장 3개"로 걸렸다).
 * 설명 없는 용어 · 근거 없는 판정은 그대로 막고(terms.ts), 처음 쓸 때 풀이를 붙이는 것도 그대로다.
 */
export const STORY7_TERMS = { perSentenceMax: 3, perParagraphMax: 4, firstParagraphMax: 2 } as const;

/** 장 하나의 "~해 보세요" 과제 문장 수 — 6번은 일상 개운법(색 · 방향 · 숫자 · 장소 · 습관)을 말하는 장이라 더 넓다. 구체적 실천은 7번 조언에 모은다 */
export const STORY7_TASK_MAX = { default: 2, 6: 4 } as const;

/**
 * 같은 응답 근거를 앞세울 수 있는 장 수 — 운영자 지시(2026-10-17: 반복은 낱말 횟수가 아니라 앞 장의 결론을 새 정보 없이 되풀이하는가로 본다)에 따라 사실상 풀었다.
 * 같은 응답이 거의 모든 장을 끌고 가는 경우만 걸러내고(근거를 소유하는 장 여섯 가운데 다섯 이상), 새 정보를 주는지는 사람이 읽는 평가가 본다.
 */
export const STORY7_PERSONAL_REUSE = { maxAreas: 4, minPoolToCheck: 5 } as const;

/** 7개 장 가운데 입력한 MBTI를 쓸 수 있는 장 — 맞닿는 곳에서만, 시기(6번)에는 쓰지 않는다 */
export const STORY7_MBTI_NOS = [1, 3, 5] as const;
export const STORY7_MBTI_MIN = 2;
/** 같은 개인 성향 근거가 몇 개 장까지 앞세워질 수 있는가를 세는 장 — 근거를 소유하는 장(앞 장을 엮는 2 · 7번은 자기 근거가 없어 세지 않는다) */
export const STORY7_OWNER_NOS = [1, 2, 3, 4, 5, 6] as const;

/**
 * 맺음 틀 예산 — story-v1의 예산에 "계속 ~라면 ~"과 "~하는 게 좋아요" 변형을 더했다(실제 AI 첫 글과 대리 작성기 글에서 틀을 바꿔 되풀이한 말).
 * 표지를 센 어림이며, 장마다 다른 모양으로 맺는지는 지시문과 사람이 읽는 평가가 본다.
 */
export const STORY7_FORMULA_BUDGET: { re: RegExp; max: number; label: string }[] = [
  { re: /맞아 보여요/g, max: 4, label: "맞아 보여요" },
  { re: /(?:볼|살펴볼|물어볼|짚어 볼|확인해 볼) (?:때|차례|신호)(?:예요|이에요)/g, max: 2, label: "~볼 때예요" },
  { re: /계속 [^.!?]{0,40}(?:라면|다면|이어지면|하다 보면)/g, max: 2, label: "계속 ~라면" },
  { re: /(?:살펴보|확인해 보|물어보|짚어 보)는 게 좋아요/g, max: 2, label: "~하는 게 좋아요" },
];

/** 가족 이름 — 가족 구성 · 가족과 있었던 일은 입력받지 않았다. 전통 육친 대응으로 읽는 경향은 쓸 수 있으나(운영자 2026-10-17) 사실처럼 쓰지 않도록 조건형 · 전통 해석 표지가 있는 문장만 허용한다 */
export const FAMILY_CLAIM = /부모님?|형제|자매|어머니|아버지|엄마|아빠/;
/** 가족 이야기가 읽는 방식임을 밝히는 표지 — 전통 육친 · 해석 · 읽는다 */
export const TRADITION_MARK = /전통|육친|해석|읽혀요|읽어요|읽을 수|읽는|읽히|봐요|보는/;
/** 재물의 운명을 확정하는 말 — 재물복 · 돈이 들어오고 나가는 양상은 쓸 수 있지만(운영자 2026-10-17) 부자가 된다 · 평생 가난하다처럼 결과를 정하지 않는다 */
export const WEALTH_FATE = /(?:큰\s*)?부자가\s*(?:돼|될|되|된)|가난(?:해|하게|할|한 삶)|평생\s*(?:돈|재물)|돈이 (?:썩|넘쳐)/;
/** 돈 습관을 말하는 낱말 — 소비 · 저축 · 투자 습관을 직접 물은 응답이 없으므로 이 사람의 습관을 사실처럼 쓰지 않고 조건형 · 질문으로만 쓴다 */
export const MONEY_HABIT = /저축|소비|지출|씀씀이|투자|통장|지갑|돈 관리|돈을 쓰/;
/** 조건형 · 질문 · 전통 해석 표지 — 돈 습관 · 가족 문장에 이 표지가 없으면 습관 · 사실을 단정한 것으로 본다(어림) */
export const CONDITIONAL_MARK = /(?:수 있|기 쉬|듯해|(?:면|라면|다면|으면) |때는|때에는|경우|살펴볼|볼 만|[?]|일 수|곳이에요|쪽에 가깝|가능성|편이라면|전통|읽혀요|읽어요|읽을 수|봐요|보는 해석|해석에서)/;

/**
 * 지난 일을 사실로 말하는 문장 — 지난 시기의 연애 · 일 · 재물 이야기는 사주에서 읽은 가능성이지 입력받은 사건이 아니다(운영자 2026-10-18).
 * "헤어졌을 수 있어요"처럼 조건형 · 전통 해석 표지가 있는 문장은 허용하고, 표지 없이 "만 21세에 헤어졌어요"라고 쓴 문장을 막는다(어림).
 */
export const PAST_EVENT_CLAIM = /(?:헤어졌|이별했|결혼했|이혼했|사귀었|사귀게 됐|만났|만나게 됐|퇴사했|그만뒀|합격했|취직했|입사했|이직했|창업했|이사했|전학했|입학했|졸업했|승진했|돈을 잃|손해를 봤|빚을 졌|큰돈을 벌었|크게 벌었)/;

/** 코드가 붙이는 한 줄 안내 — AI가 "자료가 없어요"를 쓰지 않게 하려고 자료가 실제로 없는 곳(상대 · 가족 · 동료 · 돈 응답)만 여기서 밝힌다 */
/** 6번 장(앞으로의 운과 변화)의 개운 풀이에 한 번만 붙는 안내 — 문장마다 붙이지 않고 코드가 한곳에 붙인다(운영자 2026-10-17: 풀이의 분위기를 깨지 않게) */
export const STORY7_FLOW_NOTE = "색 · 방향 · 숫자 · 장소는 전통 오행 대응에 따른 상징적인 개운법이에요. 효과를 보장하지 않고, 이미 가진 것으로 가볍게 먼저 해 볼 수 있어요.";

export const STORY7_CAVEAT: Partial<Record<Story7BlockId, (name: string) => string>> = {
  love: (name) => `상대 자료: 없음 · 이 부분은 ${name.trim() ? `${name.trim()} 님의 ` : ""}사주와 응답만으로 읽었어요.`,
  people: () => "친구 · 가족 · 동료와의 실제 관계를 입력받은 것은 아니에요. 사주에서 읽히는 관계의 경향과 평소 반응에서 읽은 것만 썼어요.",
  "work-money": () => "돈 부분은 소비 · 저축 습관을 직접 물은 응답이 아니라 사주의 재물 해석을 중심으로 읽었어요. 투자나 대출 결정의 근거가 아니에요.",
};

export const story7SectionOf = (no: number): Story7Section | undefined => STORY7_SECTIONS.find((s) => s.no === no);
