import Link from "next/link";
import { addExpenseAction, deleteExpenseAction } from "@/app/admin/benefits/actions";
import { hrefTo, shiftMonth, type BenefitsNav, type ScenarioInput } from "@/components/admin/benefits/href";
import { ASSUMPTION_LABELS, CREDIT_SOURCE_LABEL, formatAssumption, vatModeLabel } from "@/components/admin/benefits/labels";
import { AssumedTag, ConfirmStep, DataTable, EmptyLine, Field, fmtNum, fmtTime, KeyValue, KeyValueList, Notice, PeriodNav, Section, StateChip, TD, TD_NUM } from "@/components/admin/benefits/ui";
import { chevronBg, inputClass, selectClass } from "@/components/ui/form-controls";
import { buttonPrimary, buttonSecondary, textLink } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import { ASSUMPTION_SOURCES, DEFAULT_ASSUMPTIONS, type AcquisitionRow, type Assumptions } from "@/lib/commerce/profit";
import type { annualScenarios, BenefitAdminOverview, FinanceMonthView } from "@/lib/services/benefit-admin-service";

// 손익 탭 — 월 손익(관리회계 추정) · 비용 입력 · 질문 AI 원가 · 정가 vs 추천 비교 · 연 세후 전망 · 가정값 표
// 이 화면의 숫자는 직접 잰 값 · 정책으로 정해진 값 · 가정이 섞여 있다. 가정이 들어간 값에는 "가정"이라고 적는다.

const won = (n: number) => formatKrw(Math.round(n));
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

const EXPENSE_KIND_LABEL: Record<string, string> = { ad: "광고비", fixed: "고정비(서버 · 도구)", other: "기타" };

export type FinanceTabProps = {
  month: string;
  currentMonth: string;
  view: FinanceMonthView;
  overview: BenefitAdminOverview;
  /** 이 화면의 계산에 쓴 가정값(설정과 측정값이 반영된 것) */
  assumptions: Assumptions;
  scenario: ScenarioInput;
  scenarios: ReturnType<typeof annualScenarios>;
  nav: BenefitsNav;
  idPrefix: string;
};

