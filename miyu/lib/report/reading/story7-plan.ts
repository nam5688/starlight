// 개인 심층 리포트 7개 대주제 — 검토용 초안 (운영자 확정 구성 2026-10-17, 앞서 검토한 12개 장 안은 운영자가 취소했다). **어디에도 연결하지 않았다**(`story7.test.ts`가 확인) — 지금 신규 생성은 story-v1(영역 셋 + 시기 + 행동)이다.
// 7개 대주제는 모든 리포트에 고정으로 보이고, 장마다 **다른 핵심 질문 하나**에만 답한다. 7개를 억지로 길게 쓰지 않는다 — 장마다 소유한 근거 수에 맞춰 문단 상한이 달라진다(`maxParagraphs`).
// 장의 종류는 둘이다: **근거를 소유하는 장**(1 · 3 · 4 · 5 · 6)과 **앞 장을 엮는 장**(2 · 7). 엮는 장은 자기 근거가 없으므로 앞 장을 다시 쓰지 않고 `mustAdd`(새로 보태야 할 것)만 쓴다.
// 12개 장 안에서 겹쳤던 근거를 합쳤다: 사주 구조 · 기질 · 핵심 성향 → 1, 연애 · 애착 · 갈등 · 회복 → 3(같은 관계 응답 두세 개를 두 장이 나눠 쓰던 문제), 일 · 재물 → 5(소제목으로 구분), 겉과 속 → 폐기(근거 없음).
// 검토 문서: docs/story-7-sections-review.md · 측정: `node scripts/measure-story7.ts` · 기존 story-v1의 검사 · 한도는 그대로이고 이 초안은 그 위의 제안이다.
import type { Topic } from "../evidence.ts";

export type Story7Kind = "owner" | "synthesis";
export type StoryV1Source = "headline" | "cards" | "core" | "relation" | "work-money" | "flow" | "actions" | "focus";

