import type { ReactNode } from "react";
import { CouponsTab } from "@/components/admin/benefits/coupons-tab";
import { FinanceTab } from "@/components/admin/benefits/finance-tab";
import { LoadFailedPanel } from "@/components/admin/benefits/header";
import type { BenefitsNav, BenefitTabKey, ScenarioInput } from "@/components/admin/benefits/href";
import { OverviewTab, type GrantRow } from "@/components/admin/benefits/overview-tab";
import { ReferralTab } from "@/components/admin/benefits/referral-tab";
import { SwitchTab } from "@/components/admin/benefits/switch-tab";
import { annualScenarios, assumptionsFromSettings, type BenefitAdminOverview, type FinanceMonthView } from "@/lib/services/benefit-admin-service";
import type { CouponRecord, SettingHistoryRecord } from "@/lib/services/benefit-ports";

/** 탭 하나가 읽는 데이터 — null은 읽지 못했다는 뜻(표가 일부만 있는 DB 등)이다 */
export type TabData = {
  overview: BenefitAdminOverview;
  grants: GrantRow[] | null;
  history: SettingHistoryRecord[] | null;
  coupons: CouponRecord[] | null;
  finance: FinanceMonthView | null;
  nav: BenefitsNav;
  month: string;
  currentMonth: string;
  scenario: ScenarioInput;
  nowIso: string;
  idPrefix: string;
};

/** 실제 화면(app/admin/benefits)과 개발용 미리보기(app/dev/admin-benefits-preview)가 같은 조립을 쓴다 */
export function renderTab(tab: BenefitTabKey, d: TabData): ReactNode {
  const { overview, nav, idPrefix } = d;
  switch (tab) {
    case "overview":
      return d.grants ? <OverviewTab overview={overview} grants={d.grants} nav={nav} idPrefix={idPrefix} /> : <LoadFailedPanel what="혜택 주문 목록" />;
    case "switch":
      return d.history ? <SwitchTab settings={overview.settings} history={d.history} idPrefix={idPrefix} /> : <LoadFailedPanel what="설정 변경 이력" />;
    case "coupons":
      return d.coupons ? <CouponsTab coupons={d.coupons} nowIso={d.nowIso} defaultCreditExpireDays={overview.settings.creditExpireDays} idPrefix={idPrefix} /> : <LoadFailedPanel what="쿠폰 목록" />;
    case "referral":
      return overview.referral ? <ReferralTab health={overview.referral} queue={overview.referralQueue} settings={overview.settings} sinceDays={overview.sinceDays} nav={nav} idPrefix={idPrefix} /> : <LoadFailedPanel what="추천 집계" />;
    case "finance": {
      if (!d.finance) return <LoadFailedPanel what="월 손익" />;
      // 질문 원가는 측정한 질문이 충분할 때만 가정값을 대신한다(서비스와 같은 규칙)
      const measured = overview.aiQuestion ? { aiQuestionAvgKrw: overview.aiQuestion.overall.avgKrw, samples: overview.aiQuestion.questions } : undefined;
      const { assumptions } = assumptionsFromSettings(overview.settings, measured);
      return <FinanceTab month={d.month} currentMonth={d.currentMonth} view={d.finance} overview={overview} assumptions={assumptions} scenario={d.scenario} scenarios={annualScenarios(assumptions, d.scenario)} nav={nav} idPrefix={idPrefix} />;
    }
  }
}
