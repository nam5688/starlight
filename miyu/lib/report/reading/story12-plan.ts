// 개인 심층 리포트 12개 고정 섹션 — 검토용 초안 (운영자 제안 2026-10-17). **어디에도 연결하지 않았다**(`story12.test.ts`가 확인) — 지금 신규 생성은 story-v1(영역 셋 + 시기 + 행동)이다.
// 이 파일은 "12개 목차를 표시하는 것"과 "12개를 모두 길게 쓰는 것"을 구분하기 위한 설계 자료다: 장마다 (1) 이 장만 답하는 질문 (2) 앞세울 근거 (3) 반복 방지 기준 (4) 지금 근거가 모자란 곳을 적는다.
// 장의 종류를 둘로 나눈 것이 핵심이다 — **근거를 소유하는 장**(사주 구조 · 기질 · 연애 · 애착 · 인간관계 · 일 · 재물 · 시기)과 **앞 장을 엮는 장**(핵심 성향 · 겉과 속 · 강점과 약점 · 종합 조언).
// 엮는 장은 자기 근거가 없어서 앞 장의 근거를 다시 인용할 수밖에 없고, 그래서 "새로 알게 되는 연결"을 하나도 못 내면 반복이 된다(`mustAdd`).
// 검토 문서: docs/story-12-sections-review.md · 측정: `node scripts/measure-story12.ts` · 근거 · 규칙을 임의로 바꾸지 않는다 — 기존 story-v1의 검사 · 한도는 그대로이고 이 초안은 그 위의 제안이다.
import type { Topic } from "../evidence.ts";

export type Story12Kind = "owner" | "synthesis";
export type StoryV1Source = "headline" | "cards" | "core" | "relation" | "work-money" | "flow" | "actions" | "focus" | "none";

