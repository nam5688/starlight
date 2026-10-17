import { createCouponAction, setCouponStatusAction } from "@/app/admin/benefits/actions";
import { COUPON_PURPOSE_LABEL, COUPON_STATUS_LABEL, COUPON_TYPE_LABEL, couponValueText } from "@/components/admin/benefits/labels";
import { KstDateTimeField } from "@/components/admin/benefits/kst-datetime";
import { ConfirmStep, DataTable, EmptyLine, Field, fmtNum, fmtTime, Notice, Section, shortId, smallButton, smallPrimary, StateChip, TD } from "@/components/admin/benefits/ui";
import { chevronBg, inputClass, selectClass } from "@/components/ui/form-controls";
import { buttonPrimary } from "@/components/ui/styles";
import type { CouponRecord } from "@/lib/services/benefit-ports";

// 쿠폰 탭 — 새 쿠폰(처음에는 초안, 켜기 전에는 쓰이지 않는다) · 쿠폰 목록과 상태 버튼

const TYPE_GUIDE = [
  { type: "amount", value: "깎을 금액(원) · 1 이상", effect: "정가에서 그만큼 빼요. 결제 금액이 0원이 되면 결제 없이 무료로 받아요." },
  { type: "percent", value: "깎을 비율(%) · 1~100", effect: "정가의 그 비율만큼 빼요(100이면 무료)." },
  { type: "free-product", value: "0", effect: "결제 없이 무료로 받아요(0원 주문)." },
  { type: "free-report-entitlement", value: "0", effect: "결제 없이 무료로 받아요(0원 주문). 체험단 · 고객 응대처럼 이름으로 구분해 쓰세요." },
  { type: "credit", value: "질문권 개수 · 1 이상", effect: "코드를 입력하면 질문권을 줘요(결제 없음)." },
] as const;

function tone(c: CouponRecord): "on" | "off" | "warn" {
  return c.status === "active" ? "on" : c.status === "revoked" ? "warn" : "off";
}

/** 기간 때문에 지금은 쓸 수 없는 쿠폰 */
function periodNote(c: CouponRecord, nowIso: string): string | null {
  if (c.status !== "active") return null;
  if (c.endsAt && c.endsAt < nowIso) return "사용 기간이 지나서 지금은 쓸 수 없어요.";
  if (c.startsAt && c.startsAt > nowIso) return "아직 시작 전이라 지금은 쓸 수 없어요.";
  return null;
}

