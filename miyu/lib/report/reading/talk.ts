// 대화형 풀이(1단계) — 저장된 읽기 구조 리포트를 "주제별 짧은 풀이 + 눌러서 이어 보는 조각"으로 나눈다.
// 새 글을 쓰지 않는다(AI 호출 없음): 풀이 · 예시 · 근거는 모두 저장된 리포트의 문장 그대로이고, 대화 속 안내 문구만 이 파일의 고정 문구다.
// 자유 질문 · "내 경우는 달라"에 AI가 답하는 기능은 아직 없다(2단계, 운영자 결정 뒤) — 화면에서 "준비 중"으로 밝힌다.
// 이 파일은 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다). 화면은 components/talk/ 에 있다.
import { basisFor } from "./assemble.ts";
import type { IntegratedReadingReport, LuckSlot, ReadingBasis, ReadingBlock } from "./types.ts";

/** 대화 속 조각 — para: 문단(label은 위의 작은 이름표) · note: 작은 안내 · flow: 반응이 이어지는 모습 · comfort: 편안한 조건 / 부딪히기 쉬운 상황 */
export type TalkPiece =
  | { kind: "para"; text: string; label?: string }
  | { kind: "note"; text: string }
  | { kind: "flow"; when: string; steps: { label: string; text: string }[]; helpful: string }
  | { kind: "comfort"; comfortable: string[]; clash: string[]; note: string };

export type TalkTopic = {
  /** 블록 id · "flow"(앞으로의 시기) · "focus"(알려 주신 고민) */
  id: string;
  /** 큰 주제 번호 (리포트의 번호와 같다) */
  number: number;
  /** 고르는 버튼 이름 */
  chip: string;
  /** 풀이 위의 작은 이름표 (리포트의 주제 이름) */
  title: string;
  headline: string;
  /** 짧은 풀이 — 저장된 요약 그대로 */
  summary: string[];
  traits?: { name: string; shinesShort: string; burdenShort: string }[];
  caveat?: string;
  timeline?: { slots: LuckSlot[]; text: string; reference: { year: number; month: number } };
  /** [예를 들어줘] — 비어 있으면 버튼을 보이지 않는다 */
  example: TalkPiece[];
  /** [더 자세히 알려줘] */
  detail: TalkPiece[];
  /** [이렇게 분석한 이유] — 저장된 분석 근거 */
  basis: ReadingBasis | null;
};

export type TalkCard = {
  headline: string;
  /** 대표 경향 이름(~형, 후보 이름) — 없으면 null */
  tendency: string | null;
  /** 기질 · 성격 · 관계 경향을 짧게 정리한 줄 (주제의 결론 한 줄) */
  rows: { label: string; text: string }[];
  strength: { label: string; keyword: string; note: string };
  caution: { label: string; keyword: string; note: string };
  flow: { label: string; keyword: string; note: string };
  /** 사용한 정보의 이름 (없음은 넣지 않는다) */
  inputs: string[];
};

export type TalkModel = { name: string; card: TalkCard; topics: TalkTopic[] };

export const CARD_DISCLAIMER = "참고용 해석이며 예측이나 진단이 아닙니다.";

/** 대화 속 고정 안내 문구 — 친구에게 말하듯 짧게. 풀이 내용은 여기에 쓰지 않는다 */
export const TALK_COPY = {
  intro: (name: string) => `${name} 님의 분석을 한 장으로 정리했어요. 저장해 두고 다시 보셔도 좋아요.`,
  askTopic: "어떤 이야기부터 풀어볼까요?",
  askNext: "다음엔 뭘 해 볼까요?",
  opening: (n: number, chip: string) => `${n}번, "${chip}" 이야기부터 해 볼게요.`,
  afterExample: "이런 장면이 떠오르나요? 맞는 부분도, 아닌 부분도 있을 수 있어요.",
  afterDetail: "여기까지가 이 주제의 자세한 풀이예요.",
  basisIntro: "이 풀이는 아래 자료를 보고 썼어요. 사주 계산은 만세력 엔진이 한 값이고, 해석 규칙은 아직 검증된 사실이 아니에요.",
  differ: "맞지 않는 부분이 있을 수 있어요. 대화로 풀이를 함께 고쳐 가는 기능은 아직 준비 중이에요. 지금은 어느 부분이 어떤 상황에서 달랐는지 직접 적어 두세요. 리포트 맨 아래 ‘지금 확인해 볼 것’의 마지막 항목에 방법이 있어요.",
  concernPending: "지금 고민을 대화로 이어 가는 기능은 아직 준비 중이에요.",
  concernPendingLink: "고민을 적고 새 리포트를 받는 건 ‘나의 고민 기록소’에서 할 수 있어요.",
  allDone: "준비한 풀이를 모두 둘러봤어요. 전체 내용은 리포트에서 언제든 다시 볼 수 있어요.",
  freeQuestion: "자유롭게 질문하기",
  freeQuestionPending: "준비 중이에요. 지금은 위의 버튼으로 풀이를 이어 볼 수 있어요.",
  buttons: { example: "예를 들어줘", detail: "더 자세히 알려줘", basis: "이렇게 분석한 이유", differ: "내 경우는 달라", concern: "지금 고민 이야기하기", pickTopic: "다른 주제 고르기", fullReport: "전체 리포트 보기" },
} as const;

