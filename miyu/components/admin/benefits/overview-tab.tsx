import Link from "next/link";
import { runBenefitMaintenanceAction } from "@/app/admin/benefits/actions";
import { tabHref, type BenefitsNav } from "@/components/admin/benefits/href";
import { BENEFIT_ORDER_STATUS_LABEL, GRANT_KIND_LABEL, GRANT_RELEASE_LABEL } from "@/components/admin/benefits/labels";
import { DataTable, EmptyLine, fmtNum, fmtTime, KeyValue, KeyValueList, Notice, PeriodNav, Section, shortId, StateChip, TD, TD_NUM } from "@/components/admin/benefits/ui";
import { buttonSecondary, textLink } from "@/components/ui/styles";
import { CREDIT_KIND_LABEL, POINT_SOURCE_LABEL, SETTING_FIELDS, type BenefitFeature } from "@/lib/commerce/benefits";
import type { BenefitAdminOverview } from "@/lib/services/benefit-admin-service";
import type { BenefitOrderGrantRecord } from "@/lib/services/benefit-ports";

export type GrantRow = BenefitOrderGrantRecord & { userId: string; orderNumber: string; orderStatus: string };

const SWITCH_FIELDS = SETTING_FIELDS.filter((f) => f.group === "switch");

const kindRows = (map: Record<string, number>) => Object.entries(map).sort((a, b) => b[1] - a[1]);

