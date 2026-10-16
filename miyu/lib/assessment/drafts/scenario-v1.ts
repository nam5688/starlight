// 미유 장면 질문 — 별도 버전 설계 초안 (scenario-0.2-draft, 2026-10-16, 검토 전).
//
// 운영자 지적(2026-10-16): 지금의 질문은 "불안한가요? → 네 → 불안한 사람"처럼 질문 안에 결론이 들어 있어 풀이가 답을 되풀이하게 된다.
// 이 초안의 질문은 "당신은 어떤 유형인가요?"가 아니라 "같은 모습이 어떤 상황에서 어떤 방식으로 나타나는가"를 가르는 장면 질문이다.
//   - 한 질문 = 한 장면. 선택지는 같은 장면을 다르게 다루는 방식 4개이며 높고 낮음 · 좋고 나쁨이 없다(점수를 매기지 않는다).
//   - "이런 일이 거의 없었어요" · "맞는 선택지가 없어요"는 항상 있고 성향으로 읽지 않는다(그 구분을 읽지 않는다 — 사용자 화면에 "자료 없음"을 만들지 않는다).
//   - 문항 하나를 결과 문단 하나에 1:1로 연결하지 않는다. 서로 다른 장면 두 개(같은 구분 안)의 답을 함께 읽는다.
//
// 0.2에서 고친 것(운영자 검토 2026-10-16):
//   1) 실제 답을 먼저 둔다 — 읽기 결과는 **고른 두 답 각각의 사실(plain) · 그 장면에서 보여 주는 방식(shows)** 을 항상 담고, 그 위에 **두 답을 함께 볼 때의 해석 후보(candidates)** 를 얹는다.
//      합쳐 읽는 규칙이 선택한 답보다 더 나아가 이유를 추정하거나 서로 다른 답에 같은 풀이를 붙이지 못하게, 해석 후보는 조건형("~일 수 있다")이고 적용 조건(needs) · 붙이면 안 되는 결론(notThis)과 함께 다닌다.
//   2) 서로 다른 답을 하나로 묶었던 조합(C3.4 · C5.5 등)은 답마다 갈랐고, 한 묶음 안의 답이 서로 달라 보이는 곳은 nuance(그 답일 때만 덧붙이는 문장)로 구분한다.
//   3) 한 구분의 16개 답 쌍을 빠짐없이 한 규칙으로 덮는다(테스트가 확인) — "대표 조합에 없어서 읽어 주기만 하는" 경로를 없앴다.
//
// 지금 화면의 22문항 · 기존 점수표(0~100) · 저장된 회원 결과와 **섞지 않는다.** 화면 · 저장 · 리포트 · provenance.ts에 연결하지 않았다(리포트 근거로 바꾸는 어댑터는 scenario-evidence.ts, 시험 · 스크립트에서만 쓴다).
// 공식 검사(MBTI · TCI · 애착검사 · 갈등 대처 검사)의 문항을 가져오지 않았고 그 이름으로 소개하지 않는다. 다만 장면이 다루는 일상 주제가 널리 알려진 개념과 닮은 것은 숨기지 않는다(THREADS의 overlap).
// 시범 인터뷰 · 시범 응답 · 검사 저작권 전문가 검토를 받기 전에는 어디에도 연결하지 않는다. 신뢰도 · 타당도 · 정확도는 확인하지 못했다.

export const SCENARIO_VERSION = "scenario-0.2-draft";
export const SCENARIO_DATE = "2026-10-16";
export const SCENARIO_READING_VERSION = "scenario-reading-0.2";

// ───────────── 형식 ─────────────

export type ThreadId = "D1" | "D2" | "D3" | "D4" | "D5";
export type SceneId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";
export type OptionId = "a" | "b" | "c" | "d";

/**
 * 같은 장면을 다루는 방식 하나.
 * tag: 그 구분 안에서만 뜻이 있는 이름표(점수 아님) · plain: 고른 답의 사실(원인 · 이유를 추정하지 않는다) ·
 * shows: 이 답이 **그 장면에서** 보여 주는 방식 — 다른 장면의 답과의 관계 · 이유는 말하지 않는다.
 */
export type SceneOption = { id: OptionId; text: string; tag: string; plain: string; shows: string };

export type Scene = {
  id: SceneId;
  thread: ThreadId;
  /** 장면 이름 (내부용) */
  label: string;
  /** 사람에게 보이는 질문 문장 — 한 장면 · 한 주제 */
  ask: string;
  options: [SceneOption, SceneOption, SceneOption, SceneOption];
  /** 이 장면이 가르려는 실제 차이 */
  difference: string;
  /** 시범 인터뷰에서 확인할 것: 선택지끼리 같은 점 · 이유가 갈릴 수 있는 점 · 좋게 보이는 선택지가 있는지 */
  watch: string;
};

/** 이 구분을 읽을 때 같이 쓰는 사주 쪽 근거와, 같은 답의 풀이가 사주에 따라 어떻게 달라지는지 */
export type SajuPair = { cue: string; effect: string };

export type Thread = {
  id: ThreadId;
  name: string;
  /** 구분하려는 차이 */
  asks: string;
  /** 리포트의 어느 영역(plan.ts BLOCK_PLAN id)에 쓰이나 */
  blocks: string[];
  /** 두 장면 — 먼저 · 나중 순서가 아니라 서로 다른 맥락(혼자 · 함께, 일 · 마음 …)이다 */
  scenes: [SceneId, SceneId];
  /** 붙이면 안 되는 결론 */
  notThis: string[];
  /** 사주 연결 지점 */
  sajuPairs: SajuPair[];
  /** 겹칠 수 있는 널리 알려진 개념 (숨기지 않는다) */
  overlap: string;
};

/**
 * 두 답을 함께 볼 때의 해석 규칙. first · second는 각 장면의 tag 목록이다 — **묶인 답들 모두에게 맞는 후보만** 쓴다(어느 한 답에만 맞는 말은 nuance로 뺀다).
 * candidates: 해석 후보(조건형, 이유를 확정하지 않는다) · needs: 이 후보를 쓰려면 사주 쪽에 있어야 하는 근거(없으면 후보를 쓰지 않고 두 답이 보여 주는 방식만 장면으로 푼다) ·
 * nuance: 그 답일 때만 덧붙이는 문장 · notThis: 이 조합에 붙이면 안 되는 결론.
 */
export type Pattern = {
  id: string;
  thread: ThreadId;
  first: string[];
  second: string[];
  candidates: string[];
  needs?: string;
  nuance?: Record<string, string>;
  notThis: string;
};

/** 맞는 선택지가 없을 때 — 어느 쪽도 성향으로 읽지 않고 그 장면을 읽지 않는다 */
export const NONE_OPTIONS = [
  { id: "x", text: "이런 일이 거의 없었어요", kind: "no-experience" },
  { id: "y", text: "맞는 선택지가 없어요", kind: "no-fit" },
] as const;

export const SCENE_PROMPT = "아래 상황에서 실제로 했던 행동에 가장 가까운 것 하나를 골라 주세요. 정답은 없어요.";

// ───────────── 구분 5개 ─────────────

