import Link from "next/link";
import type { ReactNode } from "react";
import { AssumedTag, Notice, Section, smallButton, smallCaution, smallPrimary, Stat, StatGrid, StateChip, fmtNum, fmtTime, shortId } from "@/components/admin/benefits/ui";
import { DisclosureTags, Stars } from "@/components/reviews/review-card";
import { inputClass, selectClass } from "@/components/ui/form-controls";
import { PRIVACY_FLAG_LABEL, REVIEW_ACTION_LABEL, REVIEW_KIND_LABEL, REVIEW_KINDS, REVIEW_REASONS, REVIEW_SELECTION_CRITERIA, REVIEW_STATUS_LABEL, REWARD_STATE_LABEL, type ReviewAdminAction, type ReviewKind, type ReviewStatus } from "@/lib/commerce/reviews";
import type { ReviewAdminList, ReviewStats, PrivacySuspect } from "@/lib/services/review-admin-service";
import type { ReviewAdminLogRecord, ReviewRecord } from "@/lib/services/review-ports";

// 후기 관리자 화면의 본문 — props만 받는 순수 화면 조각이다(데이터는 app/admin/reviews/page.tsx가 읽는다). 실제 화면과 개발용 미리보기가 같은 조각을 쓴다.
// 이름 · 생년월일 · 닉네임은 어디에도 없고 회원은 번호 앞 8자로만 보인다. 모든 조치는 서버에서 관리자 여부를 다시 확인하고 사유 분류와 함께 이력에 남는다.

export type AdminVoidAction = (formData: FormData) => void | Promise<void>;
export type ReviewsAdminFilters = { status?: ReviewStatus; kind?: ReviewKind; reported: boolean; days: number; page: number };
export type ReviewsAdminProps = {
  note: string;
  stats: ReviewStats | null;
  list: ReviewAdminList | null;
  scan: { ready: boolean; scanned: number; total: number; suspects: PrivacySuspect[] } | null;
  log: ReviewAdminLogRecord[] | null;
  filters: ReviewsAdminFilters;
  /** 필터 · 쪽 이동 링크 — 현재 값에 patch를 덮어 만든다(null이면 뺀다) */
  hrefFor: (patch: Record<string, string | number | null>) => string;
  actions: { apply: AdminVoidAction; retryRewards: AdminVoidAction };
  idPrefix?: string;
};

const pct = (v: number | null) => (v === null ? "-" : `${fmtNum(v, 1)}%`);

function SpreadRow({ label, s }: { label: string; s: ReviewStats["spread"]["written"] }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2 pr-3 text-left font-medium">
        {label}
      </th>
      <td className="py-2 pr-3 tabular-nums">{s.total}</td>
      {s.counts.map((c, i) => (
        <td key={i} className="py-2 pr-3 tabular-nums">
          {c}
        </td>
      ))}
      <td className="py-2 tabular-nums">{s.average === null ? "-" : fmtNum(s.average)}</td>
    </tr>
  );
}