const CHIP: Record<string, string> = {
  tendency: "나는 어떤 사람?",
  "strength-burden": "장점과 단점이 될 수 있는 부분",
  values: "중요하게 여기는 것",
  love: "가까운 관계",
  "work-money": "일과 돈",
};

const para = (text: string, label?: string): TalkPiece => ({ kind: "para", text, ...(label ? { label } : {}) });

function blockTopic(b: ReadingBlock, number: number): TalkTopic {
  const example: TalkPiece[] = [];
  const detail: TalkPiece[] = [];
  if (b.traits) {
    for (const t of b.traits) example.push(para(t.example, t.name));
    for (const t of b.traits) detail.push(para(t.shines, `${t.name} · 장점`), para(t.burden, `${t.name} · 단점이 될 수 있는 부분`));
  } else if (b.example) example.push(para(b.example));
  if (b.reactionFlow) example.push({ kind: "flow", when: b.reactionFlow.when, steps: b.reactionFlow.steps, helpful: b.reactionFlow.helpful });
  for (const d of b.details) detail.push(para(d));
  if (b.comfort) detail.push({ kind: "comfort", comfortable: b.comfort.comfortable, clash: b.comfort.clash, note: b.comfort.note });
  if (b.reactionFlow) detail.push(para(b.reactionFlow.helpful, "이럴 때 도움이 되는 것"));
  if (b.detailExample) detail.push(para(b.detailExample, "예를 들면"));
  if (b.watch) detail.push(para(b.watch, "살펴볼 점"));
  return {
    id: b.id,
    number,
    chip: CHIP[b.id] ?? b.topic,
    title: b.topic,
    headline: b.headline,
    summary: [b.summary],
    ...(b.traits ? { traits: b.traits.map((t) => ({ name: t.name, shinesShort: t.shinesShort, burdenShort: t.burdenShort })) } : {}),
    ...(b.caveat ? { caveat: b.caveat } : {}),
    example,
    detail,
    basis: b.basis,
  };
}

export function buildTalkModel(report: IntegratedReadingReport, opts: { tendencyName?: string } = {}): TalkModel {
  const topics: TalkTopic[] = report.blocks.map((b, i) => blockTopic(b, i + 1));

  const f = report.flow;
  topics.push({
    id: "flow",
    number: report.blocks.length + 1,
    chip: f.topic,
    title: f.topic,
    headline: f.headline,
    summary: [f.summary],
    caveat: f.caveat,
    timeline: { slots: report.timeline, text: f.cardText, reference: report.timelineReference },
    example: [note(f.scenarioNote), ...f.scenarios.map((s) => para(s.then, s.when))],
    detail: [...f.years.map((y) => para(y.theme, y.year)), ...f.periods.flatMap((p) => [para(p.theme, p.period), para(p.watch, `${p.period} · 살펴볼 점`)]), note(f.statistics)],
    basis: f.basis,
  });

  if (report.focus?.length) {
    topics.push({
      id: "focus",
      number: topics.length + 1,
      chip: "알려 주신 고민",
      title: "알려 주신 고민까지 반영한 해석",
      headline: "알려 주신 고민을 반영하면",
      summary: report.focus.map((x) => x.text),
      example: [],
      detail: [],
      basis: report.generated ? basisFor(report.focus.flatMap((x) => x.evidence), report.generated.evidence) : null,
    });
  }

  const byId = new Map(report.blocks.map((b) => [b.id, b]));
  const rows = (["tendency", "love", "work-money"] as const).flatMap((id) => {
    const b = byId.get(id);
    return b ? [{ label: b.topic, text: b.headline }] : [];
  });
  const cardOf = (kind: "strength" | "caution" | "flow") => {
    const c = report.summary.find((s) => s.kind === kind);
    return { label: c?.label ?? "", keyword: c?.keyword ?? "", note: c?.note ?? "" };
  };
  const inputs = report.inputs.filter((i) => i.status !== "none").map((i) => `${i.name.replace(/\(.*\)/, "").trim()}${i.status === "dev" ? " (개발용 문항)" : ""}`);

  return {
    name: report.personName,
    card: {
      headline: report.headline,
      tendency: opts.tendencyName ?? report.base?.tendency.name ?? null,
      rows,
      strength: cardOf("strength"),
      caution: cardOf("caution"),
      flow: cardOf("flow"),
      inputs,
    },
    topics,
  };
}

function note(text: string): TalkPiece {
  return { kind: "note", text };
}

/** 다음 풀이 — 지금 주제 다음 순서에서 아직 보지 않은 첫 주제 (없으면 처음부터 다시 훑어 보지 않은 것). 모두 봤으면 null */
export function nextTopic(topics: TalkTopic[], currentId: string | null, opened: ReadonlySet<string>): TalkTopic | null {
  const start = currentId ? topics.findIndex((t) => t.id === currentId) + 1 : 0;
  const order = [...topics.slice(start), ...topics.slice(0, start)];
  return order.find((t) => !opened.has(t.id)) ?? null;
}