export function FinanceTab({ month, currentMonth, view, overview, assumptions, scenario, scenarios, nav, idPrefix }: FinanceTabProps) {
  const f = (name: string) => `${idPrefix}${name}`;
  const { revenue, expenses } = view;
  const pgFeeEstimate = Math.round(revenue.grossKrw * assumptions.pgFeeRate);
  return (
    <div className="space-y-10">
      <nav aria-label="월 선택" className="flex flex-wrap items-center gap-2 text-[14px]">
        <Link href={hrefTo(nav, { month: shiftMonth(month, -1) })} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-canvas px-4 font-semibold hover:bg-mist">
          이전 달
        </Link>
        <span className="px-2 text-[16px] font-bold" aria-current="date">
          {monthLabel(month)}
        </span>
        <Link href={hrefTo(nav, { month: shiftMonth(month, 1) })} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-canvas px-4 font-semibold hover:bg-mist">
          다음 달
        </Link>
        {month !== currentMonth && (
          <Link href={hrefTo(nav, { month: null })} className={textLink}>
            이번 달로
          </Link>
        )}
      </nav>

      <Section id={f("month")} title={`${monthLabel(month)} 손익 (관리회계 추정)`} hint="결제 수수료 · 부가세 · 소득세는 빼지 않은 사업 손익이에요. 세무 신고 금액이 아니에요.">
        <div className="space-y-3">
          <KeyValueList>
            <KeyValue label={`결제 금액 합계 (환불 전, 실결제 ${fmtNum(revenue.paidCount + revenue.refundedCount, 0)}건)`}>{won(revenue.grossKrw)}</KeyValue>
            <KeyValue label={`환불 (${fmtNum(revenue.refundedCount, 0)}건)`}>{revenue.refundedKrw > 0 ? `-${won(revenue.refundedKrw)}` : won(0)}</KeyValue>
            <KeyValue label="순매출">
              <strong>{won(revenue.netKrw)}</strong>
            </KeyValue>
            <KeyValue label="테스트 결제 (매출에서 뺐어요)">{fmtNum(revenue.testPaidCount, 0)}건</KeyValue>
            <KeyValue label="혜택 주문 (0원 · 매출 아님)">{fmtNum(revenue.benefitOrderCount, 0)}건</KeyValue>
            <KeyValue label="AI 비용 (리포트 · 질문 · 맛보기 등 기록된 호출의 추정 비용)">-{won(view.aiCostKrw)}</KeyValue>
            <KeyValue label="광고비 (직접 입력)">-{won(expenses.adKrw)}</KeyValue>
            <KeyValue label="고정비 (직접 입력)">-{won(expenses.fixedKrw)}</KeyValue>
            <KeyValue label="기타 비용 (직접 입력)">-{won(expenses.otherKrw)}</KeyValue>
            <KeyValue label="보상 비용 (지급한 포인트 · 질문권의 기대 비용)">
              -{won(view.rewardCostEstimateKrw)}
              <AssumedTag>추정</AssumedTag>
            </KeyValue>
            <KeyValue label="세전 사업 손익 (결제 수수료 · 세금 빼기 전)">
              <strong className={view.operatingBeforeFeeTaxKrw < 0 ? "text-danger" : ""}>
                {view.operatingBeforeFeeTaxKrw < 0 ? "-" : ""}
                {won(Math.abs(view.operatingBeforeFeeTaxKrw))}
              </strong>
              {view.operatingBeforeFeeTaxKrw < 0 && <span className="ml-1.5 text-[13px] font-semibold text-danger">(적자)</span>}
            </KeyValue>
            <KeyValue label="참고: 결제 수수료 어림 (위 손익에서 아직 빼지 않았어요)">
              {won(pgFeeEstimate)}
              <AssumedTag>가정 {pct(assumptions.pgFeeRate)}</AssumedTag>
            </KeyValue>
          </KeyValueList>
          {view.aiUnpricedCalls > 0 && (
            <Notice tone="warn" label="AI 비용 확인">
              가격표에 없는 모델의 호출이 {view.aiUnpricedCalls}건 있어서 AI 비용이 실제보다 낮게 잡혔을 수 있어요.
            </Notice>
          )}
          {month < currentMonth && (
            <Notice tone="info" label="지난 달을 보고 있어요">
              &lsquo;보상 비용&rsquo; 추정에는 그 달 이후에 지급한 포인트 · 질문권도 섞여 들어가요(서버가 그 달 시작부터 지금까지를 합산해요). 나머지 숫자는 그 달만이에요.
            </Notice>
          )}
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-snug text-ink-3">
            {view.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id={f("expenses")} title="비용 입력 (광고비 · 고정비 · 기타)" hint="광고를 집행하거나 서버 · 도구 요금을 내면 월 단위로 직접 적어요. 손익의 광고 · 고정 · 기타 비용이 이 값으로 계산돼요.">
        <div className="space-y-4">
          <form action={addExpenseAction} className="grid gap-3 md:grid-cols-[8rem_12rem_10rem_1fr_auto] md:items-end">
            <Field id={f("exp-month")} label="월 (YYYY-MM)">
              <input id={f("exp-month")} name="month" type="text" required pattern="\d{4}-(0[1-9]|1[0-2])" maxLength={7} defaultValue={month} placeholder="2026-10" autoComplete="off" className={`${inputClass()} font-mono`} />
            </Field>
            <Field id={f("exp-kind")} label="종류">
              <select id={f("exp-kind")} name="kind" required defaultValue="ad" style={chevronBg} className={selectClass()}>
                {Object.entries(EXPENSE_KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={f("exp-amount")} label="금액 (원)">
              <input id={f("exp-amount")} name="amountKrw" type="number" inputMode="numeric" required min={0} max={1_000_000_000} step={1} className={inputClass()} />
            </Field>
            <Field id={f("exp-memo")} label="메모 (선택, 100자까지)">
              <input id={f("exp-memo")} name="memo" type="text" maxLength={100} autoComplete="off" placeholder="예: 인스타 광고" className={inputClass()} />
            </Field>
            <button type="submit" className={buttonPrimary}>
              비용 기록하기
            </button>
          </form>
          <p className="text-[13px] leading-snug text-ink-3">저장하면 이번 달 화면으로 돌아와요. 다른 달 비용을 넣었다면 위의 월 이동으로 확인하세요.</p>

          <h3 className="text-[15px] font-semibold">{monthLabel(month)} 비용 목록</h3>
          {expenses.items.length === 0 ? (
            <EmptyLine>이 달에 입력한 비용이 없어요.</EmptyLine>
          ) : (
            <DataTable caption={`${monthLabel(month)} 입력한 비용`} head={["종류", { label: "금액", align: "right" }, "메모", "입력 시각", "지우기"]} minWidth={620}>
              {expenses.items.map((e) => (
                <tr key={e.id} className="border-b border-line">
                  <td className={TD}>{EXPENSE_KIND_LABEL[e.kind] ?? e.kind}</td>
                  <td className={TD_NUM}>{won(e.amountKrw)}</td>
                  <td className={`${TD} max-w-[16rem] break-words text-ink-2`}>{e.memo ?? "-"}</td>
                  <td className={`${TD} whitespace-nowrap text-[13px] text-ink-3`}>{fmtTime(e.createdAt)}</td>
                  <td className={TD}>
                    <ConfirmStep action={deleteExpenseAction} fields={{ id: String(e.id) }} summary="지우기…" warning="지우면 이 달 손익에서 이 비용이 빠져요. 되돌리려면 다시 입력해야 해요." confirmLabel="지우기" />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </Section>

      <AiQuestionSection overview={overview} nav={nav} id={f("ai")} />

      <ComparisonSection overview={overview} id={f("compare")} />

      <Section id={f("annual")} title="연 세후 전망 (가정)" hint="월 구매자 수 · 추천 구매 비중 · 다른 소득을 넣으면 한 해 사업 이익과 세후 이익을 어림해 봐요. 수요 근거가 없어서 값을 바꿔 가며 보는 용도예요.">
        <div className="space-y-4">
          <form method="get" action={nav.basePath} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-start">
            {Object.entries({ ...nav.carry, tab: "finance", ...(nav.query.month ? { month: nav.query.month } : {}), ...(nav.query.days ? { days: nav.query.days } : {}) }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Field id={f("sc-buyers")} label="월 구매자 수 (명)" hint={`기본 ${DEFAULT_ASSUMPTIONS.monthlyBuyers}명(가정)`}>
              <input id={f("sc-buyers")} name="buyers" type="number" inputMode="numeric" min={0} max={100000} step={1} defaultValue={scenario.monthlyBuyers} aria-describedby={`${f("sc-buyers")}-hint`} className={inputClass()} />
            </Field>
            <Field id={f("sc-ref")} label="추천 구매 비중 (0~1)" hint="0.2 = 구매자 5명 중 1명이 추천 가격">
              <input id={f("sc-ref")} name="refShare" type="number" inputMode="decimal" min={0} max={1} step={0.05} defaultValue={scenario.referralShare} aria-describedby={`${f("sc-ref")}-hint`} className={inputClass()} />
            </Field>
            <Field id={f("sc-other")} label="다른 소득 (원, 1년)" hint="미유 말고 다른 사업 · 근로 소득. 세금은 합산해서 계산해요.">
              <input id={f("sc-other")} name="other" type="number" inputMode="numeric" min={0} step={1000} defaultValue={scenario.otherIncomeKrw} aria-describedby={`${f("sc-other")}-hint`} className={inputClass()} />
            </Field>
            <button type="submit" className={`${buttonSecondary} md:mt-6`}>
              다시 계산
            </button>
          </form>
          <p className="text-[14px] text-ink-2">
            기준: 월 {fmtNum(scenario.monthlyBuyers, 0)}명 · 추천 구매 {pct(scenario.referralShare)} · 다른 소득 {won(scenario.otherIncomeKrw)}
          </p>
          <DataTable
            caption="연 세후 전망 세 가지"
            head={[
              "항목",
              { label: "감면 없음 (기본)", align: "right" },
              { label: "감면 50% (가정)", align: "right" },
              { label: "감면 75% (확정되지 않은 조건부 가정)", align: "right" },
            ]}
            minWidth={720}
          >
            {(
              [
                ["연 결제 금액 합계", (r) => won(r.annualGrossKrw)],
                ["과세 유형 (연 금액으로 어림)", (r) => vatModeLabel(r.vatMode)],
                ["공헌이익", (r) => won(r.contributionKrw)],
                ["사업이익 (광고비 · 고정비까지 뺀 뒤)", (r) => won(r.operatingKrw)],
                ["미유 때문에 늘어난 소득세 · 지방소득세", (r) => won(r.incrementalTaxKrw)],
                ["세후 이익", (r) => won(r.afterTaxKrw), true],
                ["부가세로 낼 돈(현금 흐름)", (r) => won(r.vatCashKrw)],
                ["세금 준비액 (부가세 + 소득세 증가분)", (r) => won(r.taxReserveKrw)],
              ] as [string, (r: (typeof scenarios)[number]["result"]) => string, boolean?][]
            ).map(([label, pick, strong]) => (
              <tr key={label} className="border-b border-line">
                <th scope="row" className={`${TD} ${strong ? "font-semibold" : "font-normal text-ink-2"}`}>
                  {label}
                </th>
                {scenarios.map((s) => (
                  <td key={s.reductionRate} className={`${TD_NUM} ${strong ? "font-bold" : ""}`}>
                    {pick(s.result)}
                  </td>
                ))}
              </tr>
            ))}
          </DataTable>
          <Notice tone="warn" label="감면 50% · 75%는 확정이 아니에요">
            청년창업 세액감면은 업종 · 사업장 · 청년 요건 · 기존 사업과 독립된 신규 창업 인정이 확인되기 전에는 적용하지 않아요. 기본은 감면 없음(0%)이고, 50%는 가정, 75%는 확정되지 않은 조건부 가정이에요. 감면이 없어도 이익이 나는 구조가 목표이고 감면은 추가 이익으로만 봐요. 세무사 확인 전의 어림이며 신고 금액이 아니에요.
          </Notice>
        </div>
      </Section>

      <AssumptionTable assumptions={assumptions} id={f("assumptions")} />
    </div>
  );
}

// ── 질문 AI 원가 ─────────────────────────────

function AiQuestionSection({ overview, nav, id }: { overview: BenefitAdminOverview; nav: BenefitsNav; id: string }) {
  const q = overview.aiQuestion;
  const used = overview.assumptions.usedMeasuredQuestionCost;
  return (
    <Section id={id} title="질문 한 번의 AI 원가" hint={`최근 ${overview.sinceDays}일 동안 채팅 질문에 쓴 AI의 추정 비용이에요. 같은 질문의 재시도 · 고쳐 쓰기 호출은 합쳐서 한 번으로 세요.`}>
      <div className="space-y-4">
        <PeriodNav nav={nav} days={overview.sinceDays} />
        {!q || q.questions === 0 ? (
          <EmptyLine>이 기간에 기록된 질문이 없어요.</EmptyLine>
        ) : (
          <>
            <KeyValueList>
              <KeyValue label="질문 수">{fmtNum(q.questions, 0)}건</KeyValue>
              <KeyValue label="평균">{formatKrw(q.overall.avgKrw)}</KeyValue>
              <KeyValue label="중앙값 (p50)">{formatKrw(q.overall.p50Krw)}</KeyValue>
              <KeyValue label="비싼 쪽 5% 경계 (p95)">{formatKrw(q.overall.p95Krw)}</KeyValue>
              <KeyValue label="가장 비싼 질문">{formatKrw(q.overall.maxKrw)}</KeyValue>
              <KeyValue label="재시도한 질문 (두 번 이상 호출)">{fmtNum(q.retried, 0)}건</KeyValue>
              <KeyValue label="재시도에 든 비용">
                {formatKrw(q.retryCostKrw)} (전체의 {pct(q.retryShare)})
              </KeyValue>
            </KeyValueList>
            {q.unpricedCalls > 0 && (
              <Notice tone="warn" label="원가 확인">
                가격표에 없는 호출이 {q.unpricedCalls}건 있어요. 0원으로 세어서 평균이 낮게 나올 수 있어요.
              </Notice>
            )}
            <DataTable caption="질문 종류별 AI 원가" head={["어떤 질문권으로 물었나", { label: "질문 수", align: "right" }, { label: "평균", align: "right" }, { label: "p95", align: "right" }]} minWidth={480}>
              {Object.entries(q.byCreditSource).map(([k, s]) => (
                <tr key={k} className="border-b border-line">
                  <td className={TD}>{CREDIT_SOURCE_LABEL[k] ?? k}</td>
                  <td className={TD_NUM}>{fmtNum(s.count, 0)}</td>
                  <td className={TD_NUM}>{formatKrw(s.avgKrw)}</td>
                  <td className={TD_NUM}>{formatKrw(s.p95Krw)}</td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
        {used ? (
          <Notice tone="ok" label="측정값을 써요">
            이 화면의 손익 계산은 측정한 질문 원가({formatKrw(overview.assumptions.aiQuestionCostKrw)})를 써요.
          </Notice>
        ) : (
          <Notice tone="info" label="가정값을 써요">
            측정한 질문이 모자라서(기본 30건 미만) 손익 계산에는 가정값 {formatKrw(overview.assumptions.aiQuestionCostKrw)}을 써요. 위 측정값은 참고용이에요.
          </Notice>
        )}
      </div>
    </Section>
  );
}

// ── 정가 vs 추천 ─────────────────────────────

function CompareTable({ caption, list, referral }: { caption: string; list: AcquisitionRow; referral: AcquisitionRow }) {
  const rows: [string, (r: AcquisitionRow) => string, boolean?][] = [
    ["가입자 수", (r) => `${fmtNum(r.signups, 0)}명`],
    ["구매 전환율", (r) => pct(r.convRate)],
    ["구매자 수", (r) => `${fmtNum(r.buyers, 1)}명`],
    ["구매자 1명당 공헌이익 (무료 원가 · 포인트 · 광고비 빼기 전)", (r) => won(r.grossPerBuyerKrw)],
    ["무료 이용 원가 (가입자 전원)", (r) => won(r.freeCostKrw)],
    ["가입 보상 포인트", (r) => won(r.signupPointKrw)],
    ["광고비", (r) => won(r.adKrw)],
    ["순이익", (r) => won(r.netKrw), true],
    ["가입자 1명당 순이익", (r) => won(r.netPerSignupKrw), true],
  ];
  return (
    <DataTable caption={caption} head={["항목", { label: "정가 구매 (광고 유입)", align: "right" }, { label: "추천 구매 (초대 가격)", align: "right" }]} minWidth={520}>
      {rows.map(([label, pick, strong]) => (
        <tr key={label} className="border-b border-line">
          <th scope="row" className={`${TD} ${strong ? "font-semibold" : "font-normal text-ink-2"}`}>
            {label}
          </th>
          <td className={`${TD_NUM} ${strong ? "font-bold" : ""}`}>{pick(list)}</td>
          <td className={`${TD_NUM} ${strong ? "font-bold" : ""}`}>{pick(referral)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function ComparisonSection({ overview, id }: { overview: BenefitAdminOverview; id: string }) {
  const cmp = overview.comparison;
  const measured = overview.referral?.conversion ?? null;
  return (
    <Section id={id} title="정가 구매 vs 추천 구매 (같은 가입자 1,000명 기준)" hint="같은 가입자 수 · 같은 무료 이용 원가로 나란히 놓고 어느 쪽이 남는지 봐요. 전환율 · 광고비는 가정이 들어 있어요.">
      <div className="space-y-5">
        <div>
          <h3 className="flex flex-wrap items-center gap-1 text-[15px] font-semibold">
            두 쪽의 전환율이 같다고 둘 때<AssumedTag>가정</AssumedTag>
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3">가격 · 보상 구조만의 차이를 보는 줄이에요.</p>
          <div className="mt-2">
            <CompareTable caption="정가 구매와 추천 구매 비교(전환율이 같다고 둘 때)" list={cmp.equalConversion.list} referral={cmp.equalConversion.referral} />
          </div>
        </div>
        <div>
          <h3 className="flex flex-wrap items-center gap-1 text-[15px] font-semibold">
            추천 전환율을 {measured === null ? `가정값(${pct(cmp.referralConversion.referral.convRate)})` : `측정값(${pct(measured)})`}으로 둘 때{measured === null ? <AssumedTag>가정</AssumedTag> : <StateChip tone="on">측정</StateChip>}
          </h3>
          <div className="mt-2">
            <CompareTable caption="정가 구매와 추천 구매 비교(추천 전환율 반영)" list={cmp.referralConversion.list} referral={cmp.referralConversion.referral} />
          </div>
        </div>
        <KeyValueList>
          <KeyValue label="추천 구매의 손익분기 전환율">
            {cmp.breakEvenConvReferral === null ? "계산할 수 없어요" : pct(cmp.breakEvenConvReferral)}
            <AssumedTag>가정값 기준</AssumedTag>
          </KeyValue>
        </KeyValueList>
        <p className="text-[13px] leading-relaxed text-ink-3">{cmp.basisNote}</p>
      </div>
    </Section>
  );
}

// ── 가정값 표 ────────────────────────────────

const SOURCE_TEXT = { measured: "직접 잰 값", policy: "정책 · 계약", assumed: "가정" } as const;

function AssumptionTable({ assumptions, id }: { assumptions: Assumptions; id: string }) {
  const keys = Object.keys(ASSUMPTION_LABELS) as (keyof Assumptions)[];
  return (
    <Section id={id} title="손익에 쓴 가정값" hint="이 화면의 계산에 쓴 값이에요. '가정'은 근거가 없거나 아직 재지 못한 값이니 실제 값이 생기면 바꿔야 해요. 수요 · 전환율 · 광고비 · 고정비는 특히 근거가 없어요.">
      <DataTable caption="손익 계산에 쓴 가정값" head={["항목", { label: "값", align: "right" }, "구분", "근거 · 메모"]} minWidth={760}>
        {keys.map((k) => {
          const src = ASSUMPTION_SOURCES[k];
          const changed = assumptions[k] !== DEFAULT_ASSUMPTIONS[k];
          return (
            <tr key={k} className="border-b border-line">
              <td className={TD}>
                {ASSUMPTION_LABELS[k].label}
                <span className="block font-mono text-[12px] text-ink-3">{k}</span>
              </td>
              <td className={TD_NUM}>
                {formatAssumption(k, assumptions[k])}
                {changed && <span className="block text-[12px] font-normal text-ink-3">기본값 {formatAssumption(k, DEFAULT_ASSUMPTIONS[k])}에서 설정 · 측정값으로 바뀜</span>}
              </td>
              <td className={TD}>
                <StateChip tone={src.source === "measured" ? "on" : src.source === "assumed" ? "warn" : "off"}>{SOURCE_TEXT[src.source]}</StateChip>
              </td>
              <td className={`${TD} max-w-[24rem] break-words text-[13px] leading-snug text-ink-2`}>{src.note}</td>
            </tr>
          );
        })}
      </DataTable>
    </Section>
  );
}