/** 한 후기에 할 수 있는 조치 폼 — 조치마다 사유 분류 목록이 다르다(자바스크립트 없이 동작). 사유 분류는 필수이고 "부정적인 내용"은 분류에 없다 */
function ActionForm({ action, reviewId, kind, run, idPrefix }: { action: ReviewAdminAction; reviewId: string; kind: "primary" | "caution" | "plain"; run: AdminVoidAction; idPrefix: string }) {
  const id = `${idPrefix}${action}-${reviewId}`;
  const button = kind === "caution" ? smallCaution : kind === "primary" ? smallPrimary : smallButton;
  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-line-strong bg-canvas px-3 text-[14px] font-semibold hover:bg-mist [&::-webkit-details-marker]:hidden">{REVIEW_ACTION_LABEL[action]}</summary>
      <form action={run} className="mt-2 w-full min-w-[16rem] max-w-sm space-y-2 rounded-xl bg-mist px-3 py-3">
        <input type="hidden" name="id" value={reviewId} />
        <input type="hidden" name="action" value={action} />
        <label htmlFor={`${id}-reason`} className="block text-[13px] font-medium text-ink-2">
          사유 분류(필수)
        </label>
        <select id={`${id}-reason`} name="reason" required defaultValue="" className={selectClass()}>
          <option value="" disabled>
            선택해 주세요
          </option>
          {REVIEW_REASONS[action].map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-memo`} className="block text-[13px] font-medium text-ink-2">
          메모(기타일 때 필수 · 후기 글을 옮겨 적지 마세요)
        </label>
        <input id={`${id}-memo`} name="memo" type="text" maxLength={120} autoComplete="off" className={inputClass()} />
        {action === "delete" && <p className="text-[13px] leading-snug text-caution">글이 지워지고 회원이 다시 쓸 수 없어요. 이미 준 질문권은 그대로예요.</p>}
        <button type="submit" className={button}>
          {REVIEW_ACTION_LABEL[action]} 실행
        </button>
      </form>
    </details>
  );
}

function RowActions({ review, openReports, run, idPrefix }: { review: Pick<ReviewRecord, "id" | "status" | "featured">; openReports: number; run: AdminVoidAction; idPrefix: string }) {
  const s = review.status;
  if (s === "deleted") return <p className="text-[13px] text-ink-3">삭제된 후기라 할 수 있는 조치가 없어요.</p>;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {(s === "published" || s === "private") && <ActionForm action="hide" reviewId={review.id} kind="caution" run={run} idPrefix={idPrefix} />}
      {s === "hidden" && <ActionForm action="unhide" reviewId={review.id} kind="plain" run={run} idPrefix={idPrefix} />}
      <ActionForm action="delete" reviewId={review.id} kind="caution" run={run} idPrefix={idPrefix} />
      {s === "published" && !review.featured && <ActionForm action="feature" reviewId={review.id} kind="primary" run={run} idPrefix={idPrefix} />}
      {review.featured && <ActionForm action="unfeature" reviewId={review.id} kind="plain" run={run} idPrefix={idPrefix} />}
      {openReports > 0 && <ActionForm action="dismiss_reports" reviewId={review.id} kind="plain" run={run} idPrefix={idPrefix} />}
    </div>
  );
}

function ReviewRow({ row, run, idPrefix }: { row: ReviewAdminList["rows"][number]; run: AdminVoidAction; idPrefix: string }) {
  const r = row.review;
  return (
    <li id={`${idPrefix}rv-${r.id}`} className="scroll-mt-20 rounded-xl bg-canvas p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[14px] font-semibold">{REVIEW_KIND_LABEL[r.kind]}</span>
        {r.status !== "deleted" && <Stars rating={r.rating} />}
        <StateChip tone={r.status === "published" ? "on" : r.status === "hidden" || r.status === "deleted" ? "warn" : "off"}>{REVIEW_STATUS_LABEL[r.status]}</StateChip>
        {r.featured && <StateChip tone="on">메인 선정</StateChip>}
        {row.openReports > 0 && <StateChip tone="warn">신고 {row.openReports}건</StateChip>}
        {row.flags.length > 0 && <StateChip tone="warn">개인정보 의심</StateChip>}
        <span className="ml-auto text-[13px] text-ink-3">
          회원 {row.userShort} · {fmtTime(r.createdAt)}
        </span>
      </div>
      {r.status === "deleted" ? <p className="mt-2 text-[14px] text-ink-3">글이 지워진 후기(묘비)예요 · 삭제한 쪽: {r.deletedBy === "admin" ? "운영자" : "작성자"}{r.deletedAt ? ` · ${fmtTime(r.deletedAt)}` : ""}</p> : <p className="mt-2 text-[15px] leading-[1.7] break-words whitespace-pre-line">{r.body || "(내용 없음)"}</p>}
      {row.flags.length > 0 && <p className="mt-1.5 text-[13px] text-caution">의심 표현: {row.flags.map((f) => PRIVACY_FLAG_LABEL[f]).join(" · ")} (후보일 뿐이에요 — 글을 읽고 정해 주세요)</p>}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-3">공개 동의</dt>
        <dd>{r.publicConsent ? `동의함 · ${fmtTime(r.consentedAt)}` : "동의하지 않음(나만 보기)"} · 저장할 때 본 공개 전 안내 판 {r.consentNoticeVersion ?? "-"}</dd>
        <dt className="text-ink-3">대가 표시</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {r.disclosure === "none" && !r.freeTrial ? "없음" : <DisclosureTags review={r} />}
        </dd>
        <dt className="text-ink-3">보상</dt>
        <dd>
          {REWARD_STATE_LABEL[r.rewardState]}
          {r.rewardState === "granted" ? ` · 질문권 ${r.rewardCredits}개 · ${fmtTime(r.rewardedAt)}` : ""}
          {r.rewardOpKey ? ` · 지급 키 ${r.rewardOpKey.slice(0, 15)}` : ""}
        </dd>
        {r.hiddenReason && (
          <>
            <dt className="text-ink-3">운영자 사유</dt>
            <dd>{[...REVIEW_REASONS.hide, ...REVIEW_REASONS.delete].find((x) => x.code === r.hiddenReason)?.label ?? r.hiddenReason}</dd>
          </>
        )}
      </dl>
      <div className="mt-3">
        <RowActions review={r} openReports={row.openReports} run={run} idPrefix={idPrefix} />
      </div>
    </li>
  );
}

const STATUS_FILTERS: { value: ReviewStatus | null; label: string }[] = [
  { value: null, label: "전체" },
  { value: "published", label: "공개 중" },
  { value: "private", label: "나만 보기" },
  { value: "hidden", label: "숨김" },
  { value: "deleted", label: "삭제됨" },
];

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 text-[14px] font-semibold ${active ? "border-accent bg-accent text-white" : "border-line-strong bg-canvas hover:bg-mist"}`}>
      {children}
    </Link>
  );
}

