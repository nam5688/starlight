import { StatusBadge } from "@/components/ui/source-badge";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import type { FreeSummary } from "@/lib/report/types";
import { pillarsLine } from "@/lib/saju/display";
import type { SajuResult } from "@/lib/saju/engine";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "./summary-blocks";

/** 무료 요약 본문 — 검사 직후 화면과 저장된 결과 화면이 같이 쓴다 */
export function FreeSummaryBody({
  summary,
  idPrefix,
  knownMbti,
  birthText,
  region,
  saju,
}: {
  summary: FreeSummary;
  idPrefix: string;
  knownMbti: string | null;
  birthText: string;
  region: string | null;
  saju: SajuResult;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const itemCount = (moduleId: string) => ASSESSMENT_MODULES.find((m) => m.id === moduleId)?.items.length ?? 0;

  return (
    <div className="space-y-16">
      <section aria-labelledby={id("tendency")}>
        <TendencyBlock summary={summary} headingId={id("tendency")} />
      </section>

      <section aria-labelledby={id("core")}>
        <SectionTitle id={id("core")}>핵심 요약</SectionTitle>
        <CoreSummaryTable core={summary.core} />
      </section>

      <section aria-labelledby={id("scores")}>
        <SectionTitle id={id("scores")} note={SCORE_NOTE}>
          항목별 점수
        </SectionTitle>
        <ScoreGroups summary={summary} />
      </section>

      <section aria-labelledby={id("status")}>
        <SectionTitle id={id("status")} note="네 가지 관점은 각각 따로 계산하며, 사주와 심리검사 점수를 합산하지 않습니다.">
          분석에 사용한 정보
        </SectionTitle>
        <table className="w-full border-collapse text-left text-[15px]">
          <thead className="sr-only">
            <tr>
              <th scope="col">관점</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody className="border-t border-ink">
            <StatusRow name="MBTI 성향">
              개발용 예시 문항 {itemCount("mbti")}개로 계산
              {knownMbti && (
                <span className="mt-1 block text-ink-3">본인이 입력한 MBTI {knownMbti} — 참고값으로 따로 보관</span>
              )}
            </StatusRow>
            <StatusRow name="기질">개발용 예시 문항 {itemCount("temperament")}개로 계산</StatusRow>
            <StatusRow name="관계(애착)">개발용 예시 문항 {itemCount("relationship")}개로 계산</StatusRow>
            <StatusRow name="사주">
              {saju.status === "ok" ? (
                <>
                  <span className="block">{pillarsLine(saju)}</span>
                  <span className="mt-1 block text-ink-3">입력값: {birthText} · 만세력으로 계산</span>
                  {saju.notes
                    .filter((n) => n.kind !== "hour-unknown")
                    .map((n) => (
                      <span key={n.kind} className="mt-1 block text-[14px] text-ink-3">
                        {n.message}
                      </span>
                    ))}
                </>
              ) : (
                <>
                  <span className="flex flex-wrap items-center gap-2">
                    {saju.status === "invalid" ? saju.message : "만세력 계산 결과 없음"}
                    <StatusBadge>{saju.status === "invalid" ? "입력 확인" : "계산 전"}</StatusBadge>
                  </span>
                  <span className="mt-1 block text-ink-3">입력값: {birthText}</span>
                </>
              )}
            </StatusRow>
            {region && (
              <StatusRow name="활동 지역">
                {region}
                <span className="mt-1 block text-ink-3">성향 분석에 사용하지 않음 · 장소 추천용</span>
              </StatusRow>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatusRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line align-top">
      <th scope="row" className="w-28 py-4 pr-4 text-[14px] font-semibold text-ink-2 md:w-40">
        {name}
      </th>
      <td className="py-4">{children}</td>
    </tr>
  );
}