export const THREADS: Thread[] = [
  {
    id: "D1",
    name: "일을 시작하고 몫을 잡는 방식",
    asks: "혼자 할 때와 함께 할 때, 일을 어떻게 시작하고 누구 몫으로 잡는가 — 두 맥락이 같은지 다른지를 본다.",
    blocks: ["tendency", "work-money"],
    scenes: ["S1", "S2"],
    notThis: ["먼저 움직인다 = 주도적 · 리더형 성향", "맞춰 움직인다 = 소극적 · 자신감 부족", "필요할 때 몰아서 한다 = 미루는 사람"],
    sajuPairs: [
      { cue: "책임 · 규칙을 뜻하는 기운(관성)이 두드러지는 사주", effect: "몫이 정해지기 전에 일이 나에게 모이는 쪽으로 읽는다 — 그 부담이 어디서 쌓이는지에 초점" },
      { cue: "책임 · 규칙을 뜻하는 기운이 원국에 없는 사주", effect: "역할이 분명해질 때 속도가 달라지는지를 읽는다 — 정해진 틀이 없을 때의 움직임에 초점" },
      { cue: "표현 · 결과물을 뜻하는 기운(식상)과 배움 · 검토를 뜻하는 기운(인성)이 함께 두드러지는 사주", effect: "충분히 생각한 것을 말로 꺼내는지 몸으로 메우는지에 따라 같은 강점이 달리 쓰이는 모습으로 읽는다" },
    ],
    overlap: "일을 계획하며 시작하는 방식 · 역할 분담은 성격 연구와 조직 연구가 오래 다뤄 온 주제와 겹친다. 문장 · 채점표 · 유형 이름은 가져오지 않았다.",
  },
  {
    id: "D2",
    name: "도움이 들어오는 길",
    asks: "버거울 때 도움을 받는 길이 일(실행)에서와 마음(말하기)에서 같은지 다른지를 본다.",
    blocks: ["strength-burden", "values"],
    scenes: ["S3", "S4"],
    notThis: ["스스로 해결한다 = 독립적 · 도움이 필요 없는 사람", "도움을 바로 받는다 = 의존적", "말하지 않는다 = 회피형 · 마음을 닫은 사람"],
    sajuPairs: [
      { cue: "나를 돕는 기운(인성)이 두드러지는 사주", effect: "도움을 받을 자리가 이미 주변에 있다고 읽고, 그 길이 열리는 조건(먼저 묻기 · 정리된 뒤)에 초점" },
      { cue: "스스로 해내려는 힘(비겁)이 두드러지거나 없는 사주", effect: "혼자 끌어안는 쪽의 부담 또는 나눠 맡는 쪽의 편안함을 같은 조합의 다른 면으로 읽는다" },
    ],
    overlap: "도움을 청하는 방식 · 마음을 나누는 정도는 성인 애착 연구(가까운 사람에게 기대는 정도)가 다루는 주제와 닮았다. 문장 · 척도 · 유형 이름은 가져오지 않았다.",
  },
  {
    id: "D3",
    name: "의견이 갈린 뒤의 반응과 회복",
    asks: "의견이 갈렸을 때 처음 하는 행동과, 풀린 뒤 마음이 다시 편해지는 조건이 같은 방향인지 다른지를 본다.",
    blocks: ["values", "love"],
    scenes: ["S5", "S6"],
    notThis: ["근거부터 말한다 = 감정보다 논리형", "물러선다 = 회피 · 피하는 사람", "맞춰 둔다 = 줏대 없음 · 자기주장이 약함"],
    sajuPairs: [
      { cue: "날카로운 표현을 뜻하는 기운(상관 등)과 배움 · 검토를 뜻하는 기운이 함께 있는 사주", effect: "말은 조리 있게 하지만 풀리는 조건이 다른 경우의 간극을 읽는다" },
      { cue: "배우자 자리와 다른 자리 사이의 부딪힘(충) · 끌어당김(합)이 있는 사주", effect: "관계에서 긴장이 생기기 쉬운 지점과 회복 조건을 함께 읽는다 — 시기 · 사건 예측이 아니라 반응의 방식에 초점" },
    ],
    overlap: "의견이 갈릴 때의 대처 방식(주장 · 배려 · 양보 · 물러남)은 갈등 처리 방식을 나누는 널리 알려진 틀과 닮았다. 그 틀의 이름 · 문항 · 채점은 가져오지 않았다.",
  },
  {
    id: "D4",
    name: "연락이 없을 때와 서운할 때의 기대",
    asks: "연락이 없는 날의 행동과 서운할 때 마음이 나가는 길이 어떻게 이어지는지를 본다 — 같은 담담함이어도 두 답의 조합에 따라 읽을 거리가 다르다.",
    blocks: ["love"],
    scenes: ["S7", "S8"],
    notThis: ["연락에 담담하다 = 독립적 = 안정형", "한 번 더 확인한다 = 불안형 · 집착", "기대를 낮춘다 = 관계에 관심이 없음", "정해진 애착 유형 이름 · 점수를 붙이지 않는다", "앞 행동의 이유를 뒤 행동으로 확정하지 않는다"],
    sajuPairs: [
      { cue: "배우자 자리가 가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 자리로 읽히는 사주", effect: "기대를 말로 전하는지 접어 두는지에 따라 같은 모습이 강점으로도 부담으로도 읽힌다 — 이유를 확정하지 않고 조건으로 쓴다" },
      { cue: "표현을 뜻하는 기운(식상)이 두드러지는 사주", effect: "마음을 말로 꺼내는 힘이 연락 장면에서 쓰이는지 접혀 있는지를 읽는다" },
    ],
    overlap: "연락이 없을 때의 마음 · 가까운 사람에게 기대하는 정도는 성인 애착 연구의 불안 · 회피 개념과 닮았다. 그 개념의 이름 · 문항 · 채점은 가져오지 않았고 유형으로 부르지 않는다.",
  },
  {
    id: "D5",
    name: "이어 가는 이유와 접는 계기",
    asks: "오래 이어 간 일과 접은 일이 서로 다른 이유에서 갈리는지를 본다 — 끈기의 많고 적음이 아니라 무엇이 이어 가게 하고 무엇이 접게 하는지.",
    blocks: ["work-money", "strength-burden"],
    scenes: ["S9", "S10"],
    notThis: ["접은 적이 있다 = 끈기 부족", "책임감으로 이어 간다 = 성실한 사람 · 부담을 못 놓는 사람", "더 끌리는 일로 옮긴다 = 변덕", "고른 접는 계기를 다른 이유(기준 미달 등)로 바꿔 읽지 않는다"],
    sajuPairs: [
      { cue: "표현 · 결과물을 뜻하는 기운(식상)이 성과로 이어지는 짜임(식상생재 등)이 있는 사주", effect: "결과가 보이는 단위로 이어 가는 힘으로 읽고 접는 계기와 짝지어 쓴다" },
      { cue: "지금 지나는 시기(대운 · 세운)가 일의 방식을 바꾸는 주제로 읽히는 사주", effect: "시기가 바뀔 때 이어 가던 동력이 달라질 수 있는 지점으로 읽는다 — 사건 예측은 하지 않는다" },
    ],
    overlap: "무엇이 일을 이어 가게 하는지(책임 · 성취 · 사람 · 내 기준)는 동기 연구가 다루는 주제와 닮았다. 문항 · 척도는 가져오지 않았다.",
  },
];

// ───────────── 장면 10개 (구분마다 서로 다른 장면 2개) ─────────────

