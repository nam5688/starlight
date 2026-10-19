import { MiyuAvatar } from "@/components/talk/miyu-character";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { applyAction, startRoom, type TalkMood } from "@/lib/report/reading/talk-room";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";
import { SAMPLE_TYPE_TITLE } from "@/lib/samples/sample-report";

/**
 * 홈의 미유 예시 대화창(운영자 방향 2026-10-16: 미유 캐릭터 · 말풍선을 살리고, 인사와 실제 풀이 예시를 한 덩어리로. 2026-10-17부터는 첫 화면 바로 아래 "미유가 이렇게 풀어줘요" 구역에 둔다 — `sample-chat-section.tsx`).
 * 말풍선은 **대화 엔진이 만든 말**(가상 인물 서윤의 예시 리포트에 저장된 글 + 고정 문구)을 그대로 보여 준다 —
 * 미유가 먼저 분석을 풀어 주고(핵심 한 줄) → 궁금한 묶음을 고르면(연애 · 관계) → 그 풀이를 이어 준다. 새로 쓴 글이나 실제 이용 후기가 아니다.
 * 자유 질문에 AI가 답한 글은 실제 AI의 답이 아니면 지어 쓰지 않으므로 이 예시에 넣지 않았다(자유 질문은 채팅방에서 이어진다).
 * 아래 답장 모양은 누르는 버튼이 아니라 "이런 묶음을 고를 수 있다"는 그림이다.
 */
type Bubble = { from: "me"; text: string } | { from: "miyu"; mood: TalkMood; headline?: string; paragraphs: string[] };

function exampleBubbles(): { bubbles: Bubble[]; chips: string[] } {
  const model = buildTalkModel(sampleReadingReport, { typeTitle: SAMPLE_TYPE_TITLE });
  const start = startRoom(model, "main");
  const intro = start.lines.find((l) => l.from === "miyu" && l.say.kind === "text");
  const picked = applyAction(model, "main", start, { t: "group", id: "relation" });
  // 인사는 첫 화면(hero-start.tsx)에 이미 있으므로 이 예시는 분석을 풀어 주는 말에서 시작한다
  const bubbles: Bubble[] = [];
  if (intro && intro.from === "miyu" && intro.say.kind === "text") {
    bubbles.push({ from: "miyu", mood: "happy", paragraphs: [intro.say.text] });
    bubbles.push({ from: "miyu", mood: "happy", headline: sampleReadingReport.headline, paragraphs: [] });
  }
  for (const l of picked.added) {
    if (l.from === "me") bubbles.push({ from: "me", text: l.text });
    else if (l.say.kind === "answer") bubbles.push({ from: "miyu", mood: l.mood, headline: l.say.headline, paragraphs: l.say.paragraphs });
  }
  return { bubbles, chips: model.groups.map((g) => g.chip) };
}

export function HeroChat() {
  const { bubbles, chips } = exampleBubbles();
  return (
    <div className="rounded-3xl bg-mist p-4 shadow-soft md:p-5" role="group" aria-label="미유와 나누는 대화 예시">
      <div className="mb-3 flex items-center gap-3">
        <MiyuAvatar className="size-12" />
        <div>
          <p className="text-[16px] leading-tight font-bold">미유</p>
          <p className="text-[12px] leading-[1.5] text-ink-3">가상 인물 서윤의 서비스 예시</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {bubbles.map((b, i) => {
          if (b.from === "me") {
            return (
              <li key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-[1.6] text-accent-strong">{b.text}</p>
              </li>
            );
          }
          const prev = bubbles[i - 1];
          const first = !(prev && prev.from === "miyu");
          return (
            <li key={i} className="flex items-end gap-2">
              {first ? <MiyuAvatar className="size-8" /> : <span aria-hidden="true" className="size-8 shrink-0" />}
              <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-canvas px-3.5 py-2.5 shadow-soft">
                {b.headline && <p className="text-[15px] leading-[1.55] font-bold">{b.headline}</p>}
                {b.paragraphs.map((t) => (
                  <p key={t} className={`text-[15px] leading-[1.65] ${b.headline ? "mt-1.5" : ""}`}>
                    {t}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 pl-10 text-[12px] leading-[1.5] text-ink-3" aria-hidden="true">
        이어서 궁금한 이야기를 고를 수 있어요
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2 pl-10" aria-hidden="true">
        {chips.map((t) => (
          <li key={t} className="rounded-full bg-accent-soft px-3.5 py-2 text-[14px] font-semibold text-accent-strong">
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12px] leading-[1.6] text-ink-3">미유가 먼저 풀어주고, 궁금한 부분은 이어서 물어보세요. 전체 분석은 리포트로도 확인할 수 있어요. 풀이 글은 가상 인물의 예시 리포트에 있는 글이고, 실제 이용 후기가 아니에요.</p>
    </div>
  );
}