export type Story12Section = {
  no: number;
  id: string;
  title: string;
  kind: Story12Kind;
  /** 이 장만 답하는 질문 — 다른 장에서 같은 질문에 답하면 반복이다 */
  question: string;
  /** 운영자 표의 "반드시 들어갈 내용" */
  must: string;
  /** 운영자 표의 "반복 방지 기준" */
  repeatGuard: string;
  /** 엮는 장만: 앞 장을 다시 말하지 않고 새로 보태야 하는 것(없으면 그 장은 쓰지 않거나 한 문단으로 줄인다) */
  mustAdd?: string;
  /** 사주 근거 중 이 장이 앞세우는 것(id 모양) — 근거를 소유하는 장만 */
  sajuOwns: RegExp[];
  /** 응답 근거(survey · self) 중 이 장이 먼저 가져가는 것 — 기존 story-v1의 `prefer`와 같은 뜻 */
  prefer: RegExp;
  /** 응답 근거를 맞닿는 주제로 연결할 때 쓰는 주제(비우면 우선 소유 없음) */
  personalTopics: Topic[];
  /** 응답 근거가 모자랄 때 빌려 올 수 있는 주제 — 빌리면 앞 장과 같은 근거를 다시 쓰는 것이라 반복 압력으로 센다 */
  borrowTopics: Topic[];
  /** 이 장이 응답 근거를 몇 개 이상 가져야 하는가(근거가 그만큼 있을 때) */
  personalMin: number;
  /** 상황형 28문항 후보에서 이 장이 앞세우는 장면(문항 번호, 한 장면은 한 장에만) — 28문항이 연결되기 전에는 없는 근거다 */
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

export const STORY12_SECTIONS: Story12Section[] = [
  {
    no: 1, id: "type", title: "나의 핵심 성향", kind: "synthesis",
    question: "이 사람을 한 장면으로 말하면 어떤 사람인가 — 사주의 중심과 실제 행동 방식이 만나는 한 지점",
    must: "대표 유형명, 특징 3가지, 핵심 해석", repeatGuard: "뒤에서 유형 소개 반복 금지",
    mustAdd: "특징 3가지를 \"소개\"하는 것까지만 — 뒤 장은 이 특징을 다시 설명하지 않고 \"어떤 조건에서 어떻게 달라지는지\"만 쓴다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, scenes: [],
    code: ["유형명(personal-type.ts · 화면 스위치 꺼짐)", "럭키 지수 카드(lucky.ts · 화면 스위치 꺼짐)"],
    from: ["headline", "cards", "core"],
    duplicate: { with: [2, 3, 5, 12], why: "특징 3가지가 곧 기질(03) · 강점과 약점(05) · 조언(12)의 내용이라 뒤 장이 같은 특징을 다시 풀기 쉽다 — 지금 story-v1에서 핵심 영역 · 제목 · 카드에 \"정리\"가 20번 번진 곳과 같은 자리다" },
    moreSaju: null,
    gap22: "유형명 규칙(personal-type.ts)이 22문항 점수에서 계산된다 — 문항이 바뀌면 분류 규칙을 다시 설계해야 한다(화면은 운영자 확인 전까지 꺼 둠)",
    gap28: "점수 가산을 하지 않는 읽는 규칙으로 바뀌면 유형 분류 입력이 사라진다 — 장면 읽기 결과로 새로 매핑해야 한다",
  },
  {
    no: 2, id: "saju-structure", title: "나의 사주 구조", kind: "owner",
    question: "계산된 명식 자체는 어떤 모양인가 — 일간 · 오행 균형 · 십성 분포 · 월령 · 통근 · 강약 후보",
    must: "명식의 주요 특징, 균형, 실제 해석 근거", repeatGuard: "명리 용어만 나열하지 않기",
    sajuOwns: [/^saju\.daymaster$/, /^saju\.element\./, /^saju\.structure\.(chart|hidden|month|roots|strength|johu)$/, /^saju\.tengod\./],
    prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, scenes: [],
    code: ["원국 표(무료 화면에 이미 있음)", "월령 · 득령 · 통근 · 투간 · 강약 후보(structure.ts)"],
    from: ["core"],
    duplicate: { with: [1, 8, 9, 10], why: "십성 분포(식상 · 재성 · 관성 · 인성 · 비겁)를 이 장에서 \"뜻\"까지 풀면 8 · 9 · 10에서 같은 십성을 다시 풀게 된다 — 이 장은 모양(어떤 기운이 많고 없는지)만 쓰고 뜻은 소유한 장이 푼다" },
    moreSaju: "격국 · 용신 · 신살은 계산하지 않는다(판정 보류, 전문가 검토 전) — \"명식의 핵심\"은 일간 · 오행 · 십성 · 월령 · 통근 · 강약 후보까지만 쓸 수 있고, 조후는 겨울 · 여름만이다",
    gap22: null, gap28: null,
  },
  {
    no: 3, id: "temperament", title: "타고난 기질과 성격", kind: "owner",
    question: "정보를 받고 판단하고 정리하는 습관, 새로움 · 신중함 · 지속성, 자극 민감도 — 장면을 떠나 이 사람의 기본 반응 방식",
    must: "생각 · 반응 · 판단 · 회복 방식", repeatGuard: "선택지 문장 그대로 옮기지 않기",
    sajuOwns: [], prefer: /^survey\.(ei|sn|tf|jp|novelty|caution|sensitivity)\./, personalTopics: ["personality"], borrowTopics: [], personalMin: 2,
    scenes: ["s01", "s02", "s06", "s07", "s09", "s10", "s11"], code: [],
    from: ["core"],
    duplicate: { with: [1, 4, 9], why: "01의 특징 3가지와 같은 근거 · 04의 겉과 속 비교(같은 에너지 구분) · 09의 일 장면(신중함 · 지속성)이 이 장의 근거를 다시 쓴다" },
    moreSaju: null,
    gap22: "응답 근거는 기질 4 + 평소 행동 방식 4 + MBTI뿐이고 뚜렷한 쪽만 근거가 된다(가상 인물 10명 중 근거가 3개뿐인 사람이 있다 — 측정표) — 이 장이 가장 먼저 근거를 가져가고 나머지 장은 빌려 쓰게 된다",
    gap28: "구분 9개 중 정보를 받는 방식(2~3장면)과 도움 받는 방식(2장면)은 읽을 수 없고, 이 장은 에너지 · 결정 기준 · 구조 · 예상 밖 첫 반응 · 새로움 · 신중함 다섯 구분을 읽을 수 있다",
  },
  {
    no: 4, id: "outer-inner", title: "겉으로 보이는 나, 실제의 나", kind: "synthesis",
    question: "사람 앞에서 하는 행동과 혼자 있을 때의 반응이 같은가, 다르다면 어떤 장면에서 갈리는가",
    must: "외부 행동과 내적 반응의 차이 또는 일치", repeatGuard: "차이가 없는데 억지로 반전 만들지 않기",
    mustAdd: "같은 구분(에너지 · 첫 반응)이 \"사람 앞\" 장면과 \"혼자일 때\" 장면에서 같은 쪽인지 다른 쪽인지 — 같으면 \"겉과 속이 크게 다르지 않다\"를 한 문단으로 쓰고 끝낸다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: ["personality"], personalMin: 1, scenes: ["s04", "s08", "s12", "s14"], code: [],
    from: ["none"],
    duplicate: { with: [3], why: "같은 에너지 구분을 03에서 읽고 04에서 맥락만 바꿔 다시 읽는다 — 차이를 단정할 수 있을 때만 쓰고 아니면 한 문단" },
    moreSaju: "월주(사회적 자리) · 일주(자신)의 전통 의미로 겉과 속을 읽으려면 새 해석 규칙이 필요하다 — 규칙 이력 · 전문가 검토가 없어 지금은 쓰지 않는다. 제목의 \"타인에게 보이는 모습\"도 타인이 평가한 모습이 아니라 \"사람 앞에서 하는 행동(본인 응답)\"이어야 한다 — 그렇게 쓰지 않으면 지어낸 것이다",
    gap22: "22문항은 장면 맥락이 없는 5점 척도라 \"사람 앞\"과 \"혼자일 때\"를 가를 근거가 없다 — 이 장은 22문항으로 만들 수 없고 03을 맥락만 바꿔 재진술하게 된다",
    gap28: "에너지 구분 6장면(s01 s04 s08 s12 s14 s26)을 맥락별로 나눠 읽을 수 있으나 구분마다 최소 3장면 규칙에 사람 앞 2 · 혼자 2는 못 미친다 — 차이를 단정할 수 있는 경우가 드물고 사람 시험이 필요하다",
  },
  {
    no: 5, id: "strength-weakness", title: "나의 강점과 약점", kind: "synthesis",
    question: "같은 특징이 언제 강점이 되고 언제 부담으로 바뀌는가 — 조건을 정하는 장",
    must: "장점이 유리한 조건과 부담으로 바뀌는 조건", repeatGuard: "단순 긍정 · 부정 형용사 나열 금지",
    mustAdd: "다른 장이 쓰지 않은 \"조건\"(어떤 환경 · 상대 · 속도에서 바뀌는지) — 특징 이름을 다시 말하지 않고 조건만 쓴다. 다른 장은 강점 · 부담이라는 판단어를 쓰지 않는다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, scenes: [], code: ["카드의 강점 · 힘들 수 있는 포인트 키워드(지금은 AI가 따로 씀 → 이 장에서 가져오기)"],
    from: ["cards", "core"],
    duplicate: { with: [1, 3, 4, 6, 7, 8, 9, 12], why: "강점 · 부담은 모든 장에서 나오는 판단이라 이 장이 가장 겹친다 — 지금 story-v1은 핵심 영역이 \"강점 → 부담 → 방향\"을 한 이야기로 묶고 카드에 따로 한 번 더 쓴다" },
    moreSaju: "조건을 만들 때 없는 십성 · 오행을 기능 부족으로 풀지 않는다(ABSENCE_MAPPING 유지)",
    gap22: "소유 근거가 없다 — 03의 근거 중 같은 근거를 \"반대쪽\"에서 다시 읽게 된다",
    gap28: "\"상황별 차이\" 읽기(같은 구분이 장면에 따라 반대쪽으로 나옴)가 이 장의 가장 좋은 재료지만 읽을 수 있는 구분이 모자라면 비어 있다",
  },
  {
    no: 6, id: "love", title: "연애에서의 나", kind: "owner",
    question: "관계에서 무엇을 원하고 마음을 어떻게 표현하는가, 어떤 상대 · 환경에서 편안한가(잘 맞을 수 있는 사람의 조건)",
    must: "호감 · 친밀감 · 표현 · 관계 기대", repeatGuard: "애착 유형을 재진술하지 않기",
    // 배우자 별은 성별에 따라 엔진이 이미 골라 준다(여성 관성 · 남성 재성, `saju.spouse-star`) — 십성 근거를 따로 소유하지 않아야 09 · 10과 같은 십성을 두 번 풀지 않는다
    sajuOwns: [/^saju\.spouse-/], prefer: /^survey\.(anxiety|avoidance|closeness)/, personalTopics: ["love", "marriage"], borrowTopics: ["love", "relationship"], personalMin: 1,
    scenes: ["s15", "s20", "s21"], code: ["인연의 경향(partner.ts — 연상 · 또래 · 연하 쪽, 코드가 계산)", "연애운이 강해지는 달 달력(months.ts · 성별 필요)"],
    from: ["relation"],
    duplicate: { with: [7, 8], why: "관계 불안 · 거리 두기 응답 두 개가 06과 07의 유일한 응답 근거라 두 장이 같은 근거를 나눠 써야 한다 · 08에서 연애 풀이를 재사용하기 쉽다" },
    moreSaju: "연애 경험 · 현재 연애 상태 입력이 없어 상태를 지어내지 않는다(운영자 지시) — 근거는 배우자 자리 · 배우자 별 · 합 · 충과 응답뿐이다",
    gap22: "애정 표현 · 기대 · 취소 반응을 묻는 문항이 없고 관계 불안 · 거리 두기 두 개(둘 다 높을 때 한 개 더)뿐이다",
    gap28: "s15 · s20 · s21 세 장면(가까운 관계 한 가지 맥락) — 구분을 읽을 최소 장면은 채우지만 맥락 두 가지는 못 채운다",
  },
  {
    no: 7, id: "attachment-conflict", title: "애착과 갈등·회복", kind: "owner",
    question: "관계가 어려워졌을 때 확인하는 방식 · 갈등 뒤 회복 순서 · 도움을 받는 방식 — 유형 이름 없이 세 가지 행동으로",
    must: "갈등과 회복 과정, 상대와 조율할 방법", repeatGuard: "한 문항으로 불안형 · 회피형 단정 금지",
    sajuOwns: [/^saju\.relation\.(?!.*(daeun|seun))/], prefer: /^survey\.(anxiety|avoidance|closeness|sensitivity)/, personalTopics: ["relationship", "love"], borrowTopics: ["relationship", "love"], personalMin: 1,
    scenes: ["s16", "s17", "s18", "s19", "s24"], code: [],
    from: ["relation"],
    duplicate: { with: [6, 8], why: "06과 같은 애착 근거를 쓴다 — 06은 \"무엇을 원하고 어떻게 표현하나\", 07은 \"어려워졌을 때 어떻게 반응하고 돌아오나\"로 질문이 달라야만 구분된다" },
    moreSaju: null,
    gap22: "22문항에는 갈등 뒤 회복 · 도움 요청 문항이 없다 — 06과 같은 두세 근거를 질문만 바꿔 두 번 쓰게 되고, \"한 문항으로 단정 금지\" 규칙과 부딪힌다",
    gap28: "읽는 구분은 장면 묶음이다 — 확인(s15 s16 s20 s28) · 회복(s17 s19 s22 s24) · 도움(s18 s21 — 2장면이라 읽지 못함). 묶음이 06 · 07 · 08 · 09의 소유 장면에 걸쳐 있으므로 구분은 한 장(07)에서만 쓰고 다른 장은 장면 사실만 쓴다",
  },
  {
    no: 8, id: "people", title: "인간관계와 귀인", kind: "owner",
    question: "친구 · 가족 · 동료 사이에서 관계의 폭과 깊이, 협력이 쉬운 조건, 도움을 주는 사람이 생기는 사주의 모양",
    must: "관계의 폭과 깊이, 협력 · 갈등 조건", repeatGuard: "연애 풀이 재사용 금지",
    sajuOwns: [/^saju\.tengod\.(인성|비겁)/], prefer: /^survey\.(ei|sensitivity)\./, personalTopics: ["relationship"], borrowTopics: ["relationship"], personalMin: 1,
    scenes: ["s22", "s26"], code: ["럭키 지수의 \"귀인 · 사람복\" 하위 지수(lucky.ts · 화면 스위치 꺼짐 — 본문에는 숫자를 쓰지 않는다)"],
    from: ["relation"],
    duplicate: { with: [6, 7], why: "타인 반응 민감도 · 관계 거리 응답을 06 · 07에서 이미 쓰면 이 장에서 다시 쓰기 쉽다" },
    moreSaju: "**귀인 · 사람복은 신살(천을귀인 등)이나 대운의 인성 흐름으로 읽는데 엔진은 신살을 계산하지 않는다(핵심 신살 4개는 계획뿐, 전문가 검토 전)** — 지금은 인성 · 비겁 · 관성 십성 분포와 합 · 충까지만 근거가 있어 \"귀인\"을 풀 수 없다. 장 이름의 \"귀인\"을 쓰려면 신살 계산과 검토가 먼저다(새 분석 항목 — `post-launch-backlog.md`)",
    gap22: "친구 · 가족 · 동료 맥락을 묻는 문항이 없다 — 에너지 방식 · 민감도 두 근거를 03 · 07과 나눠 쓴다",
    gap28: "s22 · s26 두 장면뿐이라 구분을 읽을 수 없다(최소 3장면) — 장면 사실만 쓰고 구분 읽기는 하지 않는다",
  },
  {
    no: 9, id: "work", title: "일·적성·진로", kind: "owner",
    question: "이 사람의 힘이 잘 쓰이는 일의 조건(역할 · 권한 · 속도 · 협업 · 평가 기준)과 결정 · 변화의 방식",
    must: "업무 환경, 역할, 결정과 변화", repeatGuard: "적성을 직업 하나로 단정 금지",
    sajuOwns: [/^saju\.tengod\.(식상|관성)/, /^saju\.combo\.(?!jae-in)/], prefer: /^survey\.(sn|tf|jp|novelty|caution|persistence)\./, personalTopics: ["work"], borrowTopics: ["work", "personality"], personalMin: 1,
    scenes: ["s03", "s13", "s23", "s25", "s27", "s28"], code: [],
    from: ["work-money"],
    duplicate: { with: [3, 10], why: "신중함 · 지속성 · 새로움은 03의 기질과 같은 근거다 — 03은 \"성향\", 09는 \"일 장면에서의 조건\"으로만 쓴다 · 10과 같은 caution 근거를 나눈다" },
    moreSaju: "없는 십성(식상 없음 등)을 일 능력 부족으로 풀지 않는다(ABSENCE_MAPPING 유지)",
    gap22: "일을 직접 묻는 문항은 없고 지속성 · 새로움 · 신중함 · 평소 행동 방식이 간접 근거다",
    gap28: "여섯 장면으로 가장 풍부하다(s03 s13 s23 s25 s27 s28)",
  },
  {
    no: 10, id: "money", title: "재물과 돈의 흐름", kind: "owner",
    question: "돈을 대하는 모습(쓰고 모으고 결정하는 방식)과 재성 등 명리 근거가 말하는 범위",
    must: "재물 관련 명리 근거, 선택과 위험 관리", repeatGuard: "재성이 없다고 돈 관리가 약하다고 단정 금지",
    sajuOwns: [/^saju\.tengod\.(재성|비겁)/, /^saju\.combo\.jae-in$/], prefer: /^survey\.(caution|jp)\./, personalTopics: ["money"], borrowTopics: ["money"], personalMin: 1,
    scenes: ["s05"], code: ["재물 · 소비 흐름 달력(months.ts — 사건이 아닌 주제 표시)"],
    from: ["work-money"],
    duplicate: { with: [9], why: "신중함(caution) 응답을 09와 나눠 쓴다 — 돈 장면이 아니라 일 장면의 말을 돈에 옮기면 반복" },
    moreSaju: "재성이 목록에 있는 사람이 일부뿐이다(측정표) — 근거가 약하면 한 문단으로 짧게 쓰고 늘려 쓰지 않는다(지금도 같은 규칙). 투자 · 대출 · 수익 보장은 쓰지 않는다",
    gap22: "돈을 묻는 문항이 없다 — 신중함 · 생활 방식 두 근거를 09와 공유한다. 실제 AI 첫 글(2026-10-17 P01)은 \"일과 재물\" 영역에 돈 이야기가 비어 있었다",
    gap28: "s05(가격이 비싼 물건) 한 장면뿐이라 읽을 수 없다",
  },
  {
    no: 11, id: "timing", title: "시기와 변화의 흐름", kind: "owner",
    question: "계산된 대운 · 세운이 지금 어떤 주제를 두드러지게 하는가, 이 사람이 그 시기를 어떻게 받아들일까",
    must: "계산된 시기와 해석 가능한 변화의 주제", repeatGuard: "근거 없는 연도 · 사건 예언 금지",
    sajuOwns: [/^saju\.(daeun|seun)\./], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, scenes: [],
    code: ["큰 흐름 타임라인(luckTimeline)", "월별 달력(months.ts)"],
    from: ["flow"],
    duplicate: { with: [12], why: "시기 이야기는 이 장에만 쓴다(PERIOD_TALK 규칙 유지) — 12의 조언이 시기를 다시 말하면 반복" },
    moreSaju: null, gap22: null, gap28: null,
  },
  {
    no: 12, id: "advice", title: "나를 위한 종합 조언", kind: "synthesis",
    question: "앞 장을 모두 보았을 때 무엇을 먼저 할 것인가 — 우선순위와 그 이유",
    must: "가장 중요한 실천 3가지", repeatGuard: "앞의 11개 섹션을 다시 요약만 하지 않기",
    mustAdd: "서로 다른 앞 장 둘 이상의 결론이 만나는 곳에서만 나오는 행동 3개와 \"왜 이 순서인가\" — 앞 장의 문장을 다시 쓰지 않는다",
    sajuOwns: [], prefer: NEVER, personalTopics: [], borrowTopics: [], personalMin: 0, scenes: [], code: [],
    from: ["actions", "focus"],
    duplicate: { with: [1, 3, 5, 6, 7, 9, 11], why: "행동이 모든 장의 결론을 다시 쓰는 자리다 — 지금 story-v1은 \"정리 중이라는 신호\" 처방이 다섯 곳에서 반복됐다(실제 AI 첫 글)" },
    moreSaju: null,
    gap22: null, gap28: null,
  },
];

export const STORY12_BY_NO = (no: number): Story12Section => {
  const s = STORY12_SECTIONS.find((x) => x.no === no);
  if (!s) throw new Error(`없는 섹션 번호: ${no}`);
  return s;
};

/** 28문항의 장면 번호(s01~s28) 28개를 한 장에 하나씩 나눈 표 — 장면 소유자 */
export const STORY12_SCENE_OWNER: Record<string, number> = Object.fromEntries(STORY12_SECTIONS.flatMap((s) => s.scenes.map((sc) => [sc, s.no])));