export const SCENES: Scene[] = [
  {
    id: "S1",
    thread: "D1",
    label: "혼자 해 볼 수 있는 작은 일",
    ask: "혼자 해 볼 수 있는 작은 일이 생겼어요. 처음 하는 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "일단 손부터 대 보면서 방법을 잡아요", tag: "act-first", plain: "혼자 하는 일은 일단 손부터 대 보면서 방법을 잡는다", shows: "혼자일 때는 해 보면서 방법을 찾는 방식이다" },
      { id: "b", text: "순서와 기준을 먼저 정리하고 시작해요", tag: "frame-first", plain: "혼자 하는 일은 순서와 기준을 먼저 정리하고 시작한다", shows: "혼자일 때는 틀을 세운 뒤 움직이는 방식이다" },
      { id: "c", text: "비슷한 사례나 방법을 먼저 찾아봐요", tag: "reference-first", plain: "혼자 하는 일은 비슷한 사례나 방법을 먼저 찾아본다", shows: "혼자일 때는 이미 있는 방법을 참고한 뒤 움직이는 방식이다" },
      { id: "d", text: "필요한 때가 가까워지면 몰아서 해요", tag: "pace-by-need", plain: "혼자 하는 일은 필요한 때가 가까워지면 몰아서 한다", shows: "혼자일 때는 필요가 가까워질 때 집중이 모이는 방식이다" },
    ],
    difference: "혼자일 때 속도와 출발점(해 보기 · 틀 · 사례 · 필요가 올 때)을 가른다. 이 장면만으로는 성향을 읽지 않는다.",
    watch: "'필요한 때'가 마감인지 마음이 내킬 때인지, '가'와 '다'를 둘 다 하는 사람이 많은지(둘 다면 처음 하는 행동 하나를 고르게 하는 문구가 맞는지).",
  },
  {
    id: "S2",
    thread: "D1",
    label: "함께 맡은 일 · 역할이 아직 없을 때",
    ask: "여럿이 함께 맡은 일인데 아직 역할이 정해지지 않았어요. 처음 하는 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "내가 할 수 있는 부분을 정해 먼저 시작해요", tag: "claim-part", plain: "역할이 정해지지 않은 일에서는 내가 할 수 있는 부분을 정해 먼저 시작한다", shows: "역할이 없는 자리에서 내 몫을 스스로 정해 움직이는 방식이다" },
      { id: "b", text: "누가 무엇을 할지 말로 먼저 정하자고 해요", tag: "name-roles", plain: "역할이 정해지지 않은 일에서는 누가 무엇을 할지 말로 먼저 정하자고 한다", shows: "역할을 말로 정리해 몫을 눈에 보이게 하는 방식이다" },
      { id: "c", text: "다른 사람들이 정하는 흐름을 보고 맞춰요", tag: "follow-flow", plain: "역할이 정해지지 않은 일에서는 다른 사람들이 정하는 흐름을 보고 맞춘다", shows: "역할이 정해지는 흐름을 본 뒤 맞춰 움직이는 방식이다" },
      { id: "d", text: "눈에 띄는 빈 곳을 조용히 채워요", tag: "fill-gap", plain: "역할이 정해지지 않은 일에서는 눈에 띄는 빈 곳을 조용히 채운다", shows: "말로 정하지 않고 비는 곳을 직접 메우는 방식이다" },
    ],
    difference: "함께일 때 몫을 잡는 방식(먼저 맡음 · 말로 정함 · 흐름에 맞춤 · 조용히 채움)을 가르고, S1과 비교해 혼자일 때와 같은지 다른지를 본다.",
    watch: "'조용히 채워요'가 배려로 읽히는지 눈치로 읽히는지, 어느 선택지가 '좋은 팀원'처럼 보여 쏠리지 않는지.",
  },
  {
    id: "S3",
    thread: "D2",
    label: "일이 버거울 때 도움 제안",
    ask: "맡은 일이 버거운데 누가 도와주겠다고 해요. 실제로 하는 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "그 부분을 그 사람에게 맡겨요", tag: "hand-over", plain: "일이 버거울 때 도움을 제안받으면 그 부분을 그 사람에게 맡긴다", shows: "일이 버거울 때 실행의 일부를 넘기는 방식이다" },
      { id: "b", text: "방법만 묻고 내가 직접 해요", tag: "ask-method", plain: "일이 버거울 때 도움을 제안받으면 방법만 묻고 내가 직접 한다", shows: "도움은 방법으로만 받고 실행은 직접 맡는 방식이다" },
      { id: "c", text: "같이 붙어서 함께 진행해요", tag: "work-together", plain: "일이 버거울 때 도움을 제안받으면 같이 붙어서 함께 진행한다", shows: "버거운 일을 함께 진행하며 나누는 방식이다" },
      { id: "d", text: "먼저 해 보고, 막히면 그때 부탁해요", tag: "try-then-ask", plain: "일이 버거울 때 도움을 제안받으면 먼저 해 보고 막히면 그때 부탁한다", shows: "막힐 때까지는 혼자 해 보고 그 뒤에 도움을 청하는 방식이다" },
    ],
    difference: "일(실행)에서 도움이 들어오는 길 — 넘김 · 방법만 · 같이 · 먼저 해 보고 부탁 — 을 가른다.",
    watch: "제안한 사람이 누구인지(상사 · 친구 · 가족)에 따라 답이 달라지는지, 어느 쪽이 '민폐 없는 사람'처럼 보여 쏠리지 않는지.",
  },
  {
    id: "S4",
    thread: "D2",
    label: "마음이 힘들 때 말하게 되는 때",
    ask: "마음이 힘든 일이 있어요. 가까운 사람에게 이야기하게 되는 때에 가장 가까운 것은?",
    options: [
      { id: "a", text: "누가 먼저 괜찮냐고 물어봐 주면 해요", tag: "when-asked", plain: "마음이 힘들 때는 누가 먼저 괜찮냐고 물어봐 주면 이야기한다", shows: "마음의 이야기는 상대가 문을 열어 줄 때 나오는 방식이다" },
      { id: "b", text: "마음이 어느 정도 정리된 뒤에 해요", tag: "after-sorted", plain: "마음이 힘들 때는 마음이 어느 정도 정리된 뒤에 이야기한다", shows: "정리가 된 뒤에 마음을 꺼내는 방식이다" },
      { id: "c", text: "힘들다고 느끼는 바로 그때 해요", tag: "right-away", plain: "마음이 힘들 때는 힘들다고 느끼는 바로 그때 이야기한다", shows: "마음이 힘들 때 바로 나누는 방식이다" },
      { id: "d", text: "말하기보다 혼자 정리하는 쪽이에요", tag: "sort-alone", plain: "마음이 힘들 때는 말하기보다 혼자 정리한다", shows: "마음의 일은 혼자 정리하는 쪽이다" },
    ],
    difference: "마음에서 도움이 들어오는 길(먼저 물어 줌 · 정리한 뒤 · 바로 · 혼자)을 가르고, S3와 비교해 일과 마음의 길이 같은지 다른지를 본다.",
    watch: "'가까운 사람'을 누구로 떠올리는지, '라'를 고른 사람이 '말할 사람이 없음'과 '말하지 않는 편'을 구분해 읽는지(없다면 '맞는 선택지가 없어요'로 가야 한다).",
  },
  {
    id: "S5",
    thread: "D3",
    label: "가까운 사람과 의견이 갈렸을 때",
    ask: "가까운 사람과 의견이 갈렸어요. 가장 먼저 하는 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "내 생각의 근거부터 차분히 말해요", tag: "state-reasons", plain: "의견이 갈리면 내 생각의 근거부터 차분히 말한다", shows: "의견이 갈릴 때 생각의 근거를 먼저 꺼내는 방식이다" },
      { id: "b", text: "상대 입장과 기분부터 확인해요", tag: "check-other", plain: "의견이 갈리면 상대 입장과 기분부터 확인한다", shows: "의견이 갈릴 때 상대의 입장을 먼저 확인하며 시작하는 방식이다" },
      { id: "c", text: "일단 맞춰 두고 나중에 이야기해요", tag: "yield-now", plain: "의견이 갈리면 일단 맞춰 두고 나중에 이야기한다", shows: "그 자리에서는 맞추고 이야기를 뒤로 미루는 방식이다" },
      { id: "d", text: "한 발 물러나 시간을 둬요", tag: "step-back", plain: "의견이 갈리면 한 발 물러나 시간을 둔다", shows: "그 자리에서는 물러나 시간을 두는 방식이다" },
    ],
    difference: "갈등의 첫 반응(근거 · 상대 확인 · 일단 맞춤 · 물러남)을 가른다. 이 반응이 좋고 나쁨이 아니라, 풀리는 조건(S6)과 같은 방향인지가 읽을 거리다.",
    watch: "누구와의 갈등인지(연인 · 가족 · 친구)에 따라 답이 갈리는지, '가'를 고른 사람이 '싸우는 것'으로 읽지 않는지.",
  },
  {
    id: "S6",
    thread: "D3",
    label: "오해를 푼 뒤 편해지는 데 도움이 되는 것",
    ask: "오해를 푼 뒤, 마음이 다시 편해지는 데 가장 도움이 되는 것은?",
    options: [
      { id: "a", text: "내가 어떻게 느꼈는지 이해받았다는 느낌", tag: "feel-understood", plain: "오해를 푼 뒤 마음이 편해지는 데는 내가 어떻게 느꼈는지 이해받았다는 느낌이 가장 도움이 된다", shows: "풀린 뒤에는 내 느낌을 이해받았다는 확인이 마음을 편하게 하는 방식이다" },
      { id: "b", text: "앞으로 어떻게 할지 서로 정리한 것", tag: "agree-next", plain: "오해를 푼 뒤 마음이 편해지는 데는 앞으로 어떻게 할지 서로 정리한 것이 가장 도움이 된다", shows: "앞으로의 방식을 서로 정하는 것이 마음을 편하게 하는 방식이다" },
      { id: "c", text: "아무 일 없었던 것처럼 이어지는 일상", tag: "easy-routine", plain: "오해를 푼 뒤 마음이 편해지는 데는 아무 일 없었던 것처럼 이어지는 일상이 가장 도움이 된다", shows: "평소 같은 일상으로 돌아오는 것이 마음을 편하게 하는 방식이다" },
      { id: "d", text: "혼자 정리할 시간", tag: "alone-time", plain: "오해를 푼 뒤 마음이 편해지는 데는 혼자 정리할 시간이 가장 도움이 된다", shows: "혼자 정리하는 시간이 마음을 편하게 하는 방식이다" },
    ],
    difference: "풀린 뒤 마음이 편해지는 조건(이해받음 · 다음 합의 · 자연스러운 일상 · 혼자 정리)을 가르고, S5의 첫 반응과 비교해 방향이 같은지 다른지를 본다.",
    watch: "'편해지는 데 도움이 되는 것'과 '상대에게 바라는 것'을 구분해 읽는지, 여러 개가 해당될 때 '가장'이 지켜지는지.",
  },
  {
    id: "S7",
    thread: "D4",
    label: "하루 종일 답이 없을 때의 행동",
    ask: "가까운 사람에게서 하루 종일 답이 없었어요. 그날 실제로 한 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "평소처럼 하루를 보내요", tag: "carry-on", plain: "하루 종일 답이 없는 날에는 평소처럼 하루를 보낸다", shows: "연락이 없는 날에도 자기 일상의 리듬을 유지하는 방식이다" },
      { id: "b", text: "일에 더 몰두해서 신경을 돌려요", tag: "busy-self", plain: "하루 종일 답이 없는 날에는 일에 더 몰두해서 신경을 돌린다", shows: "신경 쓰이는 마음을 일로 돌리는 방식이다" },
      { id: "c", text: "한 번 더 연락해서 확인해요", tag: "check-again", plain: "하루 종일 답이 없는 날에는 한 번 더 연락해서 확인한다", shows: "답이 없을 때 직접 확인에 나서는 방식이다" },
      { id: "d", text: "이유를 이것저것 생각하며 기다려요", tag: "wait-guess", plain: "하루 종일 답이 없는 날에는 이유를 이것저것 생각하며 기다린다", shows: "행동은 멈추고 이유를 헤아리며 기다리는 방식이다" },
    ],
    difference: "겉으로 드러난 행동(평소대로 · 몰두 · 다시 확인 · 이유를 생각)만 가른다 — 마음속 이유(믿음 · 낮은 기대 · 관심 없음)는 이 장면 하나로 구분하지 않고 S8과 함께 읽는다.",
    watch: "연인 · 친구 · 가족 중 누구를 떠올리는지, '가'를 고른 사람의 속마음이 갈리는지(인터뷰에서 \"그날 마음은 어땠나요\"를 묻는다).",
  },
  {
    id: "S8",
    thread: "D4",
    label: "소홀한 대접을 받는 것 같을 때",
    ask: "가까운 사람에게 소홀한 대접을 받는 것 같아요. 가장 가까운 것은?",
    options: [
      { id: "a", text: "내가 느낀 점을 먼저 말로 꺼내요", tag: "say-it", plain: "소홀한 대접을 받는 것 같으면 내가 느낀 점을 먼저 말로 꺼낸다", shows: "서운함을 말로 꺼내 관계 안에서 다루는 방식이다" },
      { id: "b", text: "상대가 먼저 알아채 주기를 기다려요", tag: "wait-notice", plain: "소홀한 대접을 받는 것 같으면 상대가 먼저 알아채 주기를 기다린다", shows: "서운함을 말하지 않고 상대의 알아챔을 기다리는 방식이다" },
      { id: "c", text: "기대를 낮추고 그냥 지나가요", tag: "lower-expect", plain: "소홀한 대접을 받는 것 같으면 기대를 낮추고 그냥 지나간다", shows: "서운함이 생기면 기대를 낮춰 넘기는 방식이다" },
      { id: "d", text: "행동으로 내 마음을 보여 주며 반응을 살펴요", tag: "show-by-act", plain: "소홀한 대접을 받는 것 같으면 행동으로 내 마음을 보여 주며 반응을 살핀다", shows: "마음을 말 대신 행동으로 전하며 반응을 보는 방식이다" },
    ],
    difference: "서운함이 말 · 기다림 · 기대 접기 · 행동 중 어디로 나가는지를 가르고, S7과 함께 읽어 연락 장면의 반응이 어떻게 이어지는지를 본다.",
    watch: "'소홀한 대접'이 구체적으로 어떤 장면으로 떠오르는지, '다'를 고른 사람이 편안해서인지 포기해서인지 인터뷰에서 확인한다.",
  },
  {
    id: "S9",
    thread: "D5",
    label: "흥미가 떨어진 뒤에도 이어 간 일",
    ask: "흥미가 떨어졌는데도 계속 이어 간 일이 있다면, 이어 가게 한 것에 가장 가까운 것은?",
    options: [
      { id: "a", text: "해야 한다는 약속이나 책임", tag: "duty", plain: "흥미가 떨어진 일을 이어 가게 한 것은 해야 한다는 약속이나 책임이었다", shows: "흥미가 식은 뒤에도 약속 · 책임이 일을 붙들어 주는 방식이다" },
      { id: "b", text: "조금씩 늘어 가는 결과나 실력", tag: "progress", plain: "흥미가 떨어진 일을 이어 가게 한 것은 조금씩 늘어 가는 결과나 실력이었다", shows: "결과 · 실력이 눈에 보일 때 이어 가는 방식이다" },
      { id: "c", text: "알아봐 주거나 함께하는 사람", tag: "people", plain: "흥미가 떨어진 일을 이어 가게 한 것은 알아봐 주거나 함께하는 사람이었다", shows: "사람이 일을 이어 가는 힘이 되는 방식이다" },
      { id: "d", text: "내 기준에서 끝은 봐야 한다는 마음", tag: "own-standard", plain: "흥미가 떨어진 일을 이어 가게 한 것은 내 기준에서 끝은 봐야 한다는 마음이었다", shows: "스스로 정한 끝의 기준이 일을 붙들어 주는 방식이다" },
    ],
    difference: "이어 가는 힘의 출처(책임 · 결과 · 사람 · 내 기준)를 가른다. 끈기의 많고 적음은 가르지 않는다.",
    watch: "떠올린 일이 일 · 취미 · 관계 중 무엇인지, 이유를 묻는 질문이라 나중에 만든 이유(합리화)가 섞이지 않는지(인터뷰에서 당시 상황을 먼저 말하게 한다).",
  },
  {
    id: "S10",
    thread: "D5",
    label: "하던 일을 접은 마지막 계기",
    ask: "하던 일을 접은 적이 있다면, 접기로 한 마지막 계기에 가장 가까운 것은?",
    options: [
      { id: "a", text: "해도 달라지는 것이 없다고 느꼈을 때", tag: "no-change", plain: "하던 일을 접은 마지막 계기는 해도 달라지는 것이 없다고 느꼈을 때였다", shows: "변화가 느껴지지 않을 때 접는 방식이다" },
      { id: "b", text: "부담이 나에게 너무 몰렸을 때", tag: "overloaded", plain: "하던 일을 접은 마지막 계기는 부담이 나에게 너무 몰렸을 때였다", shows: "부담이 몰릴 때 접는 방식이다" },
      { id: "c", text: "더 끌리는 다른 일이 생겼을 때", tag: "pulled", plain: "하던 일을 접은 마지막 계기는 더 끌리는 다른 일이 생겼을 때였다", shows: "끌리는 쪽이 생기면 옮겨 가는 방식이다" },
      { id: "d", text: "같이 하던 사람이나 환경이 바뀌었을 때", tag: "context-shift", plain: "하던 일을 접은 마지막 계기는 같이 하던 사람이나 환경이 바뀌었을 때였다", shows: "함께하던 조건이 바뀔 때 접는 방식이다" },
    ],
    difference: "접는 계기(변화 없음 · 몰린 부담 · 끌림 · 환경 변화)를 가르고, S9의 이어 가는 힘과 짝지어 같은 일이 이어지고 접히는 방식을 읽는다.",
    watch: "접은 적이 없는 사람이 '이런 일이 거의 없었어요'로 가는지, 접는 것이 '실패'로 읽혀 답을 피하지 않는지.",
  },
];

