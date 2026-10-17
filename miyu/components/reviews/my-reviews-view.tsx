import { ReviewForm, type ReviewSaveAction } from "@/components/reviews/review-form";
import { DisclosureTags, Stars } from "@/components/reviews/review-card";
import { formatDate } from "@/components/ui/format";
import { InfoIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { REVIEWS } from "@/lib/config/product";
import { REVIEW_KIND_LABEL, REVIEW_REASONS, REVIEW_STATUS_LABEL, type ReviewKind, type RewardState } from "@/lib/commerce/reviews";
import type { MyReviewsView } from "@/lib/services/review-service";
import type { ReviewRecord } from "@/lib/services/review-ports";

// 내 후기 화면의 본문 — props만 받는 순수 화면 조각이다(데이터는 app/my/reviews/page.tsx가 읽는다). 실제 화면과 개발용 미리보기가 같은 조각을 쓴다.
// 서버 동작은 prop으로 받는다 — 미리보기는 아무것도 바꾸지 않는 동작을 넘긴다.

export type VoidAction = (formData: FormData) => void | Promise<void>;
export type MyReviewActions = { save: ReviewSaveAction; visibility: VoidAction; remove: VoidAction };

const smallButton = "inline-flex h-11 items-center justify-center rounded-lg border border-line-strong bg-canvas px-4 text-[14px] font-semibold text-ink hover:bg-mist";
const summaryClass = "inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-line-strong bg-canvas px-4 text-[14px] font-semibold text-ink hover:bg-mist [&::-webkit-details-marker]:hidden";

const rewardLine = (state: RewardState, credits: number): string => {
  switch (state) {
    case "granted":
      return `보상 질문권 ${credits}개를 받았어요.`;
    case "pending":
    case "failed":
      return "보상 질문권을 확인하고 있어요. 이 화면을 열 때마다 다시 맞춰요.";
    case "ineligible":
      return "이 이용 건은 보상 대상이 아니에요.";
    default:
      return "보상 없이 남긴 후기예요.";
  }
};

const hiddenReasonLabel = (code: string | null) => REVIEW_REASONS.hide.find((r) => r.code === code)?.label ?? null;

function Tags({ review }: { review: Pick<ReviewRecord, "disclosure" | "freeTrial"> }) {
  return <DisclosureTags review={review} />;
}

function WrittenRow({ row, actions, idPrefix, minBodyChars }: { row: MyReviewsView["written"][number]; actions: MyReviewActions; idPrefix: string; minBodyChars: number }) {
  const r = row.review;
  const reason = hiddenReasonLabel(r.hiddenReason);
  return (
    <li id={`${idPrefix}written-${r.id}`} className="scroll-mt-20 rounded-2xl bg-canvas p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-[15px] font-semibold">
          {REVIEW_KIND_LABEL[r.kind]} <span className="font-normal text-ink-3">· {row.title}</span>
        </p>
        <StatusBadge>{REVIEW_STATUS_LABEL[r.status]}</StatusBadge>
      </div>

      {r.status === "deleted" ? (
        <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">운영 기준에 따라 삭제된 후기예요{reason ? `(사유: ${reason})` : ""}. 다시 쓸 수 없어요. 이미 받은 질문권은 그대로예요.</p>
      ) : (
        <>
          <Stars rating={r.rating} className="mt-2.5" />
          <p className="mt-2.5 text-[15px] leading-[1.75] break-words whitespace-pre-line">{r.body}</p>
          <div className="mt-3 space-y-2">
            <Tags review={r} />
            <p className="text-[13px] leading-[1.6] text-ink-3">
              {formatDate(r.createdAt)} 작성 · {rewardLine(r.rewardState, r.rewardCredits)}
            </p>
            <p className="text-[13px] leading-[1.6] text-ink-3">
              {r.status === "published" && "메인과 전체 후기에 보여요."}
              {r.status === "private" && "나만 볼 수 있어요. 운영 기록 용도로만 쓰여요."}
              {r.status === "hidden" && `운영자가 숨긴 후기예요${reason ? `(사유: ${reason})` : ""}. 고쳐도 다시 공개되지 않아요. 문제가 해결됐다면 사이트 하단의 고객 문의로 알려 주세요.`}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-start gap-2">
            <details className="w-full">
              <summary className={summaryClass}>고치기</summary>
              <div className="mt-3 rounded-xl border border-line p-4">
                <ReviewForm
                  action={actions.save}
                  mode="edit"
                  kind={r.kind}
                  subjectRef={r.subjectRef}
                  reviewId={r.id}
                  initial={{ rating: r.rating, body: r.body, publicConsent: r.publicConsent }}
                  minBodyChars={minBodyChars}
                  maxChars={REVIEWS.bodyMax}
                  rewardCredits={null}
                  freeTrial={r.freeTrial}
                  idPrefix={`${idPrefix}edit-${r.id}-`}
                />
              </div>
            </details>
            {r.status !== "hidden" && (
              <form action={actions.visibility}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="to" value={r.status === "published" ? "private" : "public"} />
                <button type="submit" className={smallButton}>
                  {r.status === "published" ? "나만 보기로 바꾸기" : "공개로 바꾸기"}
                </button>
              </form>
            )}
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-1 text-[14px] font-medium text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:text-ink-2 [&::-webkit-details-marker]:hidden">지우기</summary>
              <div className="mt-1 max-w-[18rem] rounded-xl bg-caution-soft px-3 py-3">
                <p className="text-[13px] leading-snug text-caution">후기 글이 지워져요. 받은 질문권은 그대로이고, 나중에 다시 써도 같은 이용 건의 보상은 한 번뿐이에요.</p>
                <form action={actions.remove} className="mt-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg border border-caution/40 bg-canvas px-4 text-[14px] font-semibold text-caution hover:bg-caution-soft">
                    후기 지우기
                  </button>
                </form>
              </div>
            </details>
          </div>
        </>
      )}
    </li>
  );
}

function UnwrittenRow({ row, actions, idPrefix, rewardCredits, minBodyChars, open }: { row: MyReviewsView["unwritten"][number]; actions: MyReviewActions; idPrefix: string; rewardCredits: number; minBodyChars: number; open: boolean }) {
  const s = row.subject;
  return (
    <li id={`${idPrefix}write-${s.subjectRef}`} className="scroll-mt-20 rounded-2xl bg-canvas p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-[15px] font-semibold">
          {REVIEW_KIND_LABEL[s.kind]} <span className="font-normal text-ink-3">· {s.title}</span>
        </p>
        <span className="text-[13px] text-ink-3">{formatDate(s.at)}</span>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
        {row.rewardOffered && <span className="rounded-md bg-mist px-2 py-0.5 font-medium text-ink-2">쓰면 질문권 {rewardCredits}개</span>}
        {s.freeTrial && <span className="rounded-md bg-mist px-2 py-0.5 font-medium text-ink-2">무료 체험 이용</span>}
        {row.rewrite && <span className="rounded-md bg-mist px-2 py-0.5 font-medium text-ink-2">이전에 지운 후기 · 다시 쓰기</span>}
      </p>
      <details className="mt-3" open={open}>
        <summary className={summaryClass}>{row.rewrite ? "다시 쓰기" : "후기 쓰기"}</summary>
        <div className="mt-3 rounded-xl border border-line p-4">
          <ReviewForm
            action={actions.save}
            mode={row.rewrite ? "rewrite" : "create"}
            kind={s.kind as ReviewKind}
            subjectRef={s.subjectRef}
            minBodyChars={minBodyChars}
            maxChars={REVIEWS.bodyMax}
            rewardCredits={row.rewardOffered ? rewardCredits : null}
            freeTrial={s.freeTrial}
            idPrefix={`${idPrefix}new-${s.subjectRef}-`}
          />
        </div>
      </details>
    </li>
  );
}

/** 내 후기 본문 — 아직 쓰지 않은 적격 건 · 내가 쓴 후기. open은 주소로 가리킨 이용 건(후기 남기기 링크로 들어온 경우)을 펼친다 */
export function MyReviewsBody({ view, actions, open, idPrefix = "" }: { view: MyReviewsView; actions: MyReviewActions; open: { kind: string; ref: string } | null; idPrefix?: string }) {
  if (!view.ready) {
    return <p className="mt-8 text-[16px] leading-[1.7] text-ink-2">후기 기능을 준비하고 있어요. 잠시 뒤에 다시 열어 주세요.</p>;
  }
  const nothing = view.written.length === 0 && view.unwritten.length === 0;
  return (
    <>
      <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">
        심층 리포트 · 사주 궁합 · 미유 채팅을 실제로 이용한 건에만 후기를 쓸 수 있어요. 이용 건마다 후기는 하나이고, 고치거나 나만 보기로 바꾸거나 지울 수 있어요.
        {view.reward.on ? ` 후기를 남기면 질문권 ${view.reward.credits}개를 드려요(별점 · 내용 · 공개 여부와 관계없이 같고, 이용 건마다 한 번).` : ""}
      </p>
      <p className="mt-2 flex items-start gap-2 text-[13px] leading-[1.7] text-ink-3">
        <InfoIcon className="mt-1 size-3.5 shrink-0" />
        <span>보상을 받고 쓴 후기는 공개될 때 ‘질문권 보상 제공’으로, 무료로 체험하고 쓴 후기는 ‘무료 체험 제공’으로 함께 표시돼요.</span>
      </p>

      {nothing && <p className="mt-8 rounded-2xl bg-canvas px-5 py-8 text-[15px] leading-[1.7] text-ink-2 shadow-soft">아직 후기를 쓸 수 있는 이용 건이 없어요. 심층 리포트나 사주 궁합을 받거나 미유에게 질문해 답을 받으면 여기에 나타나요.</p>}

      {view.unwritten.length > 0 && (
        <section aria-labelledby={`${idPrefix}unwritten`} className="mt-10">
          <h2 id={`${idPrefix}unwritten`} className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            아직 쓰지 않은 후기
          </h2>
          <ul className="mt-3 space-y-3">
            {view.unwritten.map((row) => (
              <UnwrittenRow key={`${row.subject.kind}-${row.subject.subjectRef}`} row={row} actions={actions} idPrefix={idPrefix} rewardCredits={view.reward.credits} minBodyChars={view.minBodyChars} open={Boolean(open && open.kind === row.subject.kind && open.ref === row.subject.subjectRef)} />
            ))}
          </ul>
        </section>
      )}

      {view.written.length > 0 && (
        <section aria-labelledby={`${idPrefix}written`} className="mt-10">
          <h2 id={`${idPrefix}written`} className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            내가 쓴 후기
          </h2>
          <ul className="mt-3 space-y-3">
            {view.written.map((row) => (
              <WrittenRow key={row.review.id} row={row} actions={actions} idPrefix={idPrefix} minBodyChars={view.minBodyChars} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
