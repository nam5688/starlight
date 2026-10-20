import { InfoIcon } from "@/components/ui/icons";
import type { IdentityTypeView } from "@/lib/report/identity";
import type { LuckyIndex } from "@/lib/saju/interpret/lucky";
import { LUCKY_METHOD, LUCKY_NOTE, type LuckySubId } from "@/lib/saju/interpret/lucky";

/**
 * 첫 화면의 "한눈에 기억되는 결과" 카드(운영자 확정 2026-10-17, D1 · D2) — 개인 유형명 + 럭키 지수 + 가장 강한 럭키 포인트 한 줄.
 * 이름 · 문구 · 점수는 모두 코드가 계산한 고정 값이다(AI가 쓰지 않는다). 아이콘은 이모지가 아니라 선 그림이다.
 * 유형명과 지수는 따로 스위치로 보인다(PERSONAL_TYPE · LUCKY_INDEX) — 지금은 둘 다 꺼져 있고, 이 컴포넌트는 개발용 확인 화면(/dev/identity)에서만 쓴다.
 * 점수는 성공 확률 · 정확도가 아니고 높고 낮음이 좋고 나쁨이 아니며, 예측이 아니라는 안내를 지수 옆에 항상 적는다. 사주만으로 계산하고 응답 · MBTI와 합산하지 않는다.
 */
const ICON: Record<LuckySubId, string> = {
  // 사람 둘이 이어진 선 · 갈라지는 길 · 동전 · 다시 일어서는 화살표
  people: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5m1-4.7c.7-.2 1.4-.3 2-.3 3 0 5 2 5 5",
  chance: "M12 3v6m0 0-3-3m3 3 3-3M5 21c0-5 3-8 7-8s7 3 7 8M12 13v3",
  wealth: "M12 4c-4 0-7 1.6-7 3.5S8 11 12 11s7-1.6 7-3.5S16 4 12 4Zm-7 3.5v4C5 13.4 8 15 12 15s7-1.6 7-3.5v-4M5 11.5v4C5 17.4 8 19 12 19s7-1.6 7-3.5v-4",
  recovery: "M4 14c0-4 3-7 7-7h6m0 0-3-3m3 3-3 3M20 12c0 4-3 7-7 7H7m0 0 3 3m-3-3 3-3",
};

function SubIcon({ id }: { id: LuckySubId }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0 text-accent" aria-hidden>
      <path d={ICON[id]} />
    </svg>
  );
}

/** 로그인 전 미리보기는 유형만 보내므로 lucky가 null일 수 있다 — 그때는 지수 칸을 그리지 않는다 */
export function IdentityCard({
  identity,
  showType,
  showLucky,
  idPrefix = "id-",
  inline = false,
}: {
  identity: { type: IdentityTypeView; lucky: LuckyIndex | null };
  showType: boolean;
  showLucky: boolean;
  idPrefix?: string;
  /** 이미 여백이 있는 틀 안(로그인 전 미리보기)에서는 바깥 여백을 더하지 않는다 */
  inline?: boolean;
}) {
  const { type, lucky } = identity;
  const id = (n: string) => `${idPrefix}${n}`;
  const luckyShown = showLucky && lucky !== null;
  if (!showType && !luckyShown) return null;
  return (
    <section aria-labelledby={id("title")} data-testid="identity-card" className={inline ? "w-full" : "mx-auto w-full max-w-[720px] px-5 pt-5"}>
      <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        {showType && (
          <div>
            <h2 id={id("title")} className="text-[13px] font-semibold text-accent">
              나의 유형
            </h2>
            <p className="mt-1 text-[26px] leading-tight font-bold tracking-tight md:text-[30px]">{type.name}</p>
            <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{type.line}</p>
            {(type.strength || type.burden) && (
              <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {type.strength && (
                  <div className="rounded-xl bg-positive-soft px-3.5 py-3">
                    <dt className="text-[13px] font-semibold text-positive">잘 쓰일 때</dt>
                    <dd className="mt-1 text-[14px] leading-[1.65]">{type.strength}</dd>
                  </div>
                )}
                {type.burden && (
                  <div className="rounded-xl bg-caution-soft px-3.5 py-3">
                    <dt className="text-[13px] font-semibold text-caution">조절이 필요할 때</dt>
                    <dd className="mt-1 text-[14px] leading-[1.65]">{type.burden}</dd>
                  </div>
                )}
              </dl>
            )}
            <p className="mt-3 text-[12.5px] leading-[1.6] text-ink-3">{type.note}</p>
          </div>
        )}

        {luckyShown && (
          <div className={showType ? "mt-6 border-t border-line pt-5" : ""}>
            <h2 id={showType ? undefined : id("title")} className="text-[13px] font-semibold text-accent">
              ME:U 럭키 지수
            </h2>
            <div className="mt-1 flex items-end gap-2">
              <p className="text-[40px] leading-none font-bold tracking-tight md:text-[46px]" aria-label={`럭키 지수 ${lucky!.total}점`}>
                {lucky.total}
              </p>
              <p className="pb-1 text-[14px] text-ink-3">/ 100 · 재미 · 참고용</p>
            </div>
            <p className="mt-2 text-[16px] leading-relaxed">{lucky.strongest ? lucky.strongest.line : (lucky.fallbackLine ?? lucky.totalText)}</p>
            {lucky.strongest && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{lucky.totalText}</p>}

            <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="하위 지수">
              {lucky.subs.map((s) => (
                <li key={s.id} className="rounded-xl bg-mist px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <SubIcon id={s.id} />
                    <span className="text-[14px] font-semibold">{s.name}</span>
                    <span className="ml-auto text-[16px] font-bold tabular-nums">{s.score}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-track" role="img" aria-label={`${s.name} ${s.score}점`}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${s.score}%` }} />
                  </div>
                  <p className="mt-2 text-[13px] leading-[1.6] text-ink-2">{s.text}</p>
                </li>
              ))}
            </ul>

            {lucky.caveat && <p className="mt-3 text-[13px] leading-[1.6] text-caution">{lucky.caveat}</p>}
            <p className="mt-3 flex gap-1.5 text-[12.5px] leading-[1.6] text-ink-3">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{LUCKY_NOTE}</span>
            </p>
            <details data-fold className="mt-2 text-[13px] text-ink-2">
              <summary className="cursor-pointer font-semibold text-accent">이 지수는 이렇게 계산했어요</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-[1.65]">
                {LUCKY_METHOD.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