// ───────────── 두 답을 함께 볼 때의 해석 규칙 ─────────────
// 한 구분의 16개 답 쌍을 빠짐없이, 겹치지 않게 덮는다(테스트가 모든 쌍을 세어 확인한다).
// 해석 후보는 이유를 확정하지 않는 조건형이다 — "A여서 B"라고 쓰지 않고 "A와 B가 함께 있다 · ~일 수 있다"로 쓴다.
// 사용자 본문에는 고른 선택지 문장을 되풀이하지 않는다(글쓰기 규칙이 따로 막는다). 이 규칙의 문장은 리포트 AI가 받는 "해석 후보"이지 화면에 그대로 나가는 글이 아니다.

export const PATTERNS: Pattern[] = [
  // D1 — 혼자일 때(S1: act-first · frame-first · reference-first · pace-by-need) × 함께일 때(S2: claim-part · name-roles · follow-flow · fill-gap)
  { id: "P1.1", thread: "D1", first: ["act-first"], second: ["claim-part"], candidates: ["혼자일 때도 함께일 때도 먼저 움직이는 방식이 이어진다. 그 속도가 강점으로 쓰이는 만큼, 몫이 정해지기 전에 일이 이 사람에게 먼저 모일 수 있다."], notThis: "리더형 · 책임감이 강한 사람으로 단정" },
  { id: "P1.2", thread: "D1", first: ["act-first"], second: ["name-roles"], candidates: ["혼자일 때는 해 보면서 방법을 잡고 함께일 때는 몫을 말로 정리하자고 하는 등 맥락에 따라 방식을 바꿔 쓰는 모습이다. 함께일 때는 속도보다 몫이 눈에 보이는 것을 앞세우는 쪽일 수 있다."], notThis: "일관성이 없는 사람" },
  { id: "P1.3", thread: "D1", first: ["act-first", "frame-first", "reference-first"], second: ["follow-flow"], candidates: ["혼자일 때는 스스로 출발점을 정하는데 함께일 때는 흐름을 본 뒤 맞춘다. 역할이 분명해지면 혼자일 때처럼 움직일 수 있는지가 읽을 거리일 수 있다."], nuance: { "act-first": "혼자일 때의 빠른 시작과 함께일 때의 기다림 사이에 속도 차이가 큰 쪽이다.", "frame-first": "혼자일 때는 틀을 세우지만 함께일 때는 틀이 정해지기를 기다리는 쪽이다.", "reference-first": "혼자일 때는 참고할 방법을 찾지만 함께일 때는 다른 사람의 흐름이 그 참고가 되는 쪽이다." }, notThis: "소극적 · 주도성이 부족한 사람" },
  { id: "P1.4", thread: "D1", first: ["act-first", "frame-first", "reference-first"], second: ["fill-gap"], candidates: ["혼자일 때의 방식은 달라도 함께일 때는 말 없이 빈 곳을 채운다. 몫이 말로 정리되지 않은 채 쌓여 보이지 않는 일이 될 수 있다."], needs: "함께하는 일에서 맡은 몫이 늘어난 장면은 사주의 표현 · 책임 근거가 받쳐 줄 때만 쓴다", nuance: { "act-first": "혼자일 때는 스스로 시작하는데 함께일 때는 빈 곳으로 방향이 바뀌는 점이 읽을 거리다.", "frame-first": "혼자일 때는 틀을 먼저 세우는데 함께일 때는 틀을 말로 꺼내기보다 몸으로 메우는 쪽이다.", "reference-first": "혼자일 때는 참고를 찾지만 함께일 때는 참고 없이 빈 곳을 바로 채우는 쪽이다." }, notThis: "눈치 보는 사람 · 배려가 많은 사람으로 단정" },
  { id: "P1.5", thread: "D1", first: ["frame-first", "reference-first"], second: ["claim-part"], candidates: ["혼자일 때는 정리나 참고를 거친 뒤 움직이는데 함께일 때는 정리 전에 먼저 맡는다. 함께일 때 몫이 서둘러 정해지면 나중에 범위를 조정해야 할 수 있다."], notThis: "충동적이거나 앞뒤가 다른 사람" },
  { id: "P1.6", thread: "D1", first: ["frame-first", "reference-first"], second: ["name-roles"], candidates: ["혼자일 때 정리하거나 참고하는 방식이 함께일 때 역할을 말로 정리하는 방식으로 이어진다. 정리된 구조가 있을 때 편하게 움직이는 만큼, 정리하는 일이 한 사람 몫이 될 수 있다."], notThis: "통제하려는 사람" },
  { id: "P1.7", thread: "D1", first: ["pace-by-need"], second: ["claim-part", "name-roles"], candidates: ["혼자일 때는 필요가 가까워질 때 집중이 모이는데 함께일 때는 먼저 나선다. 다른 사람의 시간이 걸려 있을 때 속도가 달라지는 쪽일 수 있다."], nuance: { "claim-part": "함께일 때는 몫을 스스로 정해 먼저 움직이는 점이 혼자일 때와 가장 다르다.", "name-roles": "함께일 때는 몫을 말로 정리해 일의 출발을 앞당기는 점이 혼자일 때와 다르다." }, notThis: "미루는 사람 · 남 앞에서만 부지런한 사람" },
  { id: "P1.8", thread: "D1", first: ["pace-by-need"], second: ["follow-flow"], candidates: ["혼자일 때도 함께일 때도 신호(마감 · 정해진 역할)가 생긴 뒤에 움직인다. 시작을 당겨 주는 신호가 있는지가 속도를 가를 수 있다."], notThis: "게으른 사람 · 소극적인 사람" },
  { id: "P1.9", thread: "D1", first: ["pace-by-need"], second: ["fill-gap"], candidates: ["혼자일 때는 필요가 올 때 몰아서 하고 함께일 때는 빈 곳을 조용히 메운다. 비어 보이는 자리가 신호가 되어 움직이는 만큼, 일이 말로 정리되지 않은 채 한꺼번에 몰릴 수 있다."], notThis: "미루는 사람 · 눈치 보는 사람" },

  // D2 — 일(S3: hand-over · work-together = 나눔 / ask-method · try-then-ask = 직접) × 마음(S4: right-away · when-asked = 열림 / after-sorted · sort-alone = 정리 뒤·혼자)
  { id: "P2.1", thread: "D2", first: ["hand-over", "work-together"], second: ["right-away", "when-asked"], candidates: ["일에서도 마음에서도 도움이 들어오는 길이 있다. 일이나 마음이 쌓이기 전에 나눠질 수 있는 방식이다."], nuance: { "when-asked": "마음 쪽은 상대가 먼저 물어 줄 때 열리므로, 물어 주는 사람이 곁에 있는지가 변수일 수 있다." }, notThis: "의존적인 사람" },
  { id: "P2.2", thread: "D2", first: ["hand-over", "work-together"], second: ["after-sorted", "sort-alone"], candidates: ["일은 나누는데 마음은 정리된 뒤나 혼자 다룬다. 실무 도움은 받되 마음을 말할 자리는 따로 필요할 수 있다."], nuance: { "after-sorted": "정리된 뒤에 말할 상대가 곁에 있는지가 변수일 수 있다.", "sort-alone": "말하기보다 혼자 정리하는 쪽이라, 마음을 묻는 것보다 곁에 있어 주는 방식이 편할 수 있다." }, notThis: "마음을 닫은 사람 · 회피형" },
  { id: "P2.3", thread: "D2", first: ["ask-method", "try-then-ask"], second: ["right-away", "when-asked"], candidates: ["일은 직접 해결하는 쪽이고 마음은 나눈다. 해결은 내가, 곁에 있어 주는 일은 상대에게 맡기는 구분이 생길 수 있다."], nuance: { "try-then-ask": "막힌 뒤에는 도움을 청하는 길이 있다.", "when-asked": "마음 쪽은 상대가 먼저 물어 줄 때 열린다." }, notThis: "일은 혼자 다 하려는 사람" },
  { id: "P2.4", thread: "D2", first: ["ask-method", "try-then-ask"], second: ["after-sorted", "sort-alone"], candidates: ["일에서도 마음에서도 내 쪽에서 정리가 된 뒤에 도움의 문이 열린다. 도움이 필요한 때가 겉으로 잘 보이지 않을 수 있다."], nuance: { "try-then-ask": "막힌 뒤에 청하는 방식이라 청하는 시점이 늦어질 수 있다.", "ask-method": "방법만 묻고 직접 하는 방식이라 실행의 부담은 계속 본인에게 남을 수 있다." }, notThis: "독립적이라 도움이 필요 없는 사람" },

  // D3 — 첫 반응(S5: state-reasons · check-other = 말로 시작 / yield-now · step-back = 물러남) × 풀리는 조건(S6)
  { id: "P3.1", thread: "D3", first: ["state-reasons", "check-other"], second: ["feel-understood"], candidates: ["말은 근거나 상대 확인으로 하는데 마음이 풀리는 조건은 내 느낌을 이해받는 데 있다. 대화가 끝났는데 마음의 몫이 남는 일이 생길 수 있다."], nuance: { "state-reasons": "근거에만 답이 돌아오면 마음의 몫이 더 남을 수 있다.", "check-other": "상대의 기분을 먼저 살피는 만큼 내 느낌을 알아주는 몫이 비기 쉬울 수 있다." }, notThis: "감정보다 논리가 앞서는 사람" },
  { id: "P3.2", thread: "D3", first: ["yield-now", "step-back"], second: ["feel-understood"], candidates: ["처음에는 맞추거나 물러나는데 풀리는 조건은 내 느낌을 알아주는 것이다. 물러난 동안 상대가 알아줄 기회를 놓칠 수 있다."], nuance: { "yield-now": "'나중에 이야기'의 시점이 정해지지 않으면 풀릴 기회가 늦어질 수 있다.", "step-back": "시간을 두는 동안 상대가 그 거리를 무관심으로 읽을 수 있다." }, notThis: "자기주장이 약한 사람 · 피하는 사람" },
  { id: "P3.3", thread: "D3", first: ["state-reasons", "check-other"], second: ["agree-next"], candidates: ["말로 시작해 앞으로의 방식을 정하는 것으로 마무리한다. 첫 반응과 풀리는 조건이 같은 방향이라 정리가 빠르게 이어질 수 있다."], notThis: "갈등을 잘 푸는 사람 · 갈등이 적은 사람" },
  { id: "P3.4", thread: "D3", first: ["yield-now", "step-back"], second: ["agree-next"], candidates: ["처음에는 맞추거나 물러나지만 풀리는 조건은 앞으로의 방식을 서로 정하는 것이다. 물러난 뒤 합의하는 대화로 이어지는 시점이 정해져 있는지가 변수일 수 있다."], notThis: "피하다가 나중에 따지는 사람" },
  { id: "P3.5", thread: "D3", first: ["state-reasons", "check-other"], second: ["alone-time"], candidates: ["대화로는 풀어 가지만 마음이 가라앉는 데는 혼자 정리할 시간이 따로 필요하다. 이야기를 마친 뒤에도 마음이 가라앉는 속도는 다를 수 있다."], nuance: { "state-reasons": "말로 정리했다고 마음까지 바로 정리되지는 않을 수 있다.", "check-other": "상대를 먼저 살핀 만큼 내 마음을 가라앉힐 시간이 뒤로 밀릴 수 있다." }, notThis: "대화를 피하는 사람" },
  { id: "P3.6", thread: "D3", first: ["yield-now", "step-back"], second: ["alone-time"], candidates: ["그 자리에서는 맞추거나 물러나고 풀리는 데도 혼자 정리할 시간이 도움이 된다. 정리할 시간을 확보하는 방식이 반복되는 셈이라, 상대가 기다리는 동안 관계가 끊겼다고 느끼지 않게 다시 이야기할 때를 정해 두는 것이 도움이 될 수 있다."], notThis: "회피 · 관계를 가볍게 보는 사람" },
  { id: "P3.7", thread: "D3", first: ["state-reasons", "check-other"], second: ["easy-routine"], candidates: ["말로 시작해 풀고 나서는 평소 같은 일상으로 돌아와야 마음이 풀린다. 대화 뒤에 일상이 이어지는 모습이 회복의 신호가 될 수 있다."], notThis: "뒤끝이 없는 사람" },
  { id: "P3.8", thread: "D3", first: ["yield-now", "step-back"], second: ["easy-routine"], candidates: ["그 자리에서는 맞추거나 물러나고 풀리는 신호는 평소 같은 일상이다. 상대가 일상의 모습을 회복의 신호로 읽는지에 따라 풀리는 속도가 달라질 수 있다."], notThis: "대화를 싫어하는 사람" },

  // D4 — 하루 종일 답이 없을 때(S7) × 소홀한 대접을 받는 것 같을 때(S8: say-it / wait-notice · show-by-act = 말 대신 전함 / lower-expect)
  { id: "P4.1", thread: "D4", first: ["carry-on"], second: ["say-it"], candidates: ["연락이 없는 날에도 일상의 리듬을 유지하면서 서운함은 말로 꺼내 관계 안에서 다루는 방식이 함께 있다. 표현하는 힘이 관계의 대화에서 쓰일 때는 강점이 되고, 서운함을 꺼내는 몫을 늘 혼자 맡으면 부담이 될 수 있다."], notThis: "독립적 · 안정형 · '말할 수 있어서 담담한 것'으로 원인 확정" },
  { id: "P4.2", thread: "D4", first: ["carry-on"], second: ["wait-notice", "show-by-act"], candidates: ["일상은 평소와 같게 유지하는데 서운함은 말 대신 상대의 알아챔이나 행동으로 전한다. 겉이 평소와 같아서 서운하다는 신호가 상대에게 덜 보일 수 있다."], nuance: { "wait-notice": "알아채 주기를 기다리는 동안 일상이 평소와 같으면 상대는 신호를 알아채기 더 어려울 수 있다.", "show-by-act": "행동으로 보여 주는 마음이 일상 속에 섞여 상대에게 서운함으로 읽히지 않을 수 있다." }, notThis: "독립적 · 안정형 · 서운함이 없는 사람" },
  { id: "P4.3", thread: "D4", first: ["carry-on"], second: ["lower-expect"], candidates: ["일상도 유지하고 서운해도 기대를 낮춰 넘기는 방식이 겹쳐 있다. 겉으로는 담담하게 보일 수 있어, 편안한 것인지 기대를 접어 두는 것인지는 이 두 답만으로는 가려지지 않는다."], needs: "가까운 관계에서 기대가 큰 자리(배우자 자리 등)에 관한 사주 근거가 있을 때만 \"말하지 않은 기대가 쌓일 수 있다\"를 쓴다. 근거가 없으면 두 방식이 함께 있다는 것까지만 장면으로 푼다", notThis: "독립적 · 안정형 · 관심 없음" },
  { id: "P4.4", thread: "D4", first: ["busy-self"], second: ["say-it"], candidates: ["신경 쓰이는 마음을 일로 돌리면서도 서운함은 말로 꺼낸다. 일에 몰두하는 동안 마음의 일이 뒤로 밀릴 수 있지만 말로 다루는 길은 열려 있다."], notThis: "회피하는 사람" },
  { id: "P4.5", thread: "D4", first: ["busy-self"], second: ["wait-notice", "show-by-act"], candidates: ["신경을 일로 돌리고 서운함은 말 대신 알아챔이나 행동으로 전한다. 일에 몰두하는 동안 상대는 신호를 놓칠 수 있다."], notThis: "회피하는 사람 · 눈치 보는 사람" },
  { id: "P4.6", thread: "D4", first: ["busy-self"], second: ["lower-expect"], candidates: ["신경은 일로 돌리고 서운해도 기대를 낮춰 넘긴다. 마음의 일이 일 속에 가려져 본인에게도 잘 보이지 않을 수 있다."], notThis: "회피 · 독립적" },
  { id: "P4.7", thread: "D4", first: ["check-again", "wait-guess"], second: ["say-it"], candidates: ["연락이 없을 때 신경이 쓰이지만 서운함은 말로 다루는 길이 있다. 확인이나 헤아림이 대화로 이어질 때 마음이 풀릴 수 있다."], nuance: { "check-again": "직접 확인에 나서는 만큼 확인이 서운함을 꺼내는 대화로 이어지는 흐름이 있다.", "wait-guess": "혼자 헤아리는 시간이 길어지면 말로 꺼내기 전에 해석이 쌓일 수 있다." }, notThis: "불안형 · 집착" },
  { id: "P4.8", thread: "D4", first: ["check-again", "wait-guess"], second: ["wait-notice", "show-by-act"], candidates: ["신경이 쓰이는데 마음을 말 대신 알아챔이나 행동으로 전한다. 확인받고 싶은 마음이 상대에게 닿지 않으면 서운함이 커질 수 있다."], nuance: { "check-again": "연락으로 확인은 하지만 서운한 마음 자체는 말하지 않는 쪽이다.", "wait-guess": "이유를 헤아리며 기다리는 동안 마음이 전달되지 않는 시간이 길어질 수 있다." }, notThis: "불안형 · 집착 · 눈치 보는 사람" },
  { id: "P4.9", thread: "D4", first: ["check-again", "wait-guess"], second: ["lower-expect"], candidates: ["신경은 쓰이는데 서운하면 기대는 낮춰 넘긴다. 마음속의 신경 쓰임과 겉의 반응 사이에 간격이 생길 수 있고, 확인하고 싶은 마음을 접어 두는 쪽일 수 있다."], notThis: "불안형 · 관심 없음" },

  // D5 — 이어 가게 한 것(S9) × 접은 마지막 계기(S10)
  { id: "P5.1", thread: "D5", first: ["duty", "progress", "people", "own-standard"], second: ["pulled"], candidates: ["이어 가던 힘의 출처가 달라도 접는 계기는 더 끌리는 일이다. 끝까지 못 하는 것이 아니라 끌리는 쪽으로 옮겨 가는 방식이므로 마무리하는 방식이 따로 필요할 수 있다."], nuance: { duty: "책임으로 이어 가던 일이 끌림에 밀리는 만큼 정리하고 넘기는 방법이 필요할 수 있다.", progress: "결과가 보이던 일에서도 더 끌리는 쪽으로 옮겨 가는 방식이다.", people: "함께하던 사람이 있는 일을 접을 때는 옮겨 가는 방식에 사람 몫도 걸려 있을 수 있다.", "own-standard": "끝을 보려던 기준이 있어도 끌리는 쪽이 생기면 옮겨 가는 방식이다." }, notThis: "변덕 · 끈기 부족" },
  { id: "P5.2", thread: "D5", first: ["people"], second: ["context-shift"], candidates: ["사람이 이어 가는 힘이면서 접는 계기도 함께하던 사람이나 환경의 변화다. 함께하는 조건이 바뀔 때 일의 동력도 함께 바뀔 수 있다."], notThis: "남에게 휘둘리는 사람" },
  { id: "P5.3", thread: "D5", first: ["duty", "progress", "own-standard"], second: ["context-shift"], candidates: ["이어 가던 힘은 사람이 아닌데 접는 계기는 함께하던 사람이나 환경의 변화다. 일 자체를 이어 가는 힘과 함께하는 조건이 서로 다른 변수로 작용할 수 있다."], notThis: "환경 탓을 하는 사람" },
  { id: "P5.4", thread: "D5", first: ["progress"], second: ["no-change"], candidates: ["결과가 보일 때 이어 가고 변화가 느껴지지 않을 때 접는다. 결과를 자주 확인할 수 있는 단위로 쪼개는 것이 이어 가기에 도움이 될 수 있다."], notThis: "결과만 따지는 사람" },
  { id: "P5.5", thread: "D5", first: ["duty", "people", "own-standard"], second: ["no-change"], candidates: ["책임이나 사람이나 스스로 정한 끝이 이어 가게 했지만 해도 달라지지 않는다고 느끼면 접는다. 이어 가는 힘이 있어도 변화를 확인할 신호가 없으면 버티기 어려울 수 있다."], notThis: "끈기 부족 · 허무주의" },
  { id: "P5.6", thread: "D5", first: ["duty"], second: ["overloaded"], candidates: ["약속이나 책임으로 이어 가다가 부담이 나에게 몰리면 접는다. 책임이 한쪽으로 몰리는 구조가 문제일 수 있고, 어디까지 맡고 무엇을 나눌지 정하는 것이 열쇠일 수 있다."], notThis: "끈기 부족 · 책임감이 약함" },
  { id: "P5.7", thread: "D5", first: ["own-standard"], second: ["overloaded"], candidates: ["끝까지 마무리하고 싶은 마음과 혼자 감당할 수 있는 부담 사이에서 부딪히기 쉽다. 책임이 한쪽으로 계속 몰리면 이어 가려는 마음이 있어도 버티기 어려워질 수 있다. 이때는 마무리의 완성도를 건드리기보다 어디까지 맡고 무엇을 나눌지 먼저 정하는 방향이 필요할 수 있다."], needs: "부담이 몰린 이유를 \"기준에 못 미쳐서\"로 읽지 않는다 — 고른 계기는 부담이 몰린 것이다. 기준 · 완성도 얘기는 이 사람의 사주에 그 근거가 있을 때만 별도로 쓴다", notThis: "완벽주의 · 기준에 못 미쳐서 중단" },
  { id: "P5.8", thread: "D5", first: ["progress", "people"], second: ["overloaded"], candidates: ["결과나 사람이 이어 가는 힘이었지만 부담이 나에게 몰리면 접는다. 이어 가는 힘이 있어도 몫이 한쪽으로 몰리면 버티기 어려울 수 있다."], notThis: "끈기 부족" },
];

