import { InfoIcon } from "@/components/ui/icons";
import { PAIR_CONSENT } from "@/lib/report/compat/pair-consent";

/** 동의 안내 — 무엇을 쓰고 · 상대에게 무엇이 보이고 · AI에는 무엇이 가고 · 어떻게 철회하는지(법률 검토 전 초안). 체크박스는 각 폼이 따로 둔다 */
export function PairConsentBox() {
  return (
    <div className="rounded-xl bg-canvas p-4 text-[14px] leading-[1.75] text-ink-2 shadow-soft">
      <p className="flex gap-2 font-semibold text-ink">
        <InfoIcon className="mt-1 size-4 shrink-0" />
        <span>{PAIR_CONSENT.notFullShare}</span>
      </p>
      <ul className="mt-2 space-y-1.5 pl-6">
        <li className="list-disc">{PAIR_CONSENT.used}</li>
        <li className="list-disc">{PAIR_CONSENT.shown}</li>
        <li className="list-disc">{PAIR_CONSENT.ai}</li>
        <li className="list-disc">{PAIR_CONSENT.revoke}</li>
      </ul>
    </div>
  );
}