/** 개요 탭 — 스위치 요약 · 장부 합계 · 어긋남 · 막힌 기록 · 점검 · 혜택 주문 */
export function OverviewTab({ overview, grants, nav, idPrefix }: { overview: BenefitAdminOverview; grants: GrantRow[]; nav: BenefitsNav; idPrefix: string }) {
  const { settings, totals, failures, sinceDays } = overview;
  const onCount = SWITCH_FIELDS.filter((f) => settings.features[f.key.slice("feature.".length) as BenefitFeature]).length;
  return (
    <div className="space-y-10">
      <Section id={`${idPrefix}switches`} title="스위치 현재 상태" hint={onCount === 0 ? "아직 켠 혜택이 없어요. 처음에는 모두 꺼진 채로 시작해요." : `${SWITCH_FIELDS.length}개 중 ${onCount}개가 켜져 있어요.`}>
        <ul className="flex flex-wrap gap-2">
          {SWITCH_FIELDS.map((f) => {
            const on = settings.features[f.key.slice("feature.".length) as BenefitFeature];
            return (
              <li key={f.key} className="inline-flex items-center gap-2 rounded-lg bg-canvas px-3 py-1.5 text-[14px] shadow-soft">
                {f.label}
                <StateChip tone={on ? "on" : "off"}>{on ? "켜짐" : "꺼짐"}</StateChip>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[14px]">
          <Link href={tabHref(nav, "switch")} className={textLink}>
            스위치 · 설정 탭에서 켜고 끄기
          </Link>
        </p>
      </Section>

      {totals && (
        <Section id={`${idPrefix}totals`} title="포인트 · 질문권 장부 합계" hint={`지급 · 사용 · 소멸 · 회수는 최근 ${sinceDays}일 동안의 움직임이고, 현재 남은 양은 기간과 상관없이 지금 쓸 수 있는 양이에요.`}>
          <div className="space-y-4">
            <PeriodNav nav={nav} days={sinceDays} />
            {totals.lotMismatches > 0 ? (
              <Notice tone="warn" label={`장부 어긋남 ${totals.lotMismatches}개`}>
                포인트 묶음 {totals.lotMismatches}개에서 장부(지급 · 사용 기록의 합)와 남은 양이 맞지 않아요. 정상이면 0개예요. 이 숫자를 개발 담당에게 알려 주세요. 원인을 찾기 전에는 새로 지급하는 스위치를 켜지 않는 것을 권해요.
              </Notice>
            ) : (
              <Notice tone="ok" label="장부 정상">
                포인트 묶음의 장부와 남은 양이 모두 맞아요(어긋난 묶음 0개).
              </Notice>
            )}
            <DataTable caption={`포인트 · 질문권 장부 합계(최근 ${sinceDays}일)`} head={["구분", { label: "미유 포인트(P)", align: "right" }, { label: "질문권(개)", align: "right" }]} minWidth={340}>
              {[
                { label: "지급", p: totals.pointsEarned, q: totals.creditsGranted },
                { label: "사용", p: totals.pointsSpent, q: totals.creditsSpent },
                { label: "소멸 (유효기간이 지남)", p: totals.pointsExpired, q: totals.creditsExpired },
                { label: "회수 (환불 등으로 되돌림)", p: totals.pointsClawed, q: totals.creditsRevoked },
                { label: "회수하지 못한 몫 (이미 쓴 몫이라 기록으로만 남김)", p: totals.pointsShortfall, q: totals.creditsShortfall },
              ].map((r) => (
                <tr key={r.label} className="border-b border-line">
                  <th scope="row" className={`${TD} font-normal text-ink-2`}>
                    {r.label}
                  </th>
                  <td className={TD_NUM}>{fmtNum(r.p, 0)}</td>
                  <td className={TD_NUM}>{fmtNum(r.q, 0)}</td>
                </tr>
              ))}
              <tr className="border-b border-line">
                <th scope="row" className={`${TD} font-semibold`}>
                  현재 남은 양 (지금 쓸 수 있는 양)
                </th>
                <td className={`${TD_NUM} font-bold`}>{fmtNum(totals.pointsOutstanding, 0)}</td>
                <td className={`${TD_NUM} font-bold`}>{fmtNum(totals.creditsOutstanding, 0)}</td>
              </tr>
            </DataTable>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-[15px] font-semibold">포인트 지급 종류별</h3>
                <p className="mt-0.5 text-[13px] text-ink-3">처음부터 지금까지 지급한 합계예요(기간 선택과 상관없음).</p>
                <div className="mt-2">
                  <KindTable rows={kindRows(totals.pointsBySource)} labels={POINT_SOURCE_LABEL} unit="P" />
                </div>
              </div>
              <div>
                <h3 className="text-[15px] font-semibold">질문권 지급 종류별</h3>
                <p className="mt-0.5 text-[13px] text-ink-3">처음부터 지금까지 지급한 합계예요(기간 선택과 상관없음).</p>
                <div className="mt-2">
                  <KindTable rows={kindRows(totals.creditsByKind)} labels={CREDIT_KIND_LABEL} unit="개" />
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section id={`${idPrefix}failures`} title="막힌 기록" hint="지급 · 환불 · 차감이 중간에 막혀 남은 기록(최근 20건)이에요. 비어 있는 게 정상이에요.">
        {failures.length === 0 ? (
          <EmptyLine>막힌 기록이 없어요.</EmptyLine>
        ) : (
          <>
            <Notice tone="warn" label={`막힌 기록 ${failures.length}건`}>
              같은 종류가 계속 쌓이면 개발 담당에게 종류 · 대상 · 시각을 알려 주세요.
            </Notice>
            <div className="mt-3">
              <DataTable caption="막힌 기록" head={["시각", "종류", "대상", "내용"]} minWidth={640}>
                {failures.map((f) => (
                  <tr key={f.id} className="border-b border-line">
                    <td className={`${TD} whitespace-nowrap text-[13px] text-ink-3`}>{fmtTime(f.createdAt)}</td>
                    <td className={`${TD} font-mono text-[13px]`}>{f.kind}</td>
                    <td className={`${TD} break-all font-mono text-[13px]`}>{f.ref ? f.ref.slice(0, 36) : "-"}</td>
                    <td className={`${TD} max-w-[22rem] break-words text-ink-2`}>{f.message.slice(0, 200)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </>
        )}
      </Section>

      <Section id={`${idPrefix}maintenance`} title="혜택 점검" hint="포인트 · 질문권 만료 정리, 추천 가입 확정 조건 확인, 적립 누락 보정을 지금 한 번 실행해요. 정기 점검(하루 한 번)이 같은 일을 하고, 급할 때만 눌러도 돼요. 결과는 맨 위 알림에 나와요.">
        <form action={runBenefitMaintenanceAction}>
          <button type="submit" className={buttonSecondary}>
            혜택 점검 지금 한 번 실행
          </button>
        </form>
      </Section>

      <Section id={`${idPrefix}grants`} title="혜택 주문 (0원) 최근 20건" hint="쿠폰 · 포인트 교환 · 운영 지급으로 결제 없이 만들어진 주문이에요. 매출에는 들어가지 않아요.">
        {grants.length === 0 ? (
          <EmptyLine>아직 혜택으로 만든 주문이 없어요.</EmptyLine>
        ) : (
          <DataTable caption="혜택 주문(0원) 최근 목록" head={["시각", "주문번호", "회원", "방식", "주문 상태", { label: "쓴 포인트", align: "right" }, "되돌림"]} minWidth={820}>
            {grants.map((g) => (
              <tr key={g.orderId} className="border-b border-line">
                <td className={`${TD} whitespace-nowrap text-[13px] text-ink-3`}>{fmtTime(g.createdAt)}</td>
                <td className={`${TD} font-mono text-[13px]`}>{g.orderNumber}</td>
                <td className={`${TD} font-mono text-[13px]`}>{shortId(g.userId)}</td>
                <td className={TD}>
                  {GRANT_KIND_LABEL[g.kind] ?? g.kind}
                  {g.kind === "coupon" && g.ref && <span className="block font-mono text-[12px] text-ink-3">{g.ref}</span>}
                  {g.kind === "admin" && g.reason && <span className="block max-w-[14rem] break-words text-[12px] text-ink-3">{g.reason.slice(0, 60)}</span>}
                </td>
                <td className={TD}>{BENEFIT_ORDER_STATUS_LABEL[g.orderStatus] ?? g.orderStatus}</td>
                <td className={TD_NUM}>{g.pointSpent > 0 ? `${fmtNum(g.pointSpent, 0)}P` : "-"}</td>
                <td className={TD}>
                  {g.releasedAt ? (
                    <>
                      {g.releaseMode ? GRANT_RELEASE_LABEL[g.releaseMode] : "되돌림"}
                      <span className="block text-[12px] text-ink-3">{fmtTime(g.releasedAt)}</span>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </div>
  );
}

function KindTable({ rows, labels, unit }: { rows: [string, number][]; labels: Record<string, string>; unit: string }) {
  if (rows.length === 0) return <EmptyLine>아직 지급한 기록이 없어요.</EmptyLine>;
  return (
    <KeyValueList>
      {rows.map(([k, v]) => (
        <KeyValue key={k} label={labels[k] ?? k}>
          {fmtNum(v, 0)}
          {unit}
        </KeyValue>
      ))}
    </KeyValueList>
  );
}