// ───────────── 읽기 ─────────────

/** 한 장면의 답: 선택지 id · 거의 없었어요(x) · 맞는 선택지 없음(y) · 아직 답하지 않음(없음) */
export type SceneAnswer = OptionId | "x" | "y" | undefined;
export type ScenarioAnswers = Partial<Record<SceneId, SceneAnswer>>;

/** 고른 답 하나의 사실 — 읽기 결과는 항상 두 답을 모두 담는다(답 누락이 없다) */
export type AnsweredScene = { scene: SceneId; ask: string; tag: string; plain: string; shows: string };

export type ThreadReading =
  | { thread: ThreadId; kind: "read"; answered: [AnsweredScene, AnsweredScene]; pattern: Pattern; nuances: string[] }
  /** 두 장면 중 하나라도 선택지를 고르지 않았다 — 이 구분은 풀이에 쓰지 않는다(사용자 화면에 "자료 없음" 문장을 만들지 않는다) */
  | { thread: ThreadId; kind: "hold"; missing: SceneId[] };

export const SCENE_BY_ID: Record<SceneId, Scene> = Object.fromEntries(SCENES.map((s) => [s.id, s])) as Record<SceneId, Scene>;
export const THREAD_BY_ID: Record<ThreadId, Thread> = Object.fromEntries(THREADS.map((t) => [t.id, t])) as Record<ThreadId, Thread>;

