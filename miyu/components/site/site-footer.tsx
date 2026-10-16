import Link from "next/link";
import { BUSINESS_FIELDS, BUSINESS_INFO, hasSupportContact, SUPPORT_CONTACT } from "@/lib/config/business";

export function SiteFooter() {
  return (
    <footer data-site-chrome="" className="mt-auto border-t border-line bg-mist">
      <div className="mx-auto w-full max-w-6xl space-y-2 px-5 py-10 text-[13px] leading-relaxed text-ink-3 md:px-8">
        <p className="text-[15px] font-semibold text-ink-2">ME:U 미유 · 개인 통합 분석 리포트</p>
        <p>미유의 리포트는 자기 이해를 돕는 참고 자료이며, 의학적·심리학적 진단을 대신하지 않습니다.</p>
        <p>사주는 전통 해석 체계로, 심리검사 점수와 합산하지 않고 따로 제시합니다.</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
          <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
            이용약관
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            개인정보 처리방침
          </Link>
          <Link href="/assessment-basis" className="underline underline-offset-4 hover:text-ink">
            성향 질문은 어떻게 만들었나요?
          </Link>
        </p>
        <div className="space-y-1 border-t border-line pt-4 text-[12px] leading-[1.7]">
          <p className="font-semibold text-ink-2">{BUSINESS_INFO.copyright}</p>
          <p>
            {BUSINESS_FIELDS.map((f, i) => (
              <span key={f.label}>
                {i > 0 && <span aria-hidden="true"> | </span>}
                <span className="inline-block">
                  {f.label}: {f.value}
                </span>
                {i < BUSINESS_FIELDS.length - 1 && " "}
              </span>
            ))}
          </p>
          {hasSupportContact() && (
            <p>
              고객 문의:{" "}
              {SUPPORT_CONTACT.email && <span className="mr-2">{SUPPORT_CONTACT.email}</span>}
              {SUPPORT_CONTACT.channelName && SUPPORT_CONTACT.channelUrl && (
                <a href={SUPPORT_CONTACT.channelUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">
                  {SUPPORT_CONTACT.channelName}
                </a>
              )}
              {SUPPORT_CONTACT.hours && <span className="ml-2">응대 시간 {SUPPORT_CONTACT.hours}</span>}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
