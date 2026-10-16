import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon } from "@/components/ui/icons";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { applyAction, ROOM_COPY, startRoom, type TalkLine } from "@/lib/report/reading/talk-room";
import { sampleReport } from "@/lib/samples/sample-report";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";

/**
 * 홈의 대화 예시 — 연애 방에서 "썸 타는 중이에요"를 고른 장면. 대화 엔진이 만든 말(저장된 예시 리포트의 글 + 고정 문구)을 그대로 보여 주며
 * 새로 쓴 글이나 후기가 아니다. 여기의 버튼 모양은 누르는 버튼이 아니라 "이런 답장이 있다"는 그림이라 예시 방으로 가는 링크를 따로 둔다.
 */
function exampleLines(): TalkLine[] {
  const model = buildTalkModel(sampleReadingReport, { tendencyName: sampleReport.tendency.name });
  const start = startRoom(model, "love");
  const picked = applyAction(model, "love", start, { t: "intake", option: "some" });
  return [...start.lines, ...picked.added].filter((l) => !(l.from === "miyu" && l.say.kind === "text" && l.say.text === ROOM_COPY.intakeNote));
}

const REPLIES = ["맞아요", "상황에 따라 달라요", "잘 모르겠어요"];

export function ChatExample() {
  const lines = exampleLines();
  return (
    <div className="rounded-3xl bg-mist p-4 md:p-5" role="group" aria-label="미유와 나누는 대화 예시">
      <ol className="space-y-2.5">
        {lines.map((l, i) => {
          const prev = lines[i - 1];
          const firstOfMiyu = l.from === "miyu" && !(prev && prev.from === "miyu" && prev.say.kind !== "system");
          if (l.from === "me") {
            return (
              <li key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-[1.6] text-accent-strong">{l.text}</p>
              </li>
            );
          }
          if (l.say.kind === "system") {
            return (
              <li key={i} className="py-1 text-center">
                <p className="inline-block rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent-strong">{l.say.text}</p>
                {l.say.sub && <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-3">{l.say.sub}</p>}
              </li>
            );
          }
          const body =
            l.say.kind === "answer" ? (
              <>
                <p className="text-[15px] leading-[1.55] font-bold">{l.say.headline}</p>
                {l.say.paragraphs.map((t) => (
                  <p key={t} className="mt-1.5 text-[15px] leading-[1.65]">
                    {t}
                  </p>
                ))}
              </>
            ) : l.say.kind === "text" ? (
              <p className={l.say.muted ? "text-[13px] leading-[1.6] text-ink-3" : "text-[15px] leading-[1.65]"}>{l.say.text}</p>
            ) : null;
          if (!body) return null;
          return (
            <li key={i} className="flex items-end gap-2">
              {firstOfMiyu ? <MiyuAvatar className="size-8" mood={l.mood} /> : <span aria-hidden="true" className="size-8 shrink-0" />}
              <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-canvas px-3.5 py-2.5 shadow-soft">{body}</div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 pl-10 text-[12px] leading-[1.5] text-ink-3" aria-hidden="true">
        이어서 고를 수 있는 답장
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2 pl-10" aria-hidden="true">
        {REPLIES.map((t) => (
          <li key={t} className="rounded-full bg-accent-soft px-3.5 py-2 text-[14px] font-semibold text-accent-strong">
            {t}
          </li>
        ))}
      </ul>
      <Link href="/analyze" className="mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-strong">
        무료로 내 분석 확인하기
        <ArrowIcon className="size-4" />
      </Link>
    </div>
  );
}