/** 선택지 id → 그 장면의 답 하나. 거의 없었어요 · 맞는 선택지 없음 · 미응답은 undefined (점수 · 성향으로 읽지 않는다) */
export function answeredScene(scene: SceneId, answer: SceneAnswer): AnsweredScene | undefined {
  if (answer === undefined || answer === "x" || answer === "y") return undefined;
  const s = SCENE_BY_ID[scene];
  const o = s.options.find((x) => x.id === answer);
  return o ? { scene, ask: s.ask, tag: o.tag, plain: o.plain, shows: o.shows } : undefined;
}

export function tagOf(scene: SceneId, answer: SceneAnswer): string | undefined {
  return answeredScene(scene, answer)?.tag;
}

/** 구분 하나를 읽는다: 두 장면 모두 선택지를 골랐을 때만 읽는다. 읽으면 두 답의 사실 + 그 답 쌍의 해석 규칙(16쌍 모두 있다)을 돌려준다 */
export function readThread(thread: ThreadId, answers: ScenarioAnswers): ThreadReading {
  const [s1, s2] = THREAD_BY_ID[thread].scenes;
  const a1 = answeredScene(s1, answers[s1]);
  const a2 = answeredScene(s2, answers[s2]);
  const missing: SceneId[] = [];
  if (!a1) missing.push(s1);
  if (!a2) missing.push(s2);
  if (!a1 || !a2) return { thread, kind: "hold", missing };
  const pattern = PATTERNS.find((p) => p.thread === thread && p.first.includes(a1.tag) && p.second.includes(a2.tag));
  if (!pattern) throw new Error(`${thread}: ${a1.tag} × ${a2.tag}를 덮는 해석 규칙이 없다`);
  const nuances = [pattern.nuance?.[a1.tag], pattern.nuance?.[a2.tag]].filter((x): x is string => Boolean(x));
  return { thread, kind: "read", answered: [a1, a2], pattern, nuances };
}

export function readScenarios(answers: ScenarioAnswers): ThreadReading[] {
  return THREADS.map((t) => readThread(t.id, answers));
}

// ───────────── 지금 화면의 22문항 검토 ─────────────
// 판단 기준(운영자 2026-10-16): "동의형이라서"가 아니라 **다른 답과 함께 봤을 때 사주 풀이에서 무엇을 더 구체적으로 설명할 수 있는가**.
// 아래 이유는 모두 그 기준에서 쓴 것이다 — 같은 답에 이유가 갈리는데 구분이 안 된다 · 쏠리는 답이라 구분이 안 된다 · 풀이에 쓸 장면이 없다.

export type ItemJudgment = "수정" | "삭제";

