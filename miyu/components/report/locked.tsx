import { LockIcon } from "@/components/ui/icons";

/**
 * 구매 후 공개되는 자리의 표시. 가려진 글자는 서버에서 보내지 않으므로 여기 들어가는 글은 항상 같은 자리 채움 문구이고,
 * 흐리게 보이는 것은 "여기에 내용이 있다"는 표시일 뿐이다 (CSS로 실제 내용을 가리는 방식이 아니다).
 */
const FILLER = "구매하면 이 자리에서 내 결과를 확인할 수 있어요 구매하면 이 자리에서 내 결과를 확인할 수 있어요 구매하면 이 자리에서 확인";

export function LockedText({ chars = 24, className = "" }: { chars?: number; className?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`select-none blur-[5px] ${className}`}>
        {FILLER.slice(0, chars)}
      </span>
      <span className="sr-only">구매 후 공개되는 내용입니다</span>
    </>
  );
}

/** 이름 · 문장의 가려진 부분 (글자 수는 항상 같은 자리 채움) */
export function LockedMask({ chars = 2 }: { chars?: number }) {
  return (
    <>
      <span aria-hidden="true" className="select-none blur-[7px]">
        {"가나다라마바".slice(0, chars)}
      </span>
      <span className="sr-only">(구매 후 공개)</span>
    </>
  );
}

export function LockTag({ children = "구매 후 공개" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-mist px-2 py-0.5 text-[12px] font-semibold text-ink-2">
      <LockIcon className="size-3.5" />
      {children}
    </span>
  );
}
