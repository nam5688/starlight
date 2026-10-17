import Link from "next/link";
import { decideReferralAction, revokeReferralAction } from "@/app/admin/benefits/actions";
import { tabHref, type BenefitsNav } from "@/components/admin/benefits/href";
import { SettingGroupSection } from "@/components/admin/benefits/setting-forms";
import { AssumedTag, DataTable, EmptyLine, Field, fmtNum, fmtTime, KeyValue, KeyValueList, Notice, PeriodNav, ReasonInput, Section, smallCaution, smallPrimary, Stat, StatGrid, TD } from "@/components/admin/benefits/ui";
import { inputClass } from "@/components/ui/form-controls";
import { buttonSecondary, textLink } from "@/components/ui/styles";
import { RISK_LABEL, type BenefitSettings } from "@/lib/commerce/benefits";
import { formatKrw } from "@/lib/config/product";
import type { BenefitAdminOverview, ReferralHealth } from "@/lib/services/benefit-admin-service";

type QueueRow = BenefitAdminOverview["referralQueue"][number];

const pct = (v: number | null) => (v === null ? "계산할 수 없어요" : `${Math.round(v * 1000) / 10}%`);

/** 손익분기 경고 — 자료가 적으면 판단하지 않고 그렇다고 적는다(흑자 · 적자를 단정하지 않는다) */
function HealthNotice({ health }: { health: ReferralHealth }) {
  switch (health.status) {
    case "below-breakeven":
      return (
        <Notice tone="warn" label="손익분기 미달">
          {health.message}
        </Notice>
      );
    case "insufficient":
      return (
        <Notice tone="info" label="자료가 적어 판단하지 않았어요">
          {health.message}
        </Notice>
      );
    case "no-data":
      return (
        <Notice tone="info" label="아직 자료가 없어요">
          {health.message}
        </Notice>
      );
    case "ok":
      return (
        <Notice tone="ok" label="손익분기 이상">
          {health.message}
        </Notice>
      );
  }
}