export type ItemReview = {
  id: string;
  /** 지금 문장 */
  text: string;
  judgment: ItemJudgment;
  /** 판단 이유 */
  reason: string;
  /** 실제로 구분해야 하는 차이 */
  difference: string;
  /** 새 질문 — 이번 묶음의 장면 id 또는 후보 id */
  replacedBy: (SceneId | CandidateId)[];
  /** 함께 해석할 다른 문항 (새 질문 기준) */
  readWith: string;
  /** 답 조합에 따라 풀이가 달라지는 예 (해석 규칙 id) */
  comboExample: string;
};

export type CandidateId = "N1" | "N2" | "N3" | "N4";

export type CandidateOption = { id: OptionId; text: string; tag: string };

/** 이번 대표 묶음에는 넣지 않은 후보 장면 — 22문항 검토에서 "수정"한 문항의 새 질문. 읽으려면 짝 장면이 필요하고 해석 규칙은 묶음 시범 뒤에 정한다. */
export type Candidate = { id: CandidateId; from: string[]; ask: string; options: [CandidateOption, CandidateOption, CandidateOption, CandidateOption]; difference: string; pairWith: SceneId; why: string };

export const CANDIDATES: Candidate[] = [
  {
    id: "N1",
    from: ["m1", "r5"],
    ask: "여러 사람과 함께한 자리가 끝난 날 밤, 실제 모습에 가장 가까운 것은?",
    options: [
      { id: "a", text: "말없이 바로 쉬어야 해요", tag: "rest-quiet" },
      { id: "b", text: "오늘 있었던 일을 혼자 되짚어요", tag: "replay-alone" },
      { id: "c", text: "누군가와 이야기를 이어 가요", tag: "keep-talking" },
      { id: "d", text: "평소와 다르지 않아요", tag: "same-as-usual" },
    ],
    difference: "혼자 시간이 필요한 이유(쉼 · 정리 · 이어 가기)를 가른다 — 같은 '혼자 쉬는 시간'도 에너지 소모인지 생각 정리인지에 따라 풀이가 다르다.",
    pairWith: "S6",
    why: "혼자 시간이 필요한 이유는 S6(풀린 뒤 혼자 정리할 시간)과 함께 읽어야 갈린다. D3에 얹지 않고 후보로 둔다.",
  },
  {
    id: "N2",
    from: ["m2"],
    ask: "낯선 사람이 많은 자리에 도착했어요. 처음 5분 동안의 모습에 가장 가까운 것은?",
    options: [
      { id: "a", text: "먼저 말을 걸어요", tag: "greet-first" },
      { id: "b", text: "누가 말을 걸어 오기를 기다려요", tag: "wait-greeted" },
      { id: "c", text: "아는 사람 곁에 머물러요", tag: "stay-known" },
      { id: "d", text: "도울 일(준비 · 정리)을 찾아요", tag: "find-task" },
    ],
    difference: "낯선 자리의 처음 행동(말 걸기 · 기다림 · 아는 사람 · 역할 찾기)을 가른다 — '외향적인가'가 아니라 어색한 자리를 건너는 방식.",
    pairWith: "S2",
    why: "S2(역할이 없는 자리에서 하는 일)와 같은 맥락(역할이 없을 때)이라 겹치는지 시범에서 먼저 본다.",
  },
  {
    id: "N3",
    from: ["m7", "m8"],
    ask: "약속이나 일정이 갑자기 바뀌었어요. 처음 하는 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "대안을 바로 찾아 다시 짜요", tag: "replan-now" },
      { id: "b", text: "상황을 더 파악한 뒤 정해요", tag: "assess-first" },
      { id: "c", text: "그대로 흘러가게 둬요", tag: "let-it-flow" },
      { id: "d", text: "바뀐 이유와 영향을 먼저 확인해요", tag: "ask-why" },
    ],
    difference: "계획이 어긋났을 때의 첫 행동 — 같은 '그때그때 정하는 편'도 여유인지 대응 속도인지 불편해서 확인하는지가 다르다.",
    pairWith: "S1",
    why: "생활 행동 초안 L01(계획이 바뀔 때)과 같은 주제다. 그쪽과 어느 쪽을 쓸지는 운영자 결정.",
  },
  {
    id: "N4",
    from: ["t1", "t3"],
    ask: "해 보지 않은 일을 해 볼 기회가 생겼어요. 처음 하는 행동에 가장 가까운 것은?",
    options: [
      { id: "a", text: "일단 해 보겠다고 해요", tag: "try-now" },
      { id: "b", text: "알아본 뒤에 정해요", tag: "research-then-decide" },
      { id: "c", text: "아는 사람과 함께라면 해요", tag: "with-someone" },
      { id: "d", text: "한 번 지켜본 뒤 다음에 정해요", tag: "watch-first" },
    ],
    difference: "새로운 시도의 첫 행동 — '여러 번 따져봄'이 충분히 알아봄인지 미룸인지 함께 할 사람을 기다림인지가 다르다.",
    pairWith: "S2",
    why: "t1~t4(새로움 · 신중함)의 주제를 한 장면으로 합쳤다. 짝 장면과 해석 규칙은 시범 뒤에 정한다.",
  },
];

