import { CheckIcon, FlowIcon, InfoIcon } from "@/components/ui/icons";

/**
 * MY의 리포트 상태 표시 — 무료 결과 / 구매 완료 / 생성 중 / 열람 가능 / 생성 실패 / 환불됨.
 * 색은 구분을 돕는 보조이고, 뜻은 항상 글자와 아이콘이 함께 전한다 (결제 상태의 기준은 서버가 결제사 기록으로 확인한 값뿐이다).
 */
type Kind = "paid" | "generating" | "ready" | "failed" | "free" | "refunded" | "new";

const STYLE: Record<Kind, { cls: string; Icon?: typeof CheckIcon }> = {
  paid: { cls: "bg-positive-soft text-positive", Icon: CheckIcon },
  generating: { cls: "bg-accent-soft text-accent-strong", Icon: FlowIcon },
  ready: { cls: "bg-mist text-ink-2" },
  failed: { cls: "bg-caution-soft text-caution", Icon: InfoIcon },
  free: { cls: "bg-mist text-ink-2" },
  refunded: { cls: "bg-mist text-ink-2" },
  new: { cls: "bg-accent-soft text-accent-strong" },
};

export function StateBadge({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const { cls, Icon } = STYLE[kind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold ${cls}`}>
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}
