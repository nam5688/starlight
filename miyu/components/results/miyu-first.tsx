import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon } from "@/components/ui/icons";

/**
 * 무료 분석을 마친 직후 결과 화면 맨 위의 두 선택(운영자 방향 2026-10-16): 미유가 먼저 말풍선으로 풀어 주는 길과, 바로 전체 리포트를 읽는 길.
 * 대화를 끝까지 눌러야만 리포트를 볼 수 있게 하지 않는다 — 먼저 설명해 주는 경험을 앞에 두되 바로 읽고 싶은 사람도 고를 수 있다.
 * 기본 풀이를 말풍선으로 읽는 것은 저장된 리포트의 글을 나눠 보여 주는 것이라 질문을 차감하지 않는다. 질문 수는 직접 적어 보내는 질문에만 쓰인다.
 */
export function MiyuFirst({ talkHref, reportHref }: { talkHref: string; reportHref: string }) {
  return (
    <section aria-labelledby="r-miyu-first" className="mx-auto w-full max-w-[720px] px-5 pt-5">
      <div className="rounded-2xl bg-accent-soft p-4 ring-1 ring-accent/25 md:p-5">
        <div className="flex items-center gap-3">
          <MiyuAvatar className="size-12" mood="wave" />
          <p id="r-miyu-first" className="rounded-2xl rounded-tl-md bg-canvas px-3.5 py-2.5 text-[15px] leading-[1.6] shadow-soft">
            분석이 끝났어요. 제가 먼저 쉽게 풀어드릴까요?
          </p>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <Link href={talkHref} className="flex min-h-14 flex-col justify-center rounded-xl bg-accent px-4 py-2.5 text-white transition-colors hover:bg-accent-strong">
            <span className="flex items-center justify-between gap-2 text-[16px] font-semibold">
              미유가 풀어드려요
              <ArrowIcon className="size-4 shrink-0" />
            </span>
            <span className="mt-0.5 text-[13px] leading-[1.45] text-white/85">핵심을 짧은 말풍선으로 하나씩 설명해요</span>
          </Link>
          <a href={reportHref} className="flex min-h-14 flex-col justify-center rounded-xl border border-line-strong bg-canvas px-4 py-2.5 transition-colors hover:bg-mist">
            <span className="text-[16px] font-semibold">전체 리포트 읽기</span>
            <span className="mt-0.5 text-[13px] leading-[1.45] text-ink-2">같은 분석을 한 번에 이어서 읽어요</span>
          </a>
        </div>
      </div>
    </section>
  );
}