export type Story7Section = {
  no: number;
  id: string;
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
    no: 1, id: "me", title: "나는 어떤 사람일까?", kind: "owner",
    includes: ["대표 OOO형", "사주 구조", "핵심 성향", "성격 · 기질 · MBTI"],
    question: "이 사람은 어떤 사람인가 — 사주의 중심 구조와 평소 행동 방식(성격 · 기질 · 입력한 MBTI)이 한 사람 안에서 어떻게 만나는가",
    repeatGuard: "여기서 소개한 특징을 뒤 장에서 다시 설명하지 않는다 — 뒤 장은 그 특징이 그 장의 질문에서 만드는 새 조건만 쓴다. 사주 용어만 나열하지 않는다",
    sajuOwns: [/^saju\.daymaster$/, /^saju\.element\./, /^saju\.structure\.(chart|hidden|month|roots|strength|johu)$/],
    prefer: /^survey\.(ei|sn|tf|jp|novelty|caution)\./, personalTopics: ["personality"], borrowTopics: ["personality"], personalMin: 2, maxParagraphs: 4, scenes: ["s01", "s02", "s06", "s07", "s09", "s10"],
    code: ["대표 유형명 OOO형(personal-type.ts · 화면 스위치 꺼짐)", "럭키 지수 카드(lucky.ts · 화면 스위치 꺼짐)", "원국 표(무료 화면에 이미 있음)"],
    from: ["headline", "core"],
    duplicate: { with: [2, 3, 5], why: "여기서 쓴 신중함 · 판단 방식이 5번(일 · 재물)과 2번(강점 · 부담)의 재료가 된다 — 지금 story-v1에서 \"정리\"가 제목 · 핵심 · 관계 · 시기에 번진 곳이 바로 이 자리다" },
    moreSaju: "격국 · 용신은 계산하지 않는다(판정 보류) — \"사주 구조\"는 일간 · 오행 · 월령 · 통근 · 강약 후보까지. 십성 분포의 \"뜻\"은 소유한 장(3 · 4 · 5)이 푼다",
    gap22: "응답 근거는 기질 4 + 평소 행동 방식 4 + MBTI뿐이고 뚜렷한 쪽만 근거가 된다(가상 인물 10명 중 근거가 3개뿐인 사람이 있다 — 측정표). 유형명 규칙(personal-type.ts)은 22문항 점수에서 계산된다",
    gap28: "구분 9개 중 정보를 받는 방식(2~3장면)은 읽을 수 없다. 유형명 분류 입력이 점수가 아닌 장면 읽기 결과로 바뀌면 규칙을 다시 설계해야 한다",
  },
  {
    no: 2, id: "strength-weakness", title: "나의 강점과 약점", kind: "synthesis",
    includes: ["강점이 발휘되는 조건", "부담이 되는 조건", "회복 방법"],
    question: "같은 특징이 어떤 조건에서 강점으로 쓰이고 어떤 조건에서 부담이 되며, 부담이 쌓였을 때 어떻게 회복하는가",
    repeatGuard: "특징 이름을 다시 말하지 않고 조건(속도 · 환경 · 상대)만 쓴다. 강점 · 부담이라는 판단어는 이 장에서만 쓰고 다른 장에서는 쓰지 않는다. 단순 긍정 · 부정 형용사 나열 금지",
    mustAdd: "다른 장이 쓰지 않은 \"조건\"과 \"회복의 순서\" — 앞에서 소개한 특징을 가리킬 때는 한 구절로만 되짚는다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, maxParagraphs: 2, scenes: ["s08", "s11", "s14"],
    code: ["카드의 강점 · 힘들 수 있는 포인트 키워드(지금은 AI가 따로 씀 → 이 장에서 가져오기)"],
    from: ["cards", "core"],
    duplicate: { with: [1, 3, 5, 7], why: "강점 · 부담은 모든 장에서 나오는 판단이라 이 장이 가장 겹친다 — 지금 story-v1은 핵심 영역이 \"강점 → 부담 → 방향\"을 한 이야기로 묶고 카드에 한 번 더 쓴다. 회복 방법은 7번의 실천 조언과 같은 처방(\"정리 중이라는 신호\")이 되기 쉽다" },
    moreSaju: "조건을 만들 때 없는 십성 · 오행을 기능 부족으로 풀지 않는다(ABSENCE_MAPPING 유지)",
    gap22: "소유 근거가 없다. **회복을 묻는 문항이 없어** \"회복 방법\"을 읽을 근거가 에너지 방식(평소 행동 방식 한 가지) 하나뿐이다",
    gap28: "회복 장면 s08 · s11 · s14 세 개가 있어 \"혼자 / 사람 곁 / 몸을 움직여\" 같은 회복 방식을 읽을 수 있다(구분 최소 3장면은 채우나 맥락은 모두 개인 생활 — 사람 시험 전)",
  },
  {
    no: 3, id: "love-attachment", title: "연애와 애착", kind: "owner",
    includes: ["연애 성향", "애정 표현", "친밀감", "갈등과 화해"],
    question: "가까운 사람 앞에서 마음을 주고 표현하는 방식과 거리의 속도, 그리고 어긋났을 때 확인하고 회복하는 순서 — 편안한 관계의 조건까지",
    repeatGuard: "애착 유형 이름을 쓰지 않고 한 문항으로 단정하지 않는다. 친구 · 가족 · 동료 이야기는 4번에서 쓴다(연애 풀이를 다시 쓰지 않는다)",
    sajuOwns: [/^saju\.spouse-/, /^saju\.relation\.(?:day-[a-z]+|[a-z]+-day)\./],
    prefer: /^survey\.(anxiety|avoidance|closeness|sensitivity)/, personalTopics: ["love", "marriage", "relationship"], borrowTopics: ["love", "relationship"], personalMin: 1, maxParagraphs: 3,
    scenes: ["s15", "s16", "s17", "s18", "s19", "s20", "s21", "s24"],
    code: ["인연의 경향(partner.ts — 연상 · 또래 · 연하 쪽, 코드가 계산)", "연애운이 강해지는 달 달력(months.ts · 성별 필요)"],
    from: ["relation"],
    duplicate: { with: [4], why: "타인 반응 민감도 응답을 연애와 인간관계가 함께 쓰면 같은 말이 두 번 나온다 — 연애에는 가까운 관계 반응, 인간관계에는 에너지 방식만 앞세운다" },
    moreSaju: "연애 경험 · 현재 연애 상태 입력이 없어 상태를 지어내지 않는다(운영자 지시) — 근거는 배우자 별 · 자리(성별은 엔진이 이미 반영) · 일지가 낀 합 · 충과 응답뿐이다",
    gap22: "애정 표현 · 갈등 뒤 회복 · 도움 요청을 묻는 문항이 없고 관계 불안 · 거리 두기 두 개(둘 다 높을 때 한 개 더) + 민감도뿐이다. 12개 장 안에서 06 · 07이 같은 근거 두세 개를 나눠 쓰던 문제는 이 장으로 합쳐 사라졌지만, **네 가지 세부 항목(성향 · 표현 · 친밀감 · 갈등과 화해)을 응답 2~4개로 쓰게 된다**",
    gap28: "장면 8개(s15~s21 · s24)로 가장 풍부하다 — 확인 · 회복 구분은 읽을 수 있고 도움 받는 방식은 s18 · s21 2장면이라 읽지 못한다. 맥락은 모두 가까운 관계 한 가지다",
  },
  {
    no: 4, id: "people", title: "인간관계와 인연", kind: "owner",
    includes: ["친구", "가족", "동료 등 연애 이외의 인간관계"],
    question: "연애 밖의 사람들(친구 · 가족 · 동료) 사이에서 관계의 폭과 깊이는 어떻고, 협력이 쉬운 조건과 부딪히기 쉬운 조건은 무엇인가",
    repeatGuard: "연애 풀이를 다시 쓰지 않는다. 귀인 · 사람복(신살)을 말하지 않는다 — 신살을 계산하지 않았다",
    sajuOwns: [/^saju\.tengod\.(인성|비겁)/, /^saju\.relation\.(?!(?:day-[a-z]+|[a-z]+-day)\.)/],
    prefer: /^survey\.(ei|sensitivity)\./, personalTopics: ["relationship"], borrowTopics: ["relationship"], personalMin: 1, maxParagraphs: 2, scenes: ["s04", "s12", "s22", "s26"],
    code: [],
    from: ["relation"],
    duplicate: { with: [3, 1], why: "3번과 같은 민감도 · 에너지 응답, 1번과 같은 에너지 방식을 다시 쓰기 쉽다" },
    moreSaju: "**가족 이야기는 근거가 사실상 없다** — 가족 구성 · 관계 입력이 없고 년주 · 월주를 조상 · 부모 자리로 읽는 규칙도 규칙 이력에 없다(전문가 검토 전). 십성(인성 · 비겁)과 일지를 뺀 합 · 충으로만 조건형으로 쓰고 \"가족과 ~했을 것이다\" 같은 사건은 쓰지 않는다. **귀인 · 사람복은 신살 계산 전에는 쓰지 않는다**",
    gap22: "친구 · 가족 · 동료 맥락을 묻는 문항이 없다 — 에너지 방식 · 민감도 두 근거뿐이고 1 · 3번과 겹친다",
    gap28: "장면 s04 · s12 · s22 · s26 네 개(친구 · 모임 · 낯선 사람) — 가족 · 동료 장면은 없고, 구분을 읽을 맥락 두 가지는 못 채운다",
  },
  {
    no: 5, id: "work-money", title: "일과 재물", kind: "owner",
    includes: ["일 · 진로 · 적성", "업무 방식", "재물과 돈의 흐름"],
    question: "이 사람의 힘이 잘 쓰이는 일의 조건(역할 · 권한 · 속도 · 협업 · 평가 기준)과 결정 · 변화의 방식 / 돈을 대하는 모습과 재성 등 명리 근거가 말하는 범위",
    repeatGuard: "일 소제목과 재물 소제목이 같은 응답(신중함 · 생활 방식)을 되풀이하지 않는다 — 재물은 돈 앞의 선택으로만 쓴다. 적성을 직업 하나로 단정하지 않고, 재성이 없다고 돈 관리가 약하다고 쓰지 않는다. 투자 · 대출 · 업종 추천 금지",
    parts: ["일", "재물"],
    sajuOwns: [/^saju\.tengod\.(식상|관성|재성)/, /^saju\.combo\./],
    prefer: /^survey\.(sn|tf|jp|novelty|caution|persistence)\./, personalTopics: ["work", "money"], borrowTopics: ["work", "money"], personalMin: 1, maxParagraphs: 3,
    scenes: ["s03", "s05", "s13", "s23", "s25", "s27", "s28"],
    code: ["재물 · 소비 흐름 달력(months.ts — 사건이 아닌 주제 표시)"],
    from: ["work-money"],
    duplicate: { with: [1], why: "신중함 · 지속성 · 새로움은 1번의 기질과 같은 근거다 — 1번은 \"성향\", 5번은 \"일 장면에서의 조건\"으로만 쓴다. 일과 재물이 한 장이라 같은 caution 응답을 두 소제목이 나눠 써야 한다" },
    moreSaju: "재성이 목록에 있는 사람이 일부뿐이다(측정표) — 근거가 약하면 재물 소제목은 한 문단으로 짧게 쓰고 늘려 쓰지 않는다(지금 `MONEY_WORDS`도 같은 취지). 없는 십성을 일 능력 부족으로 풀지 않는다",
    gap22: "일 · 돈을 직접 묻는 문항이 없다 — 일은 간접 근거(지속성 · 새로움 · 신중함 · 평소 행동 방식)가 있으나 **재물은 돈 응답이 없고 신중함 · 생활 방식을 일과 나눠 써야 한다**. 실제 AI 첫 글(2026-10-17 P01)은 \"일과 재물\" 영역에 돈 이야기가 비어 있었다",
    gap28: "일 장면 6개(s03 s13 s23 s25 s27 s28)로 풍부하나 재물은 s05 한 장면뿐이라 읽을 수 없다",
  },
  {
    no: 6, id: "timing", title: "앞으로의 운과 변화", kind: "owner",
    includes: ["계산된 대운 · 세운", "변화의 흐름", "시기별 해석"],
    question: "계산된 대운 · 세운이 지금과 가까운 앞으로 어떤 주제를 두드러지게 하는가, 이 사람이 그 시기를 어떻게 받아들일까",
    repeatGuard: "시기 이야기(대운 · 세운 · 올해 · 연도)는 이 장에만 쓴다 — 다른 장에서 다시 말하지 않는다(PERIOD_TALK 규칙 유지). 근거 없는 연도 · 사건 예언 금지",
    sajuOwns: [/^saju\.(daeun|seun)\./], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, maxParagraphs: 3, scenes: [],
    code: ["큰 흐름 타임라인(luckTimeline)", "월별 달력(months.ts)"],
    from: ["flow"],
    duplicate: { with: [7], why: "7번의 실천 조언이 시기를 다시 말하면 반복이다" },
    moreSaju: null, gap22: null, gap28: null,
  },
  {
    no: 7, id: "advice", title: "미유의 종합 조언", kind: "synthesis",
    includes: ["현재 고민을 반영한 실천 가능한 조언 2~3가지"],
    question: "앞 장을 모두 보았을 때 지금 무엇을 먼저 할 것인가 — 알려 준 고민이 있으면 그 고민에, 없으면 이 분석에서 읽힌 우선순위에",
    repeatGuard: "앞의 장을 다시 요약하지 않는다. 앞 장에서 쓴 처방(예: 회복 신호)을 같은 말로 되풀이하지 않는다. 알려 준 고민이 없으면 고민을 지어내지 않는다",
    mustAdd: "서로 다른 앞 장 둘 이상의 결론이 만나는 곳에서만 나오는 행동 2~3개와 \"왜 이 순서인가\" — 시점이나 기간을 임의로 정하지 않는다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, maxParagraphs: 1, scenes: [], code: [],
    from: ["actions", "focus"],
    duplicate: { with: [2, 6], why: "행동이 앞 장의 결론을 다시 쓰는 자리다 — 지금 story-v1은 \"정리 중이라는 신호\" 처방이 다섯 곳에서 반복됐다(실제 AI 첫 글)" },
    moreSaju: null,
    gap22: "**\"현재 고민을 반영한\"을 받을 입력 경로가 지금 화면에 없다** — 고민 입력(내 고민 자세히 알려주기 · 고민 기록소)이 `CONCERN_RECORDS.visible = false`로 숨겨져 있어 심층 리포트 생성 때 고민이 거의 항상 비어 있다(story-v1의 focus 블록은 고민이 있을 때만 생긴다). 고민이 없으면 이 장은 고민을 반영한 조언이 아니라 \"분석에서 읽힌 우선순위\" 조언이 된다",
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
