"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui/form-controls";

/**
 * 한국 시간으로 날짜 · 시각을 고르면 "+09:00"을 붙여 서버에 보낸다.
 * 시간대 없는 값("2026-11-01T00:00")을 서버(UTC)가 그대로 저장하면 쿠폰 기간이 9시간 어긋나기 때문이다.
 * 비워 두면 빈 값을 보낸다(= 기간 제한 없음).
 */
export function KstDateTimeField({ id, name, label, hint }: { id: string; name: string; label: string; hint?: string }) {
  const [value, setValue] = useState("");
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-2">
        {label} <span className="text-ink-3">(한국 시간)</span>
      </label>
      <div className="mt-1">
        <input id={id} type="datetime-local" step={60} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass()} />
        <input type="hidden" name={name} value={value ? `${withSeconds}+09:00` : ""} />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[13px] leading-snug text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}
