import { FlagRow, SettingGroupSection } from "@/components/admin/benefits/setting-forms";
import { formatSettingValue } from "@/components/admin/benefits/labels";
import { DataTable, EmptyLine, fmtTime, Section, shortId, TD } from "@/components/admin/benefits/ui";
import { SETTING_FIELDS, type BenefitSettings, type SettingGroup } from "@/lib/commerce/benefits";
import { PAUSABLE_FEATURES } from "@/lib/services/benefit-admin-service";
import type { SettingHistoryRecord } from "@/lib/services/benefit-ports";

// 스위치 · 설정 탭 — 보상 일시 중지 스위치 · 그 밖의 스위치 · 숫자 · 구간 · 교환가 설정 · 변경 이력

const pausableKeys: readonly string[] = PAUSABLE_FEATURES.map((f) => f.key);

/** 숫자 · 구간 · 교환가 그룹을 보이는 순서(켜고 끄기 그룹 switch는 위쪽 스위치 구역이 맡는다) */
export const SETTING_GROUP_ORDER: SettingGroup[] = ["earn", "point", "credit", "referral", "risk", "review", "retention"];

function historyLabel(key: string): string {
  return SETTING_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function SwitchTab({ settings, history, idPrefix }: { settings: BenefitSettings; history: SettingHistoryRecord[]; idPrefix: string }) {
  const pausable = PAUSABLE_FEATURES.map((p) => SETTING_FIELDS.find((f) => f.key === p.key)).filter((f): f is NonNullable<typeof f> => !!f);
  const others = SETTING_FIELDS.filter((f) => f.group === "switch" && !pausableKeys.includes(f.key));
  return (
    <div className="space-y-10">
      <Section id={`${idPrefix}pausable`} title="보상 일시 중지 스위치" hint="끄면 새로 주는 것만 멈추고, 이미 준 포인트 · 질문권은 그대로 남아요. 항목마다 켰을 때 무슨 일이 일어나는지는 아래 설명을 보세요.">
        <ul>
          {pausable.map((f) => (
            <FlagRow key={f.key} field={f} settings={settings} idPrefix={idPrefix} />
          ))}
        </ul>
      </Section>

      <Section id={`${idPrefix}others`} title="그 밖의 스위치" hint="끄면 새 사용만 막혀요. 이미 쓴 것은 그대로예요.">
        <ul>
          {others.map((f) => (
            <FlagRow key={f.key} field={f} settings={settings} idPrefix={idPrefix} />
          ))}
        </ul>
      </Section>

      <Section id={`${idPrefix}values`} title="숫자 · 구간 · 교환가" hint="바꾸면 이전 값과 이유가 아래 변경 이력에 남아요. 값은 서버가 한 번 더 확인해요. 이미 지급된 포인트 · 질문권의 유효기간은 지급할 때 박힌 값이라 바뀌지 않아요.">
        {SETTING_GROUP_ORDER.map((g) => (
          <SettingGroupSection key={g} group={g} settings={settings} idPrefix={idPrefix} caption={g === "referral" ? "저장하면 추천 탭으로 돌아가요. 같은 설정이 추천 탭 아래에도 있어요." : undefined} />
        ))}
      </Section>

      <Section id={`${idPrefix}history`} title="변경 이력 (최근 30건)">
        {history.length === 0 ? (
          <EmptyLine>아직 바꾼 기록이 없어요.</EmptyLine>
        ) : (
          <DataTable caption="설정 변경 이력" head={["시각", "항목", "이전 → 새 값", "이유", "바꾼 사람"]} minWidth={760}>
            {history.map((h) => (
              <tr key={h.id} className="border-b border-line">
                <td className={`${TD} whitespace-nowrap text-[13px] text-ink-3`}>{fmtTime(h.changedAt)}</td>
                <td className={TD}>
                  {historyLabel(h.key)}
                  <span className="block font-mono text-[12px] text-ink-3">{h.key}</span>
                </td>
                <td className={TD}>
                  {formatSettingValue(h.key, h.oldValue)} <span aria-label="에서">→</span> <strong>{formatSettingValue(h.key, h.newValue)}</strong>
                </td>
                <td className={`${TD} max-w-[18rem] break-words text-ink-2`}>{h.reason}</td>
                <td className={`${TD} font-mono text-[13px]`}>{h.changedBy ? shortId(h.changedBy) : "-"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </div>
  );
}
