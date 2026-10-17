"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteContextAction, saveContextAction, type ContextFormState } from "@/app/results/[id]/context/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { CONTEXT_FIELDS, CONTEXT_TOPICS, type PersonalContextInput } from "@/lib/personalization/context";

const PLACEHOLDER: Record<(typeof CONTEXT_FIELDS)[number]["id"], string> = {
  question: "예: 지금 회사를 옮겨도 될지, 옮긴다면 무엇을 기준으로 정해야 할지 궁금해요.",
  situation: "예: 새로운 제안이 오면 처음엔 끌리다가, 결정할 때가 되면 계속 미루게 돼요.",
  matched: "예: 결정 전에 오래 고민한다는 말은 맞았어요.",
  differed: "예: 사람을 대할 때 조심스럽다고 했는데, 친한 사람에게는 오히려 직설적이에요.",
  excerpt: "필요한 부분만 붙여넣어 주세요. 다른 사람의 이름 · 연락처는 지우고 붙여넣는 것을 권해요.",
};

const dangerButton =
  "inline-flex h-12 items-center justify-center rounded-lg border border-danger bg-canvas px-6 text-[16px] font-semibold text-danger hover:bg-mist";

const fieldClass =
  "mt-2 w-full rounded-lg border border-line-strong bg-canvas px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

/**
 * 내 고민 자세히 알려주기 — 주제만 고르면 되고, 나머지는 적고 싶은 것만.
 * 저장은 리포트를 만들지 않는다. 저장한 뒤 "이 고민으로 새 리포트 발급"을 따로 눌러야 새 리포트가 만들어진다.
 */
export function ContextForm({ assessmentId, initial, cancelHref }: { assessmentId: string; initial: PersonalContextInput | null; cancelHref: string | null }) {
  const [state, formAction, pending] = useActionState<ContextFormState, FormData>(saveContextAction.bind(null, assessmentId), {
    errors: [],
    values: null,
  });
  const start = (state.values ?? initial ?? {}) as Partial<Record<string, string>>;
  const [lengths, setLengths] = useState<Record<string, number>>(
    Object.fromEntries(CONTEXT_FIELDS.map((f) => [f.id, (start[f.id] ?? "").length])),
  );

  return (
    <div className="space-y-10">
      <form action={formAction} className="space-y-8" key={state.values ? "retry" : "first"}>
        <fieldset>
          <legend className="text-[16px] font-semibold">
            고민 주제 <span className="text-[14px] font-normal text-ink-3">하나 고르기</span>
          </legend>
          <div role="radiogroup" aria-label="고민 주제" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CONTEXT_TOPICS.map((t) => (
              <label key={t.id} className="cursor-pointer">
                <input type="radio" name="topic" value={t.id} defaultChecked={start.topic === t.id} className="peer sr-only" />
                <span className="flex min-h-12 items-center justify-center rounded-lg border border-line-strong px-2 text-center text-[15px] leading-snug peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {t.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {CONTEXT_FIELDS.map((f) => (
          <div key={f.id}>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`ctx-${f.id}`} className="text-[16px] font-semibold">
                {f.label} <span className="text-[14px] font-normal text-ink-3">선택</span>
              </label>
              <span className={`shrink-0 text-[13px] tabular-nums ${lengths[f.id] > f.limit ? "text-danger" : "text-ink-3"}`} aria-live="polite">
                {lengths[f.id]} / {f.limit}
              </span>
            </div>
            {f.id === "matched" && <p className="mt-1 text-[14px] text-ink-3">미유 무료 결과나 다른 곳에서 본 풀이를 떠올려 적어 주세요.</p>}
            <textarea
              id={`ctx-${f.id}`}
              name={f.id}
              rows={f.id === "excerpt" ? 6 : 3}
              maxLength={f.limit}
              defaultValue={start[f.id] ?? ""}
              placeholder={PLACEHOLDER[f.id]}
              onChange={(e) => setLengths((l) => ({ ...l, [f.id]: e.target.value.length }))}
              className={fieldClass}
            />
          </div>
        ))}

        <div className="rounded-lg bg-mist px-4 py-4 text-[14px] leading-relaxed text-ink-2">
          <p className="font-semibold text-ink">어떻게 쓰이나요</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>저장만으로는 리포트가 만들어지지 않고, 기존 리포트도 바뀌지 않아요. 저장한 뒤 &lsquo;이 고민으로 새 리포트 발급&rsquo;을 눌러야 새 리포트가 따로 만들어져요.</li>
            <li>해석의 초점과 예시를 고르는 데만 써요. 사주 계산은 바뀌지 않고, 알려 주신 이야기를 사주로 알아맞힌 것처럼 쓰지 않아요.</li>
            <li>전화번호 · 이메일처럼 보이는 내용은 저장할 때 가려요. 광고 · 분석 도구로 보내지 않아요.</li>
            <li>리포트를 AI로 만들 때는 이름 · 생년월일 없이 이 내용을 AI 해석 서비스에 함께 보내요.</li>
            <li>언제든 고치거나 지울 수 있어요. 새 리포트를 발급하면 그때의 고민이 기록으로 남고, 이후에 고쳐도 이미 발급한 리포트는 바뀌지 않아요.</li>
          </ul>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-[16px]">
          <input type="checkbox" name="agree" defaultChecked={Boolean(initial)} className="mt-1 size-5 shrink-0 accent-accent" />
          <span>
            <span className="mr-1.5 text-[14px] font-semibold text-ink-3">선택</span>위 내용에 동의하고, 적은 내용을 고민 반영 해석에 쓰는 데 동의합니다
          </span>
        </label>

        {state.errors.length > 0 && (
          <ul role="alert" className="space-y-1 text-[15px] font-medium text-danger">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonPrimary} w-full sm:w-auto`}>
            {pending ? "저장 중…" : initial ? "고친 내용 저장" : "저장하기"}
          </button>
          {cancelHref && (
            <Link href={cancelHref} className={`${buttonSecondary} w-full sm:w-auto`}>
              취소
            </Link>
          )}
        </div>
        <p className="text-[13px] text-ink-3">저장해도 리포트는 만들어지지 않아요. 발급은 저장한 뒤 따로 눌러요.</p>
      </form>
    </div>
  );
}

/** 현재 고민 지우기 — 이미 발급한 리포트와 고민 기록은 그대로 남는다 */
export function ContextDelete({ assessmentId }: { assessmentId: string }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <section aria-labelledby="ctx-delete" className="border-t border-line pt-6">
      <h2 id="ctx-delete" className="text-[16px] font-semibold">
        적은 고민 지우기
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">지우면 지금 적어 둔 고민이 삭제되고 되돌릴 수 없어요. 이미 발급한 리포트와 그때의 고민 기록은 그대로 남아요.</p>
      {confirmDelete ? (
        <form action={deleteContextAction.bind(null, assessmentId)} className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className={dangerButton}>
            지우기 확정
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={buttonSecondary}>
            취소
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonSecondary} mt-4`}>
          지우기
        </button>
      )}
    </section>
  );
}
