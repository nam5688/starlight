import Link from "next/link";
import { BENEFIT_TABS, tabHref, type BenefitsNav, type BenefitTabKey } from "@/components/admin/benefits/href";
import { Notice } from "@/components/admin/benefits/ui";

/** 맨 위 설명 + 서버 동작이 돌려준 알림(note) + 탭 */
export function BenefitsHeader({ nav, tab, note, ready }: { nav: BenefitsNav; tab: BenefitTabKey; note: string; ready: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-[14px] leading-relaxed text-ink-3">
        포인트 · 질문권 · 쿠폰 · 친구 추천과 손익을 보고 조작하는 화면입니다. 이름 · 생년월일 · 응답은 어디에도 없고 회원은 번호 앞 8자로만 보입니다. 모든 조작은 서버에서 관리자 여부를 다시 확인하고 운영 기록에 남습니다. 지급은 서버 설정(스위치)이 켜져 있을 때만 일어납니다.
      </p>
      {note && (
        <p role="status" className="rounded-md bg-mist px-4 py-3 text-[14px]">
          {note}
        </p>
      )}
      <nav aria-label="혜택 관리 탭" className="flex flex-wrap gap-2 text-[14px]">
        {BENEFIT_TABS.map((t) => (
          <Link key={t.key} href={tabHref(nav, t.key)} aria-current={t.key === tab ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 font-semibold ${t.key === tab ? "border-accent bg-accent text-white" : "border-line-strong bg-canvas hover:bg-mist"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {!ready && (
        <Notice tone="warn" label="준비 중">
          DB 변경 19~22번을 아직 적용하지 않은 상태예요. 모든 탭이 &lsquo;준비 중&rsquo;으로 보이고, 아무 동작도 하지 않아요(숫자도 버튼도 없어요). 적용 방법은 miyu/docs/update-guide.md에 있어요.
        </Notice>
      )}
    </div>
  );
}

/** DB 19~22번 전 — 탭 이름만 알려 주고 숫자 · 버튼은 두지 않는다 */
export function PreparingPanel({ tabLabel }: { tabLabel: string }) {
  return (
    <section aria-label={`${tabLabel} 준비 중`} className="rounded-lg bg-canvas px-5 py-6 shadow-soft">
      <p className="text-[16px] font-semibold">&lsquo;{tabLabel}&rsquo; 탭은 준비 중이에요.</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-3">혜택 표가 만들어지는 DB 변경 19~22번을 적용한 뒤부터 보이고 쓸 수 있어요. 그전에는 숫자도 버튼도 나오지 않아요.</p>
    </section>
  );
}

/** 혜택 표 일부가 없거나 읽는 중 오류 — 오류 내용은 서버 기록에만 남기고 화면에는 다음 할 일만 적는다 */
export function LoadFailedPanel({ what }: { what: string }) {
  return (
    <Notice tone="warn" label="불러오지 못했어요">
      읽지 못한 것: {what}. DB 변경 19~22번이 모두 적용됐는지 확인해 주세요(적용 방법은 miyu/docs/update-guide.md). 서버 기록에 오류가 남았어요. 아무것도 바뀌지 않았어요.
    </Notice>
  );
}
