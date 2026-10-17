import { changeSettingAction } from "@/app/admin/benefits/actions";
import { formatSettingValue, settingValue, zeroMeaning } from "@/components/admin/benefits/labels";
import { DataTable, Field, ReasonInput, StateChip, TD, TD_NUM, textareaClass } from "@/components/admin/benefits/ui";
import { inputClass } from "@/components/ui/form-controls";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { SETTING_FIELDS, SETTING_GROUP_LABEL, type BenefitSettings, type EarnTier, type SettingField, type SettingGroup } from "@/lib/commerce/benefits";
import { formatKrw } from "@/lib/config/product";

// 설정 한 줄을 보여 주고 바꾸는 폼 — 스위치 · 숫자 · 구간 · 교환가가 같은 서버 동작(changeSettingAction)으로 바뀐다.
// 값은 서버가 다시 확인하고(validateSettingValue), 이전 값과 사유가 변경 이력에 남는다.

const idOf = (prefix: string, key: string, part: string) => `${prefix}set-${key.replace(/[^a-z0-9]+/gi, "-")}-${part}`;

const tiersJson = (tiers: EarnTier[]) => `[\n${tiers.map((t) => `  ${JSON.stringify(t)}`).join(",\n")}\n]`;
const pricesJson = (prices: Record<string, number>) => `{\n${Object.entries(prices).map(([k, v]) => `  ${JSON.stringify(k)}: ${v}`).join(",\n")}\n}`;