function StatusForm({ id, status, label, variant }: { id: string; status: "active" | "paused"; label: string; variant: "primary" | "plain" }) {
  return (
    <form action={setCouponStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={variant === "primary" ? smallPrimary : smallButton}>
        {label}
      </button>
    </form>
  );
}

export function CouponsTab({ coupons, nowIso, defaultCreditExpireDays, idPrefix }: { coupons: CouponRecord[]; nowIso: string; defaultCreditExpireDays: number; idPrefix: string }) {
  const f = (name: string) => `${idPrefix}new-${name}`;
  return (
    <div className="space-y-10">
      <Section id={`${idPrefix}new`} title="새 쿠폰 만들기" hint="새 쿠폰은 초안으로 시작해요. 아래 목록에서 [켜기]를 눌러야 쓰이고, 쿠폰 스위치(스위치 · 설정 탭)도 켜져 있어야 고객이 코드를 쓸 수 있어요.">
        <div className="space-y-4">
          <DataTable caption="쿠폰 종류별 값 입력 방법" head={["종류", "값에 넣는 것", "동작"]} minWidth={560}>
            {TYPE_GUIDE.map((g) => (
              <tr key={g.type} className="border-b border-line">
                <td className={`${TD} font-medium`}>{COUPON_TYPE_LABEL[g.type]}</td>
                <td className={TD}>{g.value}</td>
                <td className={`${TD} text-ink-2`}>{g.effect}</td>
              </tr>
            ))}
          </DataTable>

          <form action={createCouponAction} className="grid gap-4 md:grid-cols-2">
            <Field id={f("code")} label="코드 (영문 · 숫자 · - · _ , 4~32자)" hint="소문자로 적어도 대문자로 바뀌어요. 같은 코드는 만들 수 없어요.">
              <input id={f("code")} name="code" type="text" required minLength={4} maxLength={32} pattern="[A-Za-z0-9_\-]{4,32}" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-describedby={`${f("code")}-hint`} className={`${inputClass()} font-mono`} />
            </Field>
            <Field id={f("name")} label="이름 (고객에게 보여요, 60자까지)">
              <input id={f("name")} name="name" type="text" required maxLength={60} autoComplete="off" className={inputClass()} />
            </Field>
            <Field id={f("description")} label="설명 (선택, 운영자 메모, 200자까지)" className="md:col-span-2">
              <input id={f("description")} name="description" type="text" maxLength={200} autoComplete="off" className={inputClass()} />
            </Field>

            <Field id={f("type")} label="종류">
              <select id={f("type")} name="type" required defaultValue="amount" style={chevronBg} className={selectClass()}>
                {TYPE_GUIDE.map((g) => (
                  <option key={g.type} value={g.type}>
                    {COUPON_TYPE_LABEL[g.type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={f("value")} label="값" hint="종류별로 위 표대로 넣어요(무료 종류는 0).">
              <input id={f("value")} name="value" type="number" inputMode="numeric" required min={0} step={1} defaultValue={0} aria-describedby={`${f("value")}-hint`} className={inputClass()} />
            </Field>

            <Field id={f("perUserLimit")} label="한 계정이 쓸 수 있는 횟수" hint="보통 1이에요.">
              <input id={f("perUserLimit")} name="perUserLimit" type="number" inputMode="numeric" required min={1} step={1} defaultValue={1} aria-describedby={`${f("perUserLimit")}-hint`} className={inputClass()} />
            </Field>
            <Field id={f("issueLimit")} label="전체 사용 한도 (비우면 제한 없음)" hint="예약 중인 것도 한도에 들어가요.">
              <input id={f("issueLimit")} name="issueLimit" type="number" inputMode="numeric" min={1} step={1} aria-describedby={`${f("issueLimit")}-hint`} className={inputClass()} />
            </Field>

            <KstDateTimeField id={f("startsAt")} name="startsAt" label="사용 시작" hint="비우면 바로 시작이에요." />
            <KstDateTimeField id={f("endsAt")} name="endsAt" label="사용 끝" hint="비우면 기한이 없어요. 시작보다 뒤여야 해요." />

            <Field id={f("purpose")} label="쓰임 (구분용)">
              <select id={f("purpose")} name="purpose" defaultValue="promo" style={chevronBg} className={selectClass()}>
                {Object.entries(COUPON_PURPOSE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={f("creditExpireDays")} label="질문권 유효 일수 (질문권 쿠폰만, 선택)" hint={`1 이상. 비우면 설정의 질문권 유효기간(${defaultCreditExpireDays === 0 ? "소멸 없음" : `${defaultCreditExpireDays}일`})을 따라요.`}>
              <input id={f("creditExpireDays")} name="creditExpireDays" type="number" inputMode="numeric" min={1} step={1} aria-describedby={`${f("creditExpireDays")}-hint`} className={inputClass()} />
            </Field>

            <Field id={f("targetUserId")} label="특정 회원 전용 (회원번호 36자, 선택)" hint="비우면 누구나 쓸 수 있어요." className="md:col-span-2">
              <input id={f("targetUserId")} name="targetUserId" type="text" pattern="[0-9a-fA-F\-]{36}" maxLength={36} autoComplete="off" spellCheck={false} aria-describedby={`${f("targetUserId")}-hint`} className={`${inputClass()} font-mono`} />
            </Field>

            <fieldset className="md:col-span-2">
              <legend className="text-[13px] font-medium text-ink-2">옵션</legend>
              <div className="mt-1 space-y-2">
                <label className="flex min-h-11 items-start gap-3 text-[14px] leading-snug">
                  <input type="checkbox" name="reviewRewardEligible" className="mt-0.5 size-5 shrink-0 accent-accent" />
                  <span>
                    체험단 후기 보상 대상으로 표시
                    <span className="block text-[13px] text-ink-3">이 쿠폰으로 만든 0원 주문이 후기 보상을 줄 대상이 돼요.</span>
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-3 text-[14px] leading-snug">
                  <input type="checkbox" name="stackableWithReferral" className="mt-0.5 size-5 shrink-0 accent-accent" />
                  <span>
                    친구 추천 가격과 함께 쓸 수 있어요
                    <span className="block text-[13px] text-ink-3">자동으로 겹치지 않아요. 둘 다 적격이면 고객이 선택지에서 직접 골라요.</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="md:col-span-2">
              <button type="submit" className={buttonPrimary}>
                초안으로 만들기
              </button>
            </div>
          </form>
        </div>
      </Section>

      <Section id={`${idPrefix}list`} title={`쿠폰 목록 (${coupons.length}개)`} hint="[켜기]를 눌러야 쓰이고, [잠시 멈춤]은 다시 켤 수 있어요. 폐기는 되돌릴 수 없어요.">
        {coupons.length === 0 ? (
          <EmptyLine>아직 만든 쿠폰이 없어요.</EmptyLine>
        ) : (
          <DataTable caption="쿠폰 목록" head={["코드 · 이름", "종류와 값", "상태", "사용 현황", "기간", "상태 바꾸기"]} minWidth={900}>
            {coupons.map((c) => {
              const note = periodNote(c, nowIso);
              const reserved = Math.max(0, c.activeCount - c.usedCount);
              return (
                <tr key={c.id} className="border-b border-line">
                  <td className={TD}>
                    <span className="font-mono text-[14px] font-semibold">{c.code}</span>
                    <span className="block">{c.name}</span>
                    {c.description && <span className="block max-w-[16rem] break-words text-[12px] text-ink-3">{c.description}</span>}
                    <span className="mt-1 block text-[12px] text-ink-3">
                      {COUPON_PURPOSE_LABEL[c.purpose] ?? c.purpose}
                      {c.stackableWithReferral ? " · 추천 가격과 함께 선택 가능" : ""}
                      {c.reviewRewardEligible ? " · 후기 보상 대상" : ""}
                      {c.targetUserId ? ` · 회원 전용(${shortId(c.targetUserId)})` : ""}
                    </span>
                  </td>
                  <td className={TD}>
                    {couponValueText(c.type, c.value)}
                    {c.type === "credit" && c.creditExpireDays ? <span className="block text-[12px] text-ink-3">질문권 유효 {c.creditExpireDays}일</span> : null}
                  </td>
                  <td className={TD}>
                    <StateChip tone={tone(c)}>{COUPON_STATUS_LABEL[c.status] ?? c.status}</StateChip>
                    {note && <span className="mt-1 block max-w-[12rem] text-[12px] leading-snug text-caution">{note}</span>}
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    사용 {fmtNum(c.usedCount, 0)} · 예약 {fmtNum(reserved, 0)}
                    <span className="block text-[12px] text-ink-3">
                      {c.issueLimit === null ? "전체 한도 제한 없음" : `전체 한도 ${fmtNum(c.issueLimit, 0)} (남은 ${fmtNum(Math.max(0, c.issueLimit - c.activeCount), 0)})`}
                    </span>
                    <span className="block text-[12px] text-ink-3">계정당 {c.perUserLimit}회</span>
                  </td>
                  <td className={`${TD} text-[13px]`}>
                    {c.startsAt ? fmtTime(c.startsAt) : "바로 시작"}
                    <span className="block">~ {c.endsAt ? fmtTime(c.endsAt) : "기한 없음"}</span>
                  </td>
                  <td className={TD}>
                    {c.status === "revoked" ? (
                      <span className="text-[13px] text-ink-3">폐기됨 · 되돌릴 수 없어요</span>
                    ) : (
                      <div className="flex flex-wrap items-start gap-2">
                        {(c.status === "draft" || c.status === "paused") && <StatusForm id={c.id} status="active" label="켜기" variant="primary" />}
                        {c.status === "active" && <StatusForm id={c.id} status="paused" label="잠시 멈춤" variant="plain" />}
                        <ConfirmStep action={setCouponStatusAction} fields={{ id: c.id, status: "revoked" }} summary="폐기…" warning="폐기하면 다시 켤 수 없고 되돌릴 수 없어요. 이미 쓴 기록은 그대로 남아요. 잠시만 막으려면 ‘잠시 멈춤’을 쓰세요." confirmLabel="폐기하기 (되돌릴 수 없어요)" />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <div className="mt-3">
          <Notice tone="info">기간은 한국 시간으로 보여요. 쿠폰을 만들 때 적은 시각도 한국 시간으로 저장돼요.</Notice>
        </div>
      </Section>
    </div>
  );
}
