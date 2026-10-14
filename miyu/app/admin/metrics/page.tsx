import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { pageWide, textLink } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import { getMetrics, type Metrics } from "@/lib/services/metrics-service";
import { getAdminMember } from "@/server/member";
import { now, writeRepository } from "@/server/services";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = { title: "지표 · 관리자 · ME:U 미유", robots: { index: false, follow: false } };

const RANGES = [7, 30, 90];
const krw = (n: number | null) => (n === null ? "-" : `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`);

export default function MetricsPage({ searchParams }: PageProps<"/admin/metrics">) {
  return (
    <main className={`${pageWide} py-10 md:py-14`}>
      <p className="text-[14px]">
        <Link href="/admin" className={textLink}>
          관리자
        </Link>
      </p>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight">사업 지표</h1>
      <Suspense fallback={<PageFallback text="집계하고 있어요." className="mt-6" />}>
        <MetricsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MetricsContent({ searchParams }: Pick<PageProps<"/admin/metrics">, "searchParams">) {
  await connection();
  if (!(await getAdminMember())) notFound();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : 30;
  const m = await getMetrics(writeRepository(), now(), days);

  return (
    <div className="mt-6 space-y-10">
      <p className="text-[14px] leading-relaxed text-ink-3">
        매출 · 결제 · 리포트는 서버가 승인을 확인한 기록 기준이고, 방문 단계는 화면에서 보낸 참고 기록입니다 (광고 차단 · 쿠키 거부로 빠질 수 있어요). 이름 · 생년월일 · 응답 · 고민 · 리포트 내용은 이 집계에 없습니다.
      </p>
      <nav aria-label="기간" className="flex gap-2 text-[14px]">
        {RANGES.map((d) => (
          <Link key={d} href={`/admin/metrics?days=${d}`} aria-current={d === days ? "page" : undefined} className={`rounded-lg border px-4 py-2 font-semibold ${d === days ? "border-accent bg-accent text-white" : "border-line-strong hover:bg-mist"}`}>
            최근 {d}일
          </Link>
        ))}
      </nav>
      {!m.hasVisitData && (
        <p role="status" className="rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2">
          방문 기록이 아직 없습니다. 8번 DB 변경(20261018000000_funnel_feedback.sql)을 실행하면 방문 · 검사 단계 기록이 쌓이기 시작합니다. 결제 · 리포트 숫자는 지금도 정확합니다.
        </p>
      )}

      <Funnel m={m} />
      <Revenue m={m} />
      <Sources m={m} />
      <Quality m={m} />
    </div>
  );
}

function Funnel({ m }: { m: Metrics }) {
  const top = m.funnel[0]?.count || 0;
  return (
    <section aria-labelledby="m-funnel">
      <h2 id="m-funnel" className="text-[18px] font-bold">
        단계별 흐름
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-y border-line text-[13px] text-ink-3">
              <th scope="col" className="py-2 pr-3 font-medium">
                단계
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                수
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                유입 대비
              </th>
              <th scope="col" className="py-2 font-medium">
                기준
              </th>
            </tr>
          </thead>
          <tbody>
            {m.funnel.map((f) => (
              <tr key={f.key} className="border-b border-line align-top">
                <th scope="row" className="py-2.5 pr-3 font-normal">
                  {f.label}
                  {f.note && <span className="block text-[12px] text-ink-3">{f.note}</span>}
                </th>
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{f.count.toLocaleString("ko-KR")}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">{top > 0 ? `${Math.round((f.count / top) * 1000) / 10}%` : "-"}</td>
                <td className="py-2.5 text-[13px] text-ink-3">{f.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        재방문 방문자 {m.repeat.returningVisitors}명 (이틀 이상 방문) · 재구매 회원 {m.repeat.repeatBuyers}명 (서로 다른 검사로 2건 이상 결제)
      </p>
    </section>
  );
}

function Revenue({ m }: { m: Metrics }) {
  const r = m.revenue;
  const e = m.economics;
  return (
    <section aria-labelledby="m-revenue">
      <h2 id="m-revenue" className="text-[18px] font-bold">
        매출 · 비용 · 한 건당 이익
      </h2>
      <dl className="mt-3 border-y border-line text-[14px]">
        <Row label="승인된 실결제 (리포트)">{r.paidCount + r.refundedCount}건 · {formatKrw(r.grossKrw)}</Row>
        <Row label="환불 반영">
          {r.refundedCount}건 · -{formatKrw(r.refundedKrw)}
        </Row>
        <Row label="순매출">
          <span className="font-semibold">{formatKrw(r.netKrw)}</span>
        </Row>
        <Row label="이 중 고민 반영 리포트">
          {r.concern.paidCount}건 · {formatKrw(r.concern.netKrw)} (기존 구매자의 추가 구매 — 위 첫 구매 단계 · 채널별 전환에는 넣지 않음)
        </Row>
        <Row label="미유캐시 충전 (별도)">
          {r.cash.paidCount}건 · {formatKrw(r.cash.netKrw)} · 환불 {r.cash.refundedCount}건 (리포트 매출 · 한 건당 계산에는 넣지 않음 — 아직 쓰지 않은 선불 금액이라 매출로 잡는 시점은 운영자 · 세무 확인 전)
        </Row>
        <Row label="제외한 것">테스트 결제 {r.testPaidCount}건 (매출 아님) · 중복 결제 의심 {r.duplicateSuspects}건 (운영자 확인)</Row>
        <Row label="AI 비용 (실결제 리포트)">{e.pricingConfigured ? krw(e.aiCostKrw) : "토큰 단가 설정 전 — 비용 계산 안 함"}</Row>
        <Row label="한 건당 평균">
          {e.profitPerPaidKrw === null ? (
            "실결제 건과 토큰 단가가 있으면 계산됩니다"
          ) : (
            <>
              순매출 {krw(e.avgNetRevenuePerPaidKrw)} − AI 비용 {krw(e.avgAiCostPerPaidKrw)} = <span className="font-semibold">{krw(e.profitPerPaidKrw)}</span>
            </>
          )}
        </Row>
      </dl>
      <p className="mt-2 text-[13px] text-ink-3">한 건당 이익은 결제 수수료 · 세금을 빼기 전의 단순 계산입니다 (AI 비용만 뺍니다).</p>
    </section>
  );
}

function Sources({ m }: { m: Metrics }) {
  return (
    <section aria-labelledby="m-sources">
      <h2 id="m-sources" className="text-[18px] font-bold">
        광고 · 채널별 비교
      </h2>
      {m.sources.length === 0 ? (
        <p className="mt-2 text-[14px] text-ink-2">아직 기록이 없습니다. 광고 주소에 ?utm_source=이름&utm_medium=종류&utm_campaign=이름 을 붙이면 채널별로 나뉩니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-y border-line text-[13px] text-ink-3">
                {["채널", "방문", "검사 시작", "맛보기 조회", "결제 시작", "결제 승인", "순매출", "맛보기→결제"].map((h, i) => (
                  <th key={h} scope="col" className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.sources.map((s) => (
                <tr key={s.label} className="border-b border-line">
                  <th scope="row" className="py-2.5 pr-3 font-normal">
                    {s.label}
                  </th>
                  {[s.visits, s.analyzeStarts, s.previews, s.checkouts, s.paid].map((n, i) => (
                    <td key={i} className="py-2.5 pr-3 text-right tabular-nums">
                      {n}
                    </td>
                  ))}
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatKrw(s.netRevenueKrw)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.conversionPct === null ? "-" : `${s.conversionPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[13px] text-ink-3">방문은 첫 방문 출처, 결제는 결제를 시작할 때 적어 둔 출처 기준이며 실결제만 셉니다.</p>
    </section>
  );
}

function Quality({ m }: { m: Metrics }) {
  const s = m.satisfaction;
  return (
    <section aria-labelledby="m-quality">
      <h2 id="m-quality" className="text-[18px] font-bold">
        구매 후 만족도
      </h2>
      <dl className="mt-3 border-y border-line text-[14px]">
        <Row label="응답">{s.count}건</Row>
        <Row label="평균">{s.average === null ? "-" : `${s.average} / 5`}</Row>
        <Row label="4점 이상">{s.goodPct === null ? "-" : `${s.goodPct}%`}</Row>
        <Row label="환불 반영">{m.revenue.refundedCount}건 (승인된 실결제 {m.revenue.paidCount + m.revenue.refundedCount}건 중)</Row>
      </dl>
      <p className="mt-2 text-[13px] text-ink-3">클릭 수가 아니라 미리보기에서 구매한 비율 · 만족도 · 환불 · 리포트당 비용을 함께 보세요.</p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