/** 스위치 하나 — 지금 상태 · 설명 · [켜기]/[끄기](사유 필수) */
export function FlagRow({ field, settings, idPrefix }: { field: SettingField; settings: BenefitSettings; idPrefix: string }) {
  const on = settingValue(settings, field.key) === true;
  const reasonId = idOf(idPrefix, field.key, "reason");
  return (
    <li className="border-b border-line py-5 first:pt-0 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[16px] font-bold">{field.label}</h3>
        <StateChip tone={on ? "on" : "off"}>{on ? "켜짐" : "꺼짐"}</StateChip>
      </div>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{field.description}</p>
      <form action={changeSettingAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="key" value={field.key} />
        <input type="hidden" name="value" value={on ? "off" : "on"} />
        <Field id={reasonId} label="바꾸는 이유 (필수, 3자 이상)">
          <ReasonInput id={reasonId} />
        </Field>
        <button type="submit" className={on ? buttonSecondary : buttonPrimary}>
          {on ? "끄기" : "켜기"}
        </button>
      </form>
    </li>
  );
}

function rangeText(field: SettingField): string | null {
  if (field.min === undefined && field.max === undefined) return null;
  const u = field.unit ?? "";
  return `${field.min !== undefined ? field.min.toLocaleString("ko-KR") : ""}${u} ~ ${field.max !== undefined ? field.max.toLocaleString("ko-KR") : ""}${u}`;
}

/** 숫자 · 구간 · 교환가 설정 한 줄 */
function ValueRow({ field, settings, idPrefix }: { field: SettingField; settings: BenefitSettings; idPrefix: string }) {
  const value = settingValue(settings, field.key);
  const valueId = idOf(idPrefix, field.key, "value");
  const reasonId = idOf(idPrefix, field.key, "reason");
  const range = rangeText(field);
  const zero = zeroMeaning(field.key);
  return (
    <li className="border-b border-line py-5 last:border-b-0">
      <h4 className="text-[15px] font-semibold">{field.label}</h4>
      <p className="mt-0.5 text-[14px] leading-relaxed text-ink-3">{field.description}</p>

      {field.kind === "int" && (
        <p className="mt-2 text-[14px]">
          지금 값 <strong className="tabular-nums">{formatSettingValue(field.key, value)}</strong>
          {range && <span className="text-ink-3"> · 허용 범위 {range}</span>}
        </p>
      )}
      {field.kind === "tiers" && Array.isArray(value) && (
        <div className="mt-2 max-w-xl">
          <DataTable caption="누적 결제액별 적립률(지금 값)" head={["누적 결제액이 이 금액 이상", { label: "적립률", align: "right" }]} minWidth={320}>
            {(value as EarnTier[]).map((t) => (
              <tr key={t.fromKrw} className="border-b border-line">
                <td className={`${TD} tabular-nums`}>{formatKrw(t.fromKrw)}</td>
                <td className={TD_NUM}>{Math.round(t.rate * 1000) / 10}%</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
      {field.kind === "prices" && typeof value === "object" && value !== null && (
        <div className="mt-2 max-w-xl">
          <DataTable caption="상품별 포인트 교환가(지금 값)" head={["상품 번호", { label: "교환 포인트", align: "right" }]} minWidth={320}>
            {Object.entries(value as Record<string, number>).map(([k, v]) => (
              <tr key={k} className="border-b border-line">
                <td className={`${TD} font-mono text-[13px]`}>{k}</td>
                <td className={TD_NUM}>{v.toLocaleString("ko-KR")}P</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      <form action={changeSettingAction} className={`mt-3 grid gap-3 ${field.kind === "int" ? "sm:grid-cols-[9rem_1fr_auto] sm:items-start" : ""}`}>
        <input type="hidden" name="key" value={field.key} />
        {field.kind === "int" ? (
          <Field id={valueId} label={`새 값${field.unit ? ` (${field.unit})` : ""}`} hint={zero ? `0 = ${zero}` : undefined}>
            <input id={valueId} name="value" type="number" inputMode="numeric" step={1} min={field.min} max={field.max} required defaultValue={typeof value === "number" ? value : undefined} aria-describedby={zero ? `${valueId}-hint` : undefined} className={inputClass()} />
          </Field>
        ) : (
          <Field id={valueId} label="새 값 (JSON 모양 그대로)" hint={field.kind === "tiers" ? "구간 시작 금액(fromKrw, 원)과 적립률(rate, 0.03 = 3%)을 구간마다 한 줄씩. 첫 구간은 0원부터예요." : "상품 번호: 교환 포인트(정수) 모양으로 한 줄씩. 현금 가격에서 계산하지 않고 이 값을 그대로 써요."} className="max-w-xl">
            <textarea id={valueId} name="value" required rows={field.kind === "tiers" ? 7 : 5} spellCheck={false} defaultValue={field.kind === "tiers" ? tiersJson(value as EarnTier[]) : pricesJson(value as Record<string, number>)} aria-describedby={`${valueId}-hint`} className={textareaClass} />
          </Field>
        )}
        <div className={field.kind === "int" ? "contents" : "grid max-w-xl gap-3 sm:grid-cols-[1fr_auto] sm:items-end"}>
          <Field id={reasonId} label="바꾸는 이유 (필수, 3자 이상)">
            <ReasonInput id={reasonId} placeholder="예: 가격 정책 확정" />
          </Field>
          <button type="submit" className={`${buttonSecondary} ${field.kind === "int" ? "sm:mt-6" : ""}`}>
            저장
          </button>
        </div>
      </form>
    </li>
  );
}

/** 설정 그룹 하나(켜고 끄기만 있는 switch 그룹 제외) — 이름 + 필드들 */
export function SettingGroupSection({ group, settings, idPrefix, caption }: { group: SettingGroup; settings: BenefitSettings; idPrefix: string; caption?: string }) {
  const fields = SETTING_FIELDS.filter((f) => f.group === group && f.kind !== "flag");
  if (fields.length === 0) return null;
  const headingId = `${idPrefix}group-${group}`;
  return (
    <section aria-labelledby={headingId} className="mt-8 first:mt-0">
      <h3 id={headingId} className="border-t border-ink pt-3 text-[17px] font-bold">
        {SETTING_GROUP_LABEL[group]}
      </h3>
      {caption && <p className="mt-1 text-[13px] leading-snug text-ink-3">{caption}</p>}
      <ul className="mt-2">
        {fields.map((f) => (
          <ValueRow key={f.key} field={f} settings={settings} idPrefix={idPrefix} />
        ))}
      </ul>
    </section>
  );
}