/** 추천 탭 — 퍼널 · 손익분기 경고 · 비용 구분 · 검토 대기열 · 확정 회수 · 추천 설정 */
export function ReferralTab({ health, queue, settings, sinceDays, nav, idPrefix }: { health: ReferralHealth; queue: QueueRow[]; settings: BenefitSettings; sinceDays: number; nav: BenefitsNav; idPrefix: string }) {
  const { funnel } = health;
  const f = (name: string) => `${idPrefix}${name}`;
  return (
    <div className="space-y-10">
      <Section id={f("funnel")} title="추천 퍼널" hint={`최근 ${sinceDays}일 기준이에요. 확정 가입 → 첫 구매 전환은 확정된 가입이 ${health.minSignups}명 이상일 때부터 비교해요.`}>
        <div className="space-y-4">
          <PeriodNav nav={nav} days={sinceDays} />
          <StatGrid cols={4}>
            <Stat label="추천 링크" value={fmtNum(funnel.links, 0)} />
            <Stat label="링크 방문" value={fmtNum(funnel.visits, 0)} />
            <Stat label="추천 가입" value={fmtNum(funnel.signups, 0)} />
            <Stat label="가입 확정" value={fmtNum(funnel.confirmed, 0)} />
            <Stat label="운영자 확인 대기" value={fmtNum(funnel.review, 0)} warn={funnel.review > 0} />
            <Stat label="첫 구매 확정" value={fmtNum(funnel.firstPurchasesConfirmed, 0)} />
            <Stat label="첫 구매 회수" value={fmtNum(funnel.firstPurchasesRevoked, 0)} />
          </StatGrid>
          <KeyValueList>
            <KeyValue label="확정 가입 → 첫 구매 확정 전환율">{health.conversion === null ? `판단하지 않음 (확정 가입 ${health.minSignups}명 미만)` : pct(health.conversion)}</KeyValue>
            <KeyValue label="손익분기 전환율">
              {pct(health.breakEvenConversion)}
              <AssumedTag>가정값 기준</AssumedTag>
            </KeyValue>
          </KeyValueList>
        </div>
      </Section>

      <Section id={f("health")} title="손익분기 확인">
        <HealthNotice health={health} />
      </Section>

      <Section id={f("cost")} title="추천 가입에 드는 비용 (따로 센 두 가지)" hint={`확정된 가입 ${fmtNum(funnel.confirmed, 0)}명 기준이에요. 두 비용은 합치지 않고 따로 봐요.`}>
        <KeyValueList>
          <KeyValue label="가입 보상 포인트 비용">
            {formatKrw(Math.round(health.cost.signupPointKrw))}
            <AssumedTag>추정</AssumedTag>
          </KeyValue>
          <KeyValue label="무료 이용 AI 원가 (무료 질문 · 맛보기)">
            {formatKrw(Math.round(health.cost.freeAiKrw))}
            <AssumedTag>추정</AssumedTag>
          </KeyValue>
          <KeyValue label="확정 가입 1명당 (두 비용의 합)">
            {formatKrw(Math.round(health.cost.perConfirmedSignupKrw))}
            <AssumedTag>추정</AssumedTag>
          </KeyValue>
        </KeyValueList>
        <p className="mt-2 text-[13px] leading-snug text-ink-3">포인트 1P를 1원으로 치지 않고, 사용률 · 잠식률 가정으로 어림한 값이에요. 확정 회계가 아니고 실제 사용량이 쌓이면 달라져요(가정값은 손익 탭 맨 아래 표).</p>
      </Section>

      <Section id={f("queue")} title={`검토 대기열 (${queue.length}건)`} hint="위험 신호가 있어 자동으로 확정하지 않은 가입이에요. 회원은 번호 앞 8자만 보여요.">
        {queue.length === 0 ? (
          <EmptyLine>운영자 확인을 기다리는 가입이 없어요.</EmptyLine>
        ) : (
          <div className="space-y-3">
            <DataTable caption="추천 가입 검토 대기열" head={["가입자", "추천인", "위험 신호", "가입 시각", "보류 끝나는 시각", "처리 (이유 필수)"]} minWidth={960}>
              {queue.map((q) => {
                const rid = f(`decide-${q.inviteeShort}`);
                return (
                  <tr key={q.inviteeUserId} className="border-b border-line">
                    <td className={`${TD} font-mono text-[13px]`}>{q.inviteeShort}</td>
                    <td className={`${TD} font-mono text-[13px]`}>{q.inviterShort}</td>
                    <td className={TD}>
                      {q.risk.length === 0 ? (
                        "-"
                      ) : (
                        <ul className="space-y-0.5">
                          {q.risk.map((r) => (
                            <li key={r}>{RISK_LABEL[r] ?? r}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-[13px]`}>{fmtTime(q.signedUpAt)}</td>
                    <td className={`${TD} whitespace-nowrap text-[13px]`}>{fmtTime(q.holdUntil)}</td>
                    <td className={TD}>
                      <form action={decideReferralAction} className="flex w-[17rem] flex-col gap-2">
                        <input type="hidden" name="invitee" value={q.inviteeUserId} />
                        <label htmlFor={rid} className="sr-only">
                          처리 이유 ({q.inviteeShort})
                        </label>
                        <ReasonInput id={rid} placeholder="처리 이유 (3자 이상)" />
                        <div className="flex gap-2">
                          <button type="submit" name="decision" value="confirm" className={smallPrimary}>
                            확정
                          </button>
                          <button type="submit" name="decision" value="reject" className={smallCaution}>
                            거절
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            <p className="text-[13px] leading-snug text-ink-3">
              확정하면 추천인에게 가입 보상 포인트(지금 설정 {fmtNum(settings.referral.signupPoints, 0)}P)가 지급돼요 — &lsquo;추천 가입 포인트&rsquo; 스위치가 켜져 있을 때예요. 거절하면 지급하지 않아요. 같은 건은 한 번만 처리돼요.
            </p>
          </div>
        )}
      </Section>

      <Section id={f("revoke")} title="확정된 가입 회수" hint="확정한 뒤 부정으로 판단한 가입을 되돌려요. 쓰지 않은 보상만 회수하고, 이미 쓴 몫은 '회수하지 못한 몫'으로 기록에 남아요(개요 탭 장부).">
        <form action={revokeReferralAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-start">
          <Field id={f("revoke-invitee")} label="가입한 사람의 회원번호 (36자 전체)" hint="회원번호 전체가 필요해요. Supabase 관리 화면의 회원 목록에서 복사해 붙여 넣으세요.">
            <input id={f("revoke-invitee")} name="invitee" type="text" required pattern="[0-9a-fA-F\-]{36}" minLength={36} maxLength={36} autoComplete="off" spellCheck={false} aria-describedby={`${f("revoke-invitee")}-hint`} className={`${inputClass()} font-mono`} />
          </Field>
          <Field id={f("revoke-reason")} label="회수 이유 (필수, 3자 이상)">
            <ReasonInput id={f("revoke-reason")} placeholder="예: 같은 기기 반복 가입 확인" />
          </Field>
          <button type="submit" className={`${buttonSecondary} md:mt-6`}>
            회수하기
          </button>
        </form>
      </Section>

      <Section id={f("settings")} title="추천 설정" hint="가격 · 가입 포인트 · 보류 시간 · 한도예요. 바꾸면 이전 값과 이유가 변경 이력에 남아요.">
        <SettingGroupSection group="referral" settings={settings} idPrefix={idPrefix} />
        <p className="mt-4 text-[14px]">
          위험 신호 기준(한 링크 1시간 가입 수 등)은{" "}
          <Link href={tabHref(nav, "switch")} className={textLink}>
            스위치 · 설정 탭의 &lsquo;추천 위험 신호 기준&rsquo;
          </Link>
          에서 바꿔요.
        </p>
      </Section>
    </div>
  );
}
