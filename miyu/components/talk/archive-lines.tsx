import { Prose } from "@/components/report/reading-parts";
import type { TranscriptLine } from "@/lib/report/reading/talk-transcript";
import { MiyuAvatar } from "./miyu-character";
import type { MiyuTone } from "./miyu-moods";

/**
 * 삭제한 기록의 읽기용 대화 — 리포트를 삭제하기 전에 이 채팅방에 이미 표시된 말(내가 한 말 · 미유가 한 말)을 그대로 보여 준다.
 * 새로 만든 글이 아니고, 리포트 전체가 아니라 대화 중에 열어 본 부분만이다. 읽기만 되고 눌러서 이어 가는 버튼은 없다.
 */
export function ArchivedLines({ lines, tone, divider = true }: { lines: TranscriptLine[]; tone: MiyuTone; /** 아래에 "여기부터 새 대화" 구분선을 둔다(대화를 이어 갈 수 있는 방에서만) */ divider?: boolean }) {
  return (
    <section aria-label="이전 대화 (리포트 삭제 전, 읽기 전용)" data-testid="talk-archive" className="mb-2">
      <p className="mx-auto mb-3 max-w-[30rem] rounded-xl bg-mist px-3.5 py-2 text-center text-[13px] leading-[1.6] text-ink-2">
        이전 대화예요. 리포트를 삭제하기 전에 이 채팅방에 이미 표시된 말만 남아 있고, 읽기만 할 수 있어요.
      </p>
      {lines.map((l, i) => {
        const prev = lines[i - 1];
        const gap = i === 0 ? "" : prev && prev.from === l.from && !l.system && !prev.system ? "mt-1.5" : "mt-4";
        if (l.system) {
          return (
            <div key={i} className={`py-1 text-center ${gap}`}>
              <p className="inline-flex items-center rounded-full bg-accent-soft px-3.5 py-1.5 text-[14px] font-semibold text-accent-strong">{l.text}</p>
            </div>
          );
        }
        if (l.from === "me") {
          return (
            <div key={i} className={`flex justify-end ${gap}`}>
              <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-[1.5] font-medium text-ink">{l.text}</p>
            </div>
          );
        }
        const first = !prev || prev.from !== "miyu" || Boolean(prev.system);
        return (
          <div key={i} className={`flex items-start gap-2 ${gap}`}>
            <div className="w-9 shrink-0">{first && <MiyuAvatar className="size-9" tone={tone} />}</div>
            <div className="min-w-0 flex-1">
              <div className="inline-block max-w-full rounded-2xl rounded-tl-md bg-canvas px-3.5 py-2.5 chat-frame:max-w-[36rem]">
                {l.label && <p className="mb-0.5 text-[13px] font-semibold text-accent-strong">{l.label}</p>}
                <Prose text={l.text} className="text-[16px] leading-[1.6]" />
              </div>
            </div>
          </div>
        );
      })}
      {divider && (
        <div className="my-4 flex items-center gap-3 text-[13px] text-ink-3" role="separator" aria-label="여기부터 새 대화">
          <span className="h-px flex-1 bg-line" />
          <span>여기부터 새 대화</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </section>
  );
}