export function ReviewsAdminView({ note, stats, list, scan, log, filters, hrefFor, actions, idPrefix = "" }: ReviewsAdminProps) {
  const notReady = list !== null && !list.ready;
  return (
    <div className="mt-6 space-y-10">
      <p className="text-[14px] leading-relaxed text-ink-3">
        이용 후기를 보고 숨김 · 삭제 · 메인 선정 · 신고를 처리하는 화면입니다. 이름 · 생년월일은 어디에도 없고 회원은 번호 앞 8자로만 보입니다. 모든 조치는 서버에서 관리자 여부를 다시 확인하고 사유 분류와 함께 이력(후기 글은 복사하지 않음)과 운영 기록(후기 번호만)에 남습니다.
      </p>
      <Notice tone="info" label="원칙">
        부정적인 내용이라는 이유만으로 후기를 숨기거나 지우지 않습니다 — 사유 분류에 그런 항목이 없고, 개인정보 노출 · 욕설 혐오 · 허위 광고 · 신고 처리 같은 정해진 분류만 고를 수 있습니다.
      </Notice>
      {note && (
        <p role="status" className="rounded-md bg-mist px-4 py-3 text-[14px]">
          {note}
        </p>
      )}
      {notReady && (
        <Notice tone="warn" label="준비 중">
          DB 변경 25번(후기 표)을 아직 적용하지 않은 상태예요. 아래 숫자 · 목록이 비어 있고 아무 동작도 하지 않아요. 적용 방법은 miyu/docs/review-system-v1.md에 있어요.
        </Notice>
      )}

      {stats && !notReady && (
        <Section id={`${idPrefix}stats`} title="전환 분석" hint={`최근 ${stats.sinceDays}일 · 직접 센 값과 가정을 구분해 보여요. 열람 · 클릭 기록은 추적 거부(DNT · GPC)와 쿠키 차단 방문자가 빠져 실제보다 적어요.`}>
          <nav aria-label="집계 기간" className="mb-3 flex flex-wrap items-center gap-2 text-[14px]">
            <span className="text-ink-3">집계 기간</span>
            {[7, 30, 90].map((d) => (
              <FilterLink key={d} href={hrefFor({ days: d, page: null })} active={d === filters.days}>
                최근 {d}일
              </FilterLink>
            ))}
          </nav>
          <StatGrid cols={3}>
            <Stat label="후기 영역을 본 방문자" value={stats.funnel.viewers} sub="메인 후기 영역이 화면에 보인 익명 방문자 수" />
            <Stat label="전체 후기 클릭" value={stats.funnel.clickers} sub={`클릭률 ${pct(stats.funnel.clickRate)} (본 방문자 중, 본 뒤에 누른 비율)`} />
            <Stat label="본 뒤 무료 분석 시작" value={stats.funnel.starters} sub={`시작률 ${pct(stats.funnel.startRate)} (본 방문자 중, 본 뒤 같은 방문 번호의 분석 시작)`} />
            <Stat label="후기 작성률" value={pct(stats.writeRate.overall.rate)} sub={`적격 건 ${stats.writeRate.overall.eligible}건 중 ${stats.writeRate.overall.written}건에 후기(이 기간에 생긴 이용 건 기준, 삭제한 후기도 센다)`} />
            <Stat label="보상 질문권 지급" value={`${stats.reward.creditsGranted}개`} sub={`후기 ${stats.reward.reviewsRewarded}건 · 확인 중 ${stats.reward.pending} · 실패 ${stats.reward.failed}`} />
            <Stat
              label="보상 질문권의 AI 원가(어림)"
              value={`${fmtNum(stats.reward.aiCostKrw)}원`}
              sub={
                <>
                  질문 1개 {fmtNum(stats.reward.unitCostKrw)}원 × 지급 수 · 지급한 질문권이 모두 쓰였다고 본 상한
                  <AssumedTag>{stats.reward.unitCostSource === "measured" ? "측정" : "가정"}</AssumedTag>
                </>
              }
            />
          </StatGrid>
          <div className="mt-3">
            <Notice tone="warn" label="후기 열람 후 유료 결제율">
              {stats.paidAfterView.reason}
            </Notice>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-[14px] font-medium text-ink-2 underline underline-offset-4">종류별 작성률 · 별점 분포 · 후기 수</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-[13px]">
                <thead>
                  <tr className="text-ink-3">
                    <th scope="col" className="pb-2 pr-3 font-medium">
                      종류
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-medium">
                      적격 건
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-medium">
                      후기 있음
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      작성률
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {REVIEW_KINDS.map((k) => (
                    <tr key={k} className="border-t border-line">
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        {REVIEW_KIND_LABEL[k]}
                      </th>
                      <td className="py-2 pr-3 tabular-nums">{stats.writeRate.byKind[k].eligible}</td>
                      <td className="py-2 pr-3 tabular-nums">{stats.writeRate.byKind[k].written}</td>
                      <td className="py-2 tabular-nums">{pct(stats.writeRate.byKind[k].rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-3">메인에 보이는 후기가 전체와 한쪽으로 치우치지 않았는지 별점 분포를 나란히 봅니다(별점 1~5점 개수).</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-[13px]">
                <thead>
                  <tr className="text-ink-3">
                    <th scope="col" className="pb-2 pr-3 font-medium">
                      범위
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-medium">
                      후기 수
                    </th>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <th key={n} scope="col" className="pb-2 pr-3 font-medium">
                        {n}점
                      </th>
                    ))}
                    <th scope="col" className="pb-2 font-medium">
                      평균
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <SpreadRow label="작성한 후기 전체" s={stats.spread.written} />
                  <SpreadRow label="공개 중인 후기" s={stats.spread.published} />
                  <SpreadRow label="메인에 보일 후기" s={stats.spread.home} />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">
              후기 {stats.counts.written}건(공개 {stats.counts.published} · 나만 보기 {stats.counts.private} · 숨김 {stats.counts.hidden}) · 삭제 묘비 {stats.counts.deleted} · 메인 선정 {stats.counts.featured} · 신고가 열린 후기 {stats.counts.reportedReviews}
            </p>
          </details>
          {(stats.reward.pending > 0 || stats.reward.failed > 0) && (
            <form action={actions.retryRewards} className="mt-3 flex flex-wrap items-center gap-3">
              <button type="submit" className={smallButton}>
                보상 미확정 후기 다시 맞추기
              </button>
              <span className="text-[13px] text-ink-3">같은 지급 키라 질문권은 한 번만 들어가요. 보상 스위치가 꺼져 있으면 아무것도 하지 않아요.</span>
            </form>
          )}
        </Section>
      )}

      <Section id={`${idPrefix}criteria`} title="선정 기준" hint="메인에서 먼저 보이는 후기를 고르는 기준이에요. 선정 · 해제는 모두 사유 분류와 함께 아래 이력에 남아요.">
        <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed">
          {REVIEW_SELECTION_CRITERIA.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>

      {scan && scan.ready && (
        <Section id={`${idPrefix}scan`} title="공개 후기 개인정보 점검" hint={`공개 중인 후기 ${scan.total}건 가운데 ${scan.scanned}건의 글을 연락처 · 이메일 · 긴 숫자 · 생년월일 · 주소 · 계정 아이디 표현으로 다시 훑었어요. 의심 후보일 뿐 판정이 아니에요.`}>
          {scan.suspects.length === 0 ? (
            <Notice tone="ok" label="의심 후보 없음">
              점검한 {scan.scanned}건에서 의심되는 표현을 찾지 못했어요(찾지 못했다는 뜻이지 개인정보가 없다는 보증은 아니에요).
            </Notice>
          ) : (
            <ul className="space-y-3">
              {scan.suspects.map((s) => (
                <li key={s.review.id} className="rounded-xl bg-canvas p-4 shadow-soft">
                  <p className="flex flex-wrap items-center gap-2 text-[13px]">
                    <StateChip tone="warn">개인정보 의심</StateChip>
                    <span className="font-medium">{REVIEW_KIND_LABEL[s.review.kind]}</span>
                    <span className="text-ink-3">{s.flags.map((f) => PRIVACY_FLAG_LABEL[f]).join(" · ")}</span>
                  </p>
                  <p className="mt-2 text-[15px] leading-[1.7] break-words whitespace-pre-line">{s.review.body}</p>
                  <div className="mt-3">
                    <RowActions review={{ id: s.review.id, status: "published", featured: s.review.featured }} openReports={0} run={actions.apply} idPrefix={`${idPrefix}scan-`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section id={`${idPrefix}list`} title="후기 목록" hint="최근 것이 먼저예요. 나만 보기 후기도 운영 기록 용도로 여기서 읽을 수 있어요.">
        <nav aria-label="후기 상태 필터" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <FilterLink key={f.value ?? "all"} href={hrefFor({ status: f.value, page: null })} active={(filters.status ?? null) === f.value}>
              {f.label}
            </FilterLink>
          ))}
          <FilterLink href={hrefFor({ reported: filters.reported ? null : 1, page: null })} active={filters.reported}>
            신고가 열린 후기
          </FilterLink>
        </nav>
        <nav aria-label="후기 종류 필터" className="mt-2 flex flex-wrap gap-2">
          <FilterLink href={hrefFor({ kind: null, page: null })} active={!filters.kind}>
            모든 종류
          </FilterLink>
          {REVIEW_KINDS.map((k) => (
            <FilterLink key={k} href={hrefFor({ kind: k, page: null })} active={filters.kind === k}>
              {REVIEW_KIND_LABEL[k]}
            </FilterLink>
          ))}
        </nav>
        {list === null ? (
          <div className="mt-4">
            <Notice tone="warn" label="불러오지 못했어요">
              후기 목록을 읽지 못했어요. 서버 기록에 오류가 남았어요. 아무것도 바뀌지 않았어요.
            </Notice>
          </div>
        ) : list.rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-canvas px-4 py-6 text-[14px] text-ink-2 shadow-soft">조건에 맞는 후기가 없어요.</p>
        ) : (
          <>
            <p className="mt-4 text-[13px] text-ink-3" aria-live="polite">
              {list.total}건 · {list.page} / {list.pages}쪽
            </p>
            <ul className="mt-2 space-y-3">
              {list.rows.map((row) => (
                <ReviewRow key={row.review.id} row={row} run={actions.apply} idPrefix={idPrefix} />
              ))}
            </ul>
            {list.pages > 1 && (
              <nav aria-label="후기 쪽 이동" className="mt-4 flex items-center justify-between gap-3">
                {list.page > 1 ? (
                  <Link href={hrefFor({ page: list.page - 1 })} className={smallButton}>
                    이전
                  </Link>
                ) : (
                  <span />
                )}
                {list.page < list.pages ? (
                  <Link href={hrefFor({ page: list.page + 1 })} className={smallButton}>
                    다음
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </Section>

      <Section id={`${idPrefix}log`} title="운영자 조치 · 선정 이력" hint="숨김 · 숨김 해제 · 삭제 · 메인 선정 · 선정 해제 · 신고 기각이 쌓여요. 사유 분류만 있고 후기 글은 복사하지 않아요(최근 50건).">
        {log === null || log.length === 0 ? (
          <p className="rounded-xl bg-canvas px-4 py-6 text-[14px] text-ink-2 shadow-soft">아직 조치 이력이 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-[13px]">
              <thead>
                <tr className="text-ink-3">
                  {["시각", "운영자", "조치", "사유 분류", "메모", "후기"].map((h) => (
                    <th key={h} scope="col" className="pb-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmtTime(l.createdAt)}</td>
                    <td className="py-2 pr-3 tabular-nums">{shortId(l.adminId)}</td>
                    <td className="py-2 pr-3 font-medium">{REVIEW_ACTION_LABEL[l.action]}</td>
                    <td className="py-2 pr-3">{REVIEW_REASONS[l.action].find((r) => r.code === l.reasonCode)?.label ?? l.reasonCode}</td>
                    <td className="py-2 pr-3">{l.memo ?? "-"}</td>
                    <td className="py-2 tabular-nums">{shortId(l.reviewId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
