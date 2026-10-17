import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { BenefitsHeader, LoadFailedPanel, PreparingPanel } from "@/components/admin/benefits/header";
import { BENEFIT_TABS, first, monthOfKst, parseDays, parseMonth, parseScenario, resolveTab, type BenefitsNav, type SearchParamsLike } from "@/components/admin/benefits/href";
import { renderTab } from "@/components/admin/benefits/tab-body";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageWide, textLink } from "@/components/ui/styles";
import { DEFAULT_ASSUMPTIONS } from "@/lib/commerce/profit";
import { getBenefitAdminOverview, getFinanceMonthView } from "@/lib/services/benefit-admin-service";
import { getAdminMember } from "@/server/member";
import { logError } from "@/server/ops";
import { benefitRepository, now, writeRepository } from "@/server/services";

export const metadata: Metadata = { title: "혜택 · 쿠폰 · 손익 · 관리자 · ME:U 미유", robots: { index: false, follow: false } };

const ID_PREFIX = "ab-";

type Props = { searchParams: Promise<SearchParamsLike> };

export default function BenefitsAdminPage({ searchParams }: Props) {
  return (
    <main className={`${pageWide} py-10 md:py-14`}>
      <p className="text-[14px]">
        <Link href="/admin" className={textLink}>
          관리자
        </Link>
      </p>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight">혜택 · 쿠폰 · 손익 관리</h1>
      <Suspense fallback={<PageFallback className="mt-6" />}>
        <BenefitsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** 탭 하나가 읽는 데이터를 가져오다 실패하면(표가 일부만 있는 DB 등) 오류는 서버 기록에만 남기고 null을 돌려준다 */
async function load<T>(where: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    logError(`admin.benefits.${where}`, e);
    return null;
  }
}

async function BenefitsContent({ searchParams }: Props) {
  await connection();
  // 관리자가 아니면 화면이 있다는 사실도 알리지 않는다(/admin과 같다)
  if (!(await getAdminMember())) notFound();
  const params = await searchParams;
  const tab = resolveTab(first(params.tab));
  const note = (first(params.note) ?? "").slice(0, 200);
  const days = parseDays(first(params.days));
  const clock = now();
  const currentMonth = monthOfKst(clock);
  const month = parseMonth(first(params.month), currentMonth);
  const scenario = parseScenario({ buyers: first(params.buyers), refShare: first(params.refShare), other: first(params.other) }, { monthlyBuyers: DEFAULT_ASSUMPTIONS.monthlyBuyers, referralShare: 0.2, otherIncomeKrw: 0 });

  // 주소에 실려 온 값 중 이 화면이 아는 것만 링크에 이어 붙인다(알림 note는 붙이지 않는다)
  const query: Record<string, string> = { tab };
  if (first(params.days)) query.days = String(days);
  if (first(params.month)) query.month = month;
  for (const k of ["buyers", "refShare", "other"] as const) if (first(params[k]) !== undefined && first(params[k]) !== "") query[k] = String(first(params[k])).slice(0, 14);
  const nav: BenefitsNav = { basePath: "/admin/benefits", carry: {}, query };

  const deps = { repo: writeRepository(), benefits: benefitRepository(), now };
  const overview = await load("overview", () => getBenefitAdminOverview(deps, { sinceDays: days }));
  const tabLabel = BENEFIT_TABS.find((t) => t.key === tab)?.label ?? "";

  if (!overview) {
    return (
      <div className="mt-6 space-y-6">
        <BenefitsHeader nav={nav} tab={tab} note={note} ready />
        <LoadFailedPanel what="혜택 집계" />
      </div>
    );
  }

  let body: ReactNode;
  if (!overview.ready) {
    body = <PreparingPanel tabLabel={tabLabel} />;
  } else {
    // 탭이 읽는 것만 가져온다(다른 탭의 데이터는 읽지 않는다)
    const [grants, history, coupons, finance] = await Promise.all([
      tab === "overview" ? load("grants", () => deps.benefits.listBenefitGrants(20)) : null,
      tab === "switch" ? load("setting-history", () => deps.benefits.listSettingHistory(30)) : null,
      tab === "coupons" ? load("coupons", () => deps.benefits.listCoupons()) : null,
      tab === "finance" ? load("finance", () => getFinanceMonthView(deps, { month })) : null,
    ]);
    body = renderTab(tab, { overview, grants, history, coupons, finance, nav, month, currentMonth, scenario, nowIso: clock.toISOString(), idPrefix: ID_PREFIX });
  }
  return (
    <div className="mt-6 space-y-8">
      <BenefitsHeader nav={nav} tab={tab} note={note} ready={overview.ready} />
      {body}
    </div>
  );
}
