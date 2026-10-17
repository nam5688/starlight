import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BenefitsHeader, PreparingPanel } from "@/components/admin/benefits/header";
import { BENEFIT_TABS, first, parseDays, parseMonth, parseScenario, resolveTab, type BenefitsNav, type SearchParamsLike } from "@/components/admin/benefits/href";
import { renderTab } from "@/components/admin/benefits/tab-body";
import { Notice } from "@/components/admin/benefits/ui";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageWide, textLink } from "@/components/ui/styles";
import { DEFAULT_ASSUMPTIONS } from "@/lib/commerce/profit";
import { buildPreview, PREVIEW_DEFAULT_MONTH, PREVIEW_NOW, PREVIEW_STATES, type PreviewState } from "./preview-data";

export const metadata: Metadata = { title: "혜택 관리자 화면 미리보기 · ME:U 미유", robots: { index: false, follow: false } };

const BASE_PATH = "/dev/admin-benefits-preview";

type Props = { searchParams: Promise<SearchParamsLike> };

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 혜택 관리자 화면(/admin/benefits)의 다섯 탭을 가상 값으로 본다. 아무것도 저장하지 않고 폼은 눌리지 않는다 */
export default function AdminBenefitsPreviewPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`${pageWide} py-10 md:py-14`}>
      <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      <h1 className="mt-3 text-[26px] font-bold tracking-tight">혜택 관리자 화면 미리보기</h1>
      <Suspense fallback={<p className="mt-6 text-[16px] text-ink-2">불러오고 있어요.</p>}>
        <PreviewContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PreviewContent({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  const state = (PREVIEW_STATES.find((s) => s.key === first(params.state))?.key ?? "warn") as PreviewState;
  const tab = resolveTab(first(params.tab));
  const days = parseDays(first(params.days));
  const month = parseMonth(first(params.month), PREVIEW_DEFAULT_MONTH);
  const scenario = parseScenario({ buyers: first(params.buyers), refShare: first(params.refShare), other: first(params.other) }, { monthlyBuyers: DEFAULT_ASSUMPTIONS.monthlyBuyers, referralShare: 0.2, otherIncomeKrw: 0 });

  const query: Record<string, string> = { tab };
  if (first(params.days)) query.days = String(days);
  if (first(params.month)) query.month = month;
  for (const k of ["buyers", "refShare", "other"] as const) if (first(params[k])) query[k] = String(first(params[k])).slice(0, 14);
  const nav: BenefitsNav = { basePath: BASE_PATH, carry: { state }, query };

  const bundle = await buildPreview(state, month, days);
  const stateInfo = PREVIEW_STATES.find((s) => s.key === state)!;
  const tabLabel = BENEFIT_TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="mt-4 space-y-6">
      <Notice tone="warn" label="화면 디자인용 가상 값 · 실제 값이 아닙니다">
        아래 숫자 · 회원 · 쿠폰은 모양을 보려고 만든 가상 값이에요. 폼은 이 미리보기에서 눌리지 않고 아무것도 저장하지 않아요. 실제 화면은{" "}
        <Link href="/admin/benefits" className={textLink}>
          /admin/benefits
        </Link>
        (관리자 로그인 필요)예요. 기준 시각은 {PREVIEW_NOW.toISOString().slice(0, 10)}이고 월 손익은 2026-10만 값이 있어요.
      </Notice>
      <nav aria-label="미리보기 상태" className="flex flex-wrap gap-2 text-[14px]">
        {PREVIEW_STATES.map((s) => (
          <Link key={s.key} href={`${BASE_PATH}?state=${s.key}&tab=${tab}`} aria-current={s.key === state ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 font-semibold ${s.key === state ? "border-ink bg-ink text-white" : "border-line-strong bg-canvas hover:bg-mist"}`}>
            {s.label}
          </Link>
        ))}
      </nav>
      <p className="text-[14px] leading-relaxed text-ink-3">{stateInfo.note}</p>

      {/* 폼이 눌리지 않게 묶는다(비활성) — 렌더 모양만 본다 */}
      <fieldset disabled className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">미리보기(폼은 눌리지 않아요)</legend>
        <div className="space-y-8">
          <BenefitsHeader nav={nav} tab={tab} note="" ready={bundle.overview.ready} />
          {bundle.overview.ready
            ? renderTab(tab, { overview: bundle.overview, grants: bundle.grants, history: bundle.history, coupons: bundle.coupons, finance: bundle.finance, nav, month, currentMonth: PREVIEW_DEFAULT_MONTH, scenario, nowIso: PREVIEW_NOW.toISOString(), idPrefix: "abp-" })
            : <PreparingPanel tabLabel={tabLabel} />}
        </div>
      </fieldset>
    </div>
  );
}
