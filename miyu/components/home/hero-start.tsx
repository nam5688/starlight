import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon, PairIcon, PersonIcon } from "@/components/ui/icons";
import { pageWide } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { SCENE_IDS } from "@/lib/assessment/situational/reading";
import { ASSESSMENT, formatKrw, FREE_ANALYSIS_TIME, PERSONAL_REPORT } from "@/lib/config/product";
import type { TalkMood } from "@/lib/report/reading/talk-room";

/**
 * 홈의 첫 화면(운영자 결정 2026-10-17): 방문한 사람이 "우리 궁합 보기"와 "내 사주 보기" 중 바로 고르게 하고,
 * 그 위에 미유 캐릭터와 짧은 말풍선 대화를 둔다. 가운데 정렬의 한 줄기 구성이다.
 *
 * - 말풍선은 **화면 구성 예시**다 — 실제 AI가 쓴 글이 아니고 이 화면에 적어 둔 고정 문구이며, 작은 안내로 그렇게 밝힌다.
 * - 리포트 궁합은 아직 판매하지 않으므로 말풍선도 "준비 중"이라고만 말한다. 지금 볼 수 있는 것은 간단 궁합뿐이다.
 * - 후기 · 이용자 수 · 정확도 · 검증됨 같은 말은 쓰지 않는다. 정직 안내 한 줄과 분석 방법 링크는 그대로 둔다.
 * - 움직임은 `motion-safe:`로만 걸어 모션을 줄이는 설정이면 멈춘다(말풍선이 차례로 떠오르는 것뿐).
 */
// 지금 화면이 묻는 문항 수 — 상황형 28문항(장면 28개) 또는 예전 22문항
const QUESTION_COUNT = ASSESSMENT.active === "situational-28" ? SCENE_IDS.length : ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);

type Bubble = { from: "me"; text: string } | { from: "miyu"; mood: TalkMood; text: string };

/** 화면 구성 예시 문구 (운영자가 정한 문장 그대로 — 바꿀 때는 리포트 궁합이 열렸는지 먼저 확인한다) */
const BUBBLES: Bubble[] = [
  { from: "miyu", mood: "wave", text: "안녕하세요, 미유예요." },
  { from: "miyu", mood: "wave", text: "같은 사주라도 사람마다 다르게 나타나요. 어떤 부분에서 잘해왔고, 왜 힘들었을지 쉽게 풀어드릴게요." },
  { from: "me", text: "우리 궁합도 볼 수 있어요?" },
  { from: "miyu", mood: "happy", text: "물론이죠. 생년월일만 알면 간단 궁합은 지금 바로 볼 수 있어요. 둘의 성향까지 함께 읽는 리포트 궁합은 준비 중이에요." },
];

const CHOICE =
  "group flex h-full min-h-[88px] flex-col rounded-2xl border border-line-strong bg-canvas p-4 text-left shadow-soft transition-colors hover:border-accent hover:bg-accent-soft/40 focus-visible:outline-offset-4";

function Choice({ href, icon, title, note }: { href: string; icon: React.ReactNode; title: string; note: string }) {
  return (
    <Link href={href} className={CHOICE}>
      <span className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent-strong">{icon}</span>
        <ArrowIcon className="size-4 text-ink-3 transition-transform group-hover:text-accent motion-safe:group-hover:translate-x-0.5" />
      </span>
      <span className="mt-3 block text-[17px] leading-snug font-bold">{title}</span>
      <span className="mt-1 block text-[13px] leading-[1.5] text-balance text-ink-2">{note}</span>
    </Link>
  );
}

export function HeroStart() {
  return (
    <section aria-labelledby="home-title" className={`${pageWide} pt-6 pb-10 md:pt-10 md:pb-14`}>
      <div className="mx-auto max-w-[34rem] text-center">
        <p className="text-[14px] font-semibold tracking-wide text-accent">사주 × 성향 × 대화</p>
        <h1 id="home-title" className="mt-3 text-[30px] leading-[1.3] font-bold tracking-tight min-[375px]:text-[33px] md:text-[48px] md:leading-[1.25]">
          내 사주부터
          <br />
          우리 궁합까지,
          <br />
          미유가 풀어줄게요.
        </h1>
        <p className="mx-auto mt-4 max-w-[28rem] text-[16px] leading-[1.7] text-balance text-ink-2 md:text-[18px]">
          성격·기질·애착과 MBTI까지 함께 읽고, 궁금한 이야기는 채팅으로 이어가요.
        </p>

        {/* 미유와 짧은 대화 — 화면 구성 예시 */}
        <div className="mt-6 rounded-3xl bg-mist p-4 text-left shadow-soft md:mt-7 md:p-5" role="group" aria-label="미유와 나누는 대화 예시">
          <ol className="space-y-2.5">
            {BUBBLES.map((b, i) => {
              const delay = { animationDelay: `${i * 160}ms` };
              if (b.from === "me") {
                return (
                  <li key={i} className="flex justify-end motion-safe:animate-miyu-in" style={delay}>
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-[1.6] text-accent-strong md:text-[16px]">{b.text}</p>
                  </li>
                );
              }
              const prev = BUBBLES[i - 1];
              const first = !(prev && prev.from === "miyu");
              return (
                <li key={i} className="flex items-end gap-2 motion-safe:animate-miyu-in" style={delay}>
                  {first ? <MiyuAvatar className="size-10" /> : <span aria-hidden="true" className="size-10 shrink-0" />}
                  <p className="max-w-[calc(100%-3rem)] rounded-2xl rounded-bl-md bg-canvas px-3.5 py-2.5 text-[15px] leading-[1.65] shadow-soft md:text-[16px]">{b.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-2 text-[12px] leading-[1.6] text-ink-3">가상 인물의 화면 구성 예시 · 실제 AI 대화 출력이 아니에요</p>

        {/* 바로 고르기 */}
        <div className="mt-5 grid gap-3 min-[350px]:grid-cols-2">
          <Choice href="/compat" icon={<PairIcon />} title="우리 궁합 보기" note="무료 · 궁합 지수 · 사이에 맞춘 풀이" />
          <Choice href="/analyze" icon={<PersonIcon />} title="내 사주 보기" note="무료 · 약 7분" />
        </div>

        <p className="mt-5 text-[14px] leading-[1.65] text-balance text-ink-2">
          {FREE_ANALYSIS_TIME} · 문항 {QUESTION_COUNT}개 · 무료 미리보기 · {PERSONAL_REPORT.name}{" "}
          <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span> · 단건 구매
        </p>
        <p className="mt-2">
          <Link href="/report/sample" className="inline-flex items-center gap-1 text-[14px] font-semibold text-accent underline underline-offset-4 hover:text-accent-strong">
            무료 · 심층 리포트 예시 보기
            <ArrowIcon className="size-4" />
          </Link>
        </p>
        <p className="mt-3 text-[12px] leading-[1.65] text-ink-3">
          성격 · 기질 · 애착은 미유가 직접 만든 질문에 답한 내용이고, MBTI는 아는 유형을 입력해요. 공식 검사나 진단이 아니며 정확도는 검증하지 않았어요.{" "}
          <a href="#home-method" className="underline underline-offset-2 hover:text-ink">
            분석 방법과 한계 보기
          </a>
        </p>
      </div>
    </section>
  );
}