export const ITEM_REVIEWS: ItemReview[] = [
  { id: "m1", text: "여러 사람과 시간을 보낸 뒤에는 혼자 쉬는 시간이 필요하다.", judgment: "수정", reason: "같은 '혼자 시간'도 에너지가 줄어서 · 생각을 정리하려고 · 그냥 취향이라서 풀이에서 읽을 거리가 다른데, 이 답만으로는 어느 쪽인지 갈리지 않는다.", difference: "혼자 시간이 필요한 이유(쉼 · 정리 · 이어 가기)", replacedBy: ["N1"], readWith: "S6(풀린 뒤 편해지는 조건)", comboExample: "N1 '혼자 되짚어요' × S6 '혼자 정리할 시간'이면 정리 시간이 관계의 회복 조건과 겹친다. N1 '바로 쉬어야 해요' × S6 '이해받음'이면 쉼과 마음 풀림이 따로다." },
  { id: "m2", text: "처음 만난 사람과도 먼저 대화를 시작하는 편이다.", judgment: "수정", reason: "먼저 말 거는 모습만으로 사교적인지 · 어색해서 먼저 나서는지 · 역할이라서 하는지를 가를 수 없어 풀이에 쓸 장면이 나오지 않는다.", difference: "낯선 자리를 건너는 방식(말 걸기 · 기다림 · 아는 사람 · 역할 찾기)", replacedBy: ["N2"], readWith: "S2(역할이 없는 자리에서 하는 일)", comboExample: "N2 '도울 일을 찾아요' × S2 '빈 곳을 조용히 채워요'이면 일로 자리를 건너는 사람이고 말로 몫을 정하지 않는 쪽이다." },
  { id: "m3", text: "설명을 들을 때 구체적인 사례보다 전체적인 의미가 먼저 궁금하다.", judgment: "삭제", reason: "생각하는 스타일을 직접 묻는 진술이라, 리포트에서 쓸 생활 장면이 없고 풀이에서 새로 설명할 것도 없다.", difference: "일을 시작할 때 틀이 먼저인지 사례가 먼저인지 — S1이 장면으로 대신한다", replacedBy: ["S1"], readWith: "S2", comboExample: "—" },
  { id: "m4", text: "새로운 일을 배울 때 정해진 순서대로 따라 하는 것이 편하다.", judgment: "삭제", reason: "m3의 반대 방향 문항이다. 같은 구분을 두 문장으로 묻고 풀이에서 하나로 합쳐 읽어야 해서 별도 문항으로 둘 이유가 없다.", difference: "S1이 대신한다", replacedBy: ["S1"], readWith: "S2", comboExample: "—" },
  { id: "m5", text: "결정할 때 그 결정이 주변 사람에게 미칠 영향을 먼저 생각한다.", judgment: "수정", reason: "같은 '영향을 생각함'도 배려 · 갈등을 피하려는 마음 · 책임감일 수 있어 풀이에서 어느 쪽을 쓸지 정할 수 없다. 좋은 사람처럼 보이는 답이라 쏠리기도 한다.", difference: "의견이 갈릴 때 첫 반응과 풀리는 조건이 같은 방향인지", replacedBy: ["S5"], readWith: "S6", comboExample: "P3.1(말로 시작 × 이해받아야 풀림)과 P3.3(말로 시작 × 다음 합의로 풀림)은 같은 '근거부터'여도 풀이가 다르다." },
  { id: "m6", text: "의견이 다를 때는 감정보다 근거가 맞는지를 먼저 따진다.", judgment: "삭제", reason: "m5의 반대 방향으로 '논리 vs 감정' 틀에 사람을 넣는 진술이다. S5가 한 장면으로 합쳐 대신한다.", difference: "S5가 대신한다", replacedBy: ["S5"], readWith: "S6", comboExample: "—" },
  { id: "m7", text: "계획이 없어도 그때그때 정하면서 움직이는 것이 편하다.", judgment: "수정", reason: "'계획 없이 편함'이 여유인지 즉흥 선호인지 대응이 빠른 것인지 가를 수 없어 풀이의 장면이 정해지지 않는다. m8과 한 쌍으로 같은 구분을 반복한다.", difference: "계획이 어긋났을 때의 첫 행동", replacedBy: ["N3"], readWith: "S1(혼자일 때 시작 방식)", comboExample: "N3 '바로 다시 짜요' × S1 '틀 먼저'이면 짠 틀이 깨져도 바로 다시 짜는 사람이다. N3 '그대로 흘러가게 둬요' × S1 '틀 먼저'이면 틀은 세우되 변화에는 느슨한 사람이다." },
  { id: "m8", text: "약속이나 일정은 미리 정해 두어야 마음이 놓인다.", judgment: "삭제", reason: "m7의 반대 방향이다. '마음이 놓인다'는 마음과 행동을 한 문장에 넣어 풀이에서 어느 쪽을 읽을지 정할 수 없다. N3가 대신한다.", difference: "N3이 대신한다", replacedBy: ["N3"], readWith: "S1", comboExample: "—" },
  { id: "t1", text: "가보지 않은 장소나 해보지 않은 일에 먼저 끌린다.", judgment: "수정", reason: "'끌림'은 마음이고 행동이 아니라 풀이에서 장면으로 풀 수 없다. 끌려도 하지 않는 사람 · 끌리지 않아도 하는 사람이 같은 답을 고른다.", difference: "새로운 일을 만났을 때의 첫 행동", replacedBy: ["N4"], readWith: "S2(함께일 때 몫을 잡는 방식)", comboExample: "N4 '아는 사람과 함께라면' × S2 '흐름을 보고 맞춰요'이면 새 시도의 열쇠가 함께하는 사람이다." },
  { id: "t2", text: "익숙한 방식이 있으면 굳이 바꾸고 싶지 않다.", judgment: "삭제", reason: "t1의 반대 방향이다. 익숙함을 지키는 이유(안정 · 효율 · 귀찮음)가 풀이마다 다른데 한 문장으로 묻는다. N4가 대신한다.", difference: "N4가 대신한다", replacedBy: ["N4"], readWith: "S1", comboExample: "—" },
  { id: "t3", text: "결과가 불확실한 일은 시작 전에 여러 번 따져본다.", judgment: "수정", reason: "'여러 번 따져봄'이 충분히 알아봄 · 미룸 · 책임을 의식함 중 무엇인지 가를 수 없어 풀이에서 읽을 거리가 정해지지 않는다.", difference: "불확실한 일의 첫 행동(알아봄 · 지켜봄 · 함께)", replacedBy: ["N4"], readWith: "S1", comboExample: "N4 '알아본 뒤에 정해요' × S1 '사례를 먼저 찾아봐요'이면 알아본 뒤 움직이는 일관된 방식이다. N4 '한 번 지켜봐요' × S1 '필요할 때 몰아서'이면 시작이 늦어지는 방식이 같은 방향이다." },
  { id: "t4", text: "일단 시작하고 문제가 생기면 그때 고치는 편이다.", judgment: "삭제", reason: "t3의 반대 방향이다. N4와 S1이 대신한다.", difference: "N4 · S1이 대신한다", replacedBy: ["N4", "S1"], readWith: "S2", comboExample: "—" },
  { id: "t5", text: "다른 사람의 칭찬이나 반응이 의욕에 큰 영향을 준다.", judgment: "수정", reason: "인정이 필요해서 · 피드백으로 방향을 잡으려고 · 관계가 중요해서 같은 답이 나와 풀이에서 읽을 거리가 갈린다. 칭찬에 약한 사람처럼 보여 답을 피하기도 한다.", difference: "이어 가는 힘의 출처(사람 · 결과 · 책임 · 내 기준)", replacedBy: ["S9"], readWith: "S10", comboExample: "P5.2(사람이 이어 가게 함 × 환경이 바뀌어 접음)는 반응이 의욕을 좌우하는 모습을 사람의 의지가 아니라 함께하는 조건과 함께 읽는다." },
  { id: "t6", text: "다른 사람이 어떻게 생각하든 내 판단대로 하는 편이다.", judgment: "삭제", reason: "t5의 반대 방향이고 '독립적인 사람'으로 보이고 싶은 답이 쏠린다. S9의 '내 기준' 선택지가 대신한다.", difference: "S9가 대신한다", replacedBy: ["S9"], readWith: "S10", comboExample: "—" },
  { id: "t7", text: "결과가 바로 보이지 않아도 시작한 일은 끝까지 해본다.", judgment: "수정", reason: "'끝까지 함'이 책임 · 결과 · 사람 · 내 기준 중 무엇 때문인지 가를 수 없어 풀이를 정할 수 없고, 성실한 사람으로 보이고 싶은 답이 쏠린다.", difference: "이어 가는 힘의 출처", replacedBy: ["S9"], readWith: "S10", comboExample: "P5.6(책임으로 이어 가다 부담이 몰려 접음)과 P5.4(결과가 보여야 이어 가고 안 보이면 접음)는 같은 '끝까지'여도 풀이가 다르다." },
  { id: "t8", text: "흥미가 떨어지면 하던 일을 멈추고 다른 일로 넘어간다.", judgment: "수정", reason: "'다른 일로 넘어감'이 끌림 · 몰린 부담 · 환경 변화 중 무엇인지 가를 수 없어 풀이를 정할 수 없고, 변덕스러운 사람처럼 보여 피하는 답이다.", difference: "하던 일을 접는 계기(끌림 · 몰린 부담 · 환경 변화)", replacedBy: ["S10"], readWith: "S9", comboExample: "P5.1(접는 계기가 더 끌리는 일)은 변덕으로 읽지 않고 마무리 방식의 문제로 읽는다." },
  { id: "r1", text: "연락이 평소보다 늦으면 이유가 계속 신경 쓰인다.", judgment: "수정", reason: "질문이 결론이다 — '불안한가요 → 네 → 불안한 사람'. 같은 '신경 쓰임'도 확인하고 싶은 마음 · 책임감 · 기대의 크기에 따라 풀이에서 읽을 거리가 다르다. 신경 쓰이지 않는 답은 독립 · 안정으로 잘못 연결된다.", difference: "그날 실제로 한 행동과, 서운할 때 마음이 어디로 나가는지", replacedBy: ["S7"], readWith: "S8", comboExample: "P4.1(평소처럼 × 말로 꺼냄)과 P4.3(평소처럼 × 기대를 낮춤)은 같은 담담함인데 읽을 거리가 다르다 — 이유는 확정하지 않고 두 방식이 함께 있다는 사실에서 시작한다." },
  { id: "r2", text: "상대가 나만큼 이 관계를 중요하게 여기는지 걱정될 때가 있다.", judgment: "수정", reason: "운영 규칙상 '우선 확인' 문항이다. '걱정'이라는 마음을 직접 묻고 상대의 마음을 가정하게 하며, 해당 없음으로 도망가기 쉬워 풀이에 쓸 장면이 나오지 않는다.", difference: "서운함이 말 · 기다림 · 기대 접기 · 행동 중 어디로 나가는지", replacedBy: ["S8"], readWith: "S7", comboExample: "P4.8(신경이 쓰임 × 알아채 주기를 기다림 · 행동으로 보임)은 마음이 상대에게 닿지 않을 때 서운함이 커지는 모습으로 읽는다." },
  { id: "r3", text: "관계에서 작은 오해가 생겨도 크게 불안하지 않다.", judgment: "삭제", reason: "'불안하지 않다 = 안정'으로 이어지는 문항이다. 불안하지 않은 이유(믿음 · 낮은 기대 · 관심 없음)를 가르지 못하고 풀이에서 읽을 거리를 만들지 못하며, 좋게 보이는 답이 쏠린다.", difference: "S5 · S6 · S7이 대신한다", replacedBy: ["S5", "S6", "S7"], readWith: "S8", comboExample: "—" },
  { id: "r4", text: "가까운 사람에게도 속마음을 털어놓기가 어렵다.", judgment: "수정", reason: "운영 규칙상 '우선 확인' 문항이다. '어렵다'를 인정하는 답은 약점을 말하는 느낌이고 '말할 사람이 없음'과 '말하지 않는 편'이 섞여 풀이를 정할 수 없다.", difference: "마음이 힘들 때 말하게 되는 때(먼저 물어 줌 · 정리한 뒤 · 바로 · 혼자)", replacedBy: ["S4"], readWith: "S3", comboExample: "P2.2(일은 나눔 × 마음은 정리한 뒤·혼자)와 P2.4(일도 마음도 정리된 뒤)는 같은 '속마음을 말하기 어려움'이어도 풀이가 다르다." },
  { id: "r5", text: "관계가 깊어질수록 혼자만의 시간이 더 필요해진다.", judgment: "수정", reason: "'혼자 시간'이 거리 두기인지 회복인지 정리인지 가를 수 없어 풀이에서 읽을 거리가 정해지지 않는다. 관계가 깊어질수록이라는 가정도 깔려 있다.", difference: "혼자 시간이 필요한 이유", replacedBy: ["N1", "S6"], readWith: "S5", comboExample: "P3.5(말로 시작 × 혼자 정리할 시간)와 P3.6(물러남 × 혼자 정리할 시간)이면 거리 두기가 아니라 정리 시간을 확보하는 방식으로 읽고, 각자 다른 보완을 쓴다." },
  { id: "r6", text: "힘들 때 가까운 사람에게 기대는 것이 편하다.", judgment: "수정", reason: "'기대는 것이 편함'이 일을 맡기는 것인지 마음을 말하는 것인지 가를 수 없어 풀이를 정할 수 없고, 의존적이라는 느낌 때문에 답이 갈린다.", difference: "일에서의 도움과 마음에서의 도움이 같은지 다른지", replacedBy: ["S3", "S4"], readWith: "S3 × S4", comboExample: "P2.1(일도 마음도 열려 있음)과 P2.3(일은 직접 · 마음은 나눔)은 같은 '기대는 것이 편함'이어도 풀이가 다르다." },
];

// ───────────── 글자 겹침(참고값) ─────────────

/** 두 글이 얼마나 같은 글자 조각을 쓰는지(글자 4개 조각 기준 겹침, 0~1) — 참고값일 뿐 어떤 해석이 어떤 근거 때문에 달라졌는지를 대신하지 않는다 */
export function textOverlap(a: string, b: string, n = 4): number {
  const grams = (s: string) => {
    const t = s.replace(/[^\p{L}\p{N}]/gu, "");
    const out = new Set<string>();
    for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}
