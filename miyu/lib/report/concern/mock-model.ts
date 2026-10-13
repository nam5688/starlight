// 모의 고민 리포트 작성 — 실제 AI를 부르지 않고, 받은 근거 목록과 고객이 적은 고민으로 형식에 맞는 초안을 만든다.
// 단위 테스트와 로컬 전체 흐름 검사(가짜 AI 서버)에서만 쓴다. 문장마다 "[모의 생성]" 표시가 붙으며 판매할 수 있는 글이 아니다.
// 근거의 설명 문장(cue · fact)은 옮겨 쓰지 않는다 — 본문에는 사주 용어 · 점수를 쓰지 않는 규칙(validate.ts)을 지키고, 고객이 적은 말을 받아 조립한다.

import type { Evidence } from "../evidence.ts";
import { plainPeriodLabel } from "../reading/validate.ts";
import type { ConcernDraftV1 } from "./types.ts";

type Payload = {
  concern: { topic: string; focusGuide: string; question?: string; situation?: string; excerpt?: string; previousReading?: { matched?: string; differed?: string } };
  evidence: (Evidence & { forConcern?: boolean })[];
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}` : s).trim();
const chunks = (text: string | undefined) =>
  (text ?? "")
    .split(/(?<=[.!?。])\s+|\n+|,\s*/)
    .map((s) => s.trim().replace(/[.!?。]+$/, ""))
    .filter((s) => s.length >= 6);

/** 사용자 메시지(buildConcernUserMessage 형식)에서 근거 목록 · 고민을 꺼내 형식에 맞는 초안을 만든다 */
export function composeMockConcernDraft(userMessage: string): ConcernDraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as Payload;
  const { concern } = payload;
  const usable = payload.evidence.filter((e) => !e.uncertain && !e.period);
  // 고민에 맞는 근거를 먼저, 그다음 나머지 — 문장이 같은 근거로 반복되지 않도록 돌려 쓸 수 있는 수를 늘린다
  const first = (list: typeof usable) => [...list.filter((e) => e.forConcern), ...list.filter((e) => !e.forConcern)];
  const saju = first(usable.filter((e) => e.source === "saju"));
  const survey = first(usable.filter((e) => e.source !== "saju"));
  const s = (i: number) => saju[i % saju.length];
  const v = (i: number) => (survey.length ? survey[i % survey.length] : s(i + 1));
  const periods = [...new Map(payload.evidence.filter((e) => e.period).map((e) => [e.period!.label, e])).values()].slice(0, 2);

  const parts = [...chunks(concern.situation), ...chunks(concern.question)];
  const topicParts = [`${concern.topic}에서 결정을 앞두고 망설여질 때`, `${concern.topic} 이야기가 다시 떠오를 때`, `${concern.topic}과 관련해 마음이 흔들릴 때`];
  const situations = [...parts, ...topicParts].slice(0, Math.max(3, Math.min(5, parts.length)));
  const words = (text: string) => text.split(/\s+/).filter((w) => w.length >= 2);
  const key = (i: number) => clip(words(situations[i % situations.length]).slice(0, 4).join(" "), 30);

  // 형식 검사는 같은 문장의 반복을 막으므로, 문단마다 다른 맺음 문장을 돌려 쓴다
  const closers = ["다만 이것은 알려 주신 내용을 풀어 보는 한 가지 읽기입니다.", "이 읽기는 알려 주신 상황에서만 해당하며 다른 상황에서는 달라질 수 있습니다.", "알려 주신 말을 기준으로 한 해석이라 더 적어 주시면 달라질 수 있습니다."];
  const moods = ["하고 싶은 마음과 조심스러운 마음이 같은 시간에 올라오는 편입니다.", "처음에는 가볍게 시작하다가 결정할 때가 되면 속도가 느려지는 편입니다.", "혼자 정리할 때와 사람들 앞에서 말할 때의 속도가 다른 편입니다.", "마음은 정했는데 표현은 뒤로 미루게 되는 편입니다.", "기준이 분명할 때는 빠르고, 기준이 흐릿할 때는 오래 걸리는 편입니다."];
  const nexts = ["이번 주 안에 하나만 먼저 정해 보는", "내일 아침에 한 문장으로 먼저 적어 보는", "다음 약속 전에 기준 하나를 미리 정해 보는", "이번 달 안에 한 번 더 점검해 보는", "하루를 두고 다시 읽어 보는"];

  const headline = `[모의 생성] ${clip(concern.question || concern.topic, 24)}에 대한 해석 초안`;
  const understanding = [
    {
      text: `[모의 생성] 알려 주신 고민은 ${concern.topic} 주제이고, ${clip(concern.question || situations[0], 60)}라는 점이 중심입니다. 이 리포트는 이미 받은 개인 종합 리포트를 다시 정리하지 않고, ${concern.focusGuide}을 이번 고민의 상황에 맞춰 새로 풉니다.`,
      evidence: [s(0).id, v(0).id],
    },
  ];
  const pattern = [0, 1].map((i) => ({
    text: `[모의 생성] 사주에서 읽은 특징은, 알려 주신 "${clip(situations[i % situations.length], 40)}" 같은 상황에서 ${key(i)}을 먼저 살피게 하는 쪽으로 나타날 수 있습니다. 응답에서도 ${key(i)}과 이어지는 비슷한 경향이 보여서, 같은 고민이라도 혼자 있을 때와 사람들 앞에서 반응이 달라질 수 있습니다. ${closers[i % closers.length]}`,
    evidence: [s(i).id, v(i).id],
  }));
  const situationItems = situations.map((text, i) => ({
    situation: `[모의 생성] 알려 주신 "${clip(text, 50)}" 같은 상황`,
    reading: `[모의 생성] 이 상황에서는 사주에서 읽은 특징 때문에 ${key(i)}을 놓고 한 번 더 따져 보게 될 수 있습니다. 응답의 경향을 함께 보면, ${moods[i % moods.length]}`,
    suggestion: `[모의 생성] ${key(i)}과 관련해 지금 정할 것과 미룰 것을 따로 적어 두고, ${nexts[i % nexts.length]} 선택을 해 볼 수 있습니다.`,
    evidence: [s(i + 1).id, v(i + 1).id],
  }));
  // period 칸은 근거의 시기 이름 그대로(검사가 계산된 시기인지 본다), 본문에는 쉬운 이름을 쓴다 — 저장할 때 화면용 이름으로 바뀐다
  const timeline = periods.map((p) => {
    const plain = plainPeriodLabel(p.period!.label);
    return {
      period: p.period!.label,
      theme: `[모의 생성] ${plain}에는 ${concern.topic} 이야기가 두드러질 수 있습니다.`,
      opportunity: `[모의 생성] ${plain}에 ${key(0)}을 정리해 두면 선택이 쉬워질 수 있습니다.`,
      caution: `[모의 생성] ${plain}에는 서두르지 말고 ${key(1)}의 조건을 한 번 더 확인해 보세요.`,
      evidence: [p.id],
    };
  });
  const differences =
    survey.length && saju.length
      ? [{ text: `[모의 생성] 사주에서 읽은 특징과 응답에서 나타난 경향은 ${concern.topic} 고민에서 서로 다르게 보일 수 있습니다. 이 차이는 상황에 따라 달라지는 모습으로 읽고, 어느 한쪽이 틀렸다고 보지 않습니다.`, evidence: [s(2).id, v(2).id] }]
      : [];
  const actions = [
    { situation: `[모의 생성] 이번 주, ${key(0)} 때`, action: `[모의 생성] 이번 주 안에 ${key(0)}에서 마음에 걸리는 점을 세 줄로 적어 두고 하루 뒤에 다시 읽어 봅니다.`, evidence: [s(0).id, v(0).id] },
    { situation: `[모의 생성] 이번 달, ${key(1)} 때`, action: `[모의 생성] 이번 달에는 ${key(1)}을 정하기 전에 기준 두 가지를 먼저 정하고, 그 기준으로만 비교해 봅니다.`, evidence: [s(1).id, v(1).id] },
    { situation: `[모의 생성] ${key(2)} 때`, action: `[모의 생성] ${key(2)}이 떠오르면 바로 답하지 말고 하루를 두고, 다음 날 아침에 한 문장으로 먼저 정리해 봅니다.`, evidence: [s(2).id, v(2).id] },
    { situation: `[모의 생성] 세 달 안, ${concern.topic} 선택 앞에서`, action: `[모의 생성] 세 달 안에 한 번, 지금까지 적어 둔 기록을 보고 달라진 점을 확인하는 시간을 따로 잡습니다.`, evidence: [s(3).id, v(3).id] },
  ];

  return { headline, understanding, pattern, situations: situationItems, timeline, differences, actions };
}
