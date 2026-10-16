"use client";

import { useState, useTransition } from "react";
import { runScenarioLabAction } from "@/app/dev/scenario/actions";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import type { LabResult } from "@/server/dev-scenario";

// 장면 질문 시험 화면(개발용) — 10장면에 직접 답하고 풀이를 읽는다. 저장하지 않는다. 답은 점수로 바뀌지 않는다.

type Scene = { id: string; ask: string; options: { id: string; text: string }[] };
type Preset = { key: string; label: string; answers: Record<string, string | undefined> };
type PersonKind = "seoyun" | "p01" | "own";

const field = "mt-1 h-11 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[16px]";

export function ScenarioLab({ scenes, presets, live, liveReason }: { scenes: Scene[]; presets: Preset[]; live: boolean; liveReason: string }) {
  const [person, setPerson] = useState<PersonKind>("seoyun");
  const [own, setOwn] = useState({ year: "", month: "", day: "", time: "", gender: "female" });
  const [mbti, setMbti] = useState("INFJ");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LabResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [liveAsk, setLiveAsk] = useState(false);

  const answered = scenes.filter((s) => answers[s.id]).length;

  const payload = () => ({ person: person === "own" ? { kind: "own", ...own } : { kind: person }, mbti, answers });
  const run = (source: "saved" | "live") =>
    start(async () => {
      setError(null);
      setLiveAsk(false);
      const r = await runScenarioLabAction(payload(), source);
      if (r.ok) setResult(r.result);
      else {
        setResult(null);
        setError(r.reason);
      }
    });

  return (
    <div className="mt-8">
      <section aria-labelledby="lab-person">
        <h2 id="lab-person" className="text-[18px] font-semibold">1. 누구의 사주로 볼까요</h2>
        <div className="mt-3 grid gap-2">
          {([
            ["seoyun", "서윤 (가상 인물)"],
            ["p01", "다른 사주 · P01 (가상 인물)"],
            ["own", "내 생년월일 (저장하지 않아요 · 사주만 그 자리에서 계산하고 버려요)"],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-canvas px-3 text-[16px]">
              <input type="radio" name="lab-person" checked={person === k} onChange={() => setPerson(k)} className="size-5 accent-[var(--color-accent)]" />
              {label}
            </label>
          ))}
        </div>
        {person === "own" && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-[14px] text-ink-2">연도<input inputMode="numeric" className={field} value={own.year} onChange={(e) => setOwn({ ...own, year: e.target.value })} placeholder="1994" /></label>
            <label className="text-[14px] text-ink-2">월<input inputMode="numeric" className={field} value={own.month} onChange={(e) => setOwn({ ...own, month: e.target.value })} placeholder="11" /></label>
            <label className="text-[14px] text-ink-2">일<input inputMode="numeric" className={field} value={own.day} onChange={(e) => setOwn({ ...own, day: e.target.value })} placeholder="7" /></label>
            <label className="col-span-2 text-[14px] text-ink-2">태어난 시각(모르면 비워 두세요)<input className={field} value={own.time} onChange={(e) => setOwn({ ...own, time: e.target.value })} placeholder="08:40" /></label>
            <label className="text-[14px] text-ink-2">성별<select className={field} value={own.gender} onChange={(e) => setOwn({ ...own, gender: e.target.value })}><option value="female">여성</option><option value="male">남성</option></select></label>
          </div>
        )}
        <label className="mt-3 block text-[14px] text-ink-2">
          내가 아는 MBTI(입력한 정보예요, 검사 결과가 아니에요 · 비워도 돼요)
          <input className={field} value={mbti} onChange={(e) => setMbti(e.target.value)} maxLength={4} placeholder="INFJ" />
        </label>
      </section>

      <section aria-labelledby="lab-scenes" className="mt-10">
        <h2 id="lab-scenes" className="text-[18px] font-semibold">2. 장면 10개에 답해 주세요</h2>
        <p className="mt-1 text-[14px] leading-[1.7] text-ink-3">실제로 한 행동에 가장 가까운 것을 고르세요. 좋고 나쁜 답은 없어요. 겪은 적이 없으면 “이런 일이 거의 없었어요”, 맞는 답이 없으면 “맞는 선택지가 없어요”를 고르세요(이 둘은 근거로 쓰지 않아요).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.key} type="button" onClick={() => { setAnswers(Object.fromEntries(Object.entries(p.answers).filter(([, v]) => v) as [string, string][])); setPerson("seoyun"); setMbti("INFJ"); }} className={`${buttonSecondary} h-auto min-h-11 px-4 py-2 text-[14px]`}>
              {p.label} 채우기
            </button>
          ))}
          <button type="button" onClick={() => setAnswers({})} className={`${buttonSecondary} h-auto min-h-11 px-4 py-2 text-[14px]`}>모두 지우기</button>
        </div>
        <ol className="mt-5 grid gap-6">
          {scenes.map((s, i) => (
            <li key={s.id}>
              <fieldset>
                <legend className="text-[16px] leading-[1.6] font-semibold">
                  {i + 1}. {s.ask}
                </legend>
                <div className="mt-2 grid gap-2">
                  {[...s.options, { id: "x", text: "이런 일이 거의 없었어요" }, { id: "y", text: "맞는 선택지가 없어요" }].map((o) => (
                    <label key={o.id} className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-[16px] leading-[1.5] ${answers[s.id] === o.id ? "border-accent bg-accent-soft" : "border-line bg-canvas"} ${o.id === "x" || o.id === "y" ? "text-ink-2" : ""}`}>
                      <input type="radio" name={`lab-${s.id}`} checked={answers[s.id] === o.id} onChange={() => setAnswers({ ...answers, [s.id]: o.id })} className="size-5 shrink-0 accent-[var(--color-accent)]" />
                      {o.text}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="lab-run" className="mt-10">
        <h2 id="lab-run" className="text-[18px] font-semibold">3. 풀이 보기</h2>
        <p className="mt-1 text-[14px] text-ink-3">답한 장면 {answered}/{scenes.length}개 — 비워 둔 장면은 “답하지 않음”으로 다루고 근거를 만들지 않아요.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button type="button" disabled={pending} onClick={() => run("saved")} className={buttonSecondary}>저장된 시험 글 보기 (AI 호출 없음)</button>
          {live ? (
            liveAsk ? (
              <button type="button" disabled={pending} onClick={() => run("live")} className={buttonPrimary}>네, 실제 AI를 지금 부를게요 (호출 1~3회)</button>
            ) : (
              <button type="button" disabled={pending} onClick={() => setLiveAsk(true)} className={buttonPrimary}>실제 AI로 새로 쓰기</button>
            )
          ) : (
            <p className="rounded-lg border border-line bg-mist p-3 text-[14px] leading-[1.7] text-ink-2">실제 AI로 새로 쓰기는 닫혀 있어요. {liveReason}</p>
          )}
        </div>
        {liveAsk && <p className="mt-2 text-[14px] leading-[1.7] text-ink-2">누르면 운영 리포트와 같은 생성기로 Claude를 부르고 비용이 들어요(검사에 걸리면 고쳐 쓰느라 한 번 더 부를 수 있어요). 승인한 금액 · 호출 수를 넘으면 호출하지 않아요.</p>}
        {pending && <p role="status" className="mt-3 text-[15px] text-ink-2">만들고 있어요. 실제 AI는 몇 분 걸릴 수 있어요.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg border border-line-strong bg-caution-soft p-3 text-[15px] leading-[1.7]">{error}</p>}
      </section>

      {result && <ResultView result={result} />}
    </div>
  );
}

const Fold = ({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) => (
  <details data-fold open={open} className="rounded-lg border border-line bg-canvas px-4 py-3">
    <summary className="cursor-pointer text-[15px] font-semibold">{title}</summary>
    <div className="mt-3 text-[14px] leading-[1.75] text-ink-2">{children}</div>
  </details>
);

function ResultView({ result: r }: { result: LabResult }) {
  const modeLabel = r.mode === "live-ai" ? "실제 AI가 쓴 글" : r.mode === "saved-proxy" ? "저장된 시험 글 · 실제 서비스 AI가 아님" : "글 없음";
  return (
    <section aria-labelledby="lab-result" className="mt-12">
      <h2 id="lab-result" className="text-[20px] font-semibold">결과 · {modeLabel}</h2>
      <p className="mt-2 rounded-lg border border-line bg-mist p-3 text-[14px] leading-[1.75] text-ink-2">{r.note} (지시문 {r.promptVersion})</p>
      {r.error && <p role="alert" className="mt-3 rounded-lg border border-line-strong bg-caution-soft p-3 text-[15px] leading-[1.7]">생성하지 못했어요: {r.error}</p>}

      <div className="mt-4 grid gap-3">
        <Fold title={`이번 답에서 읽힌 구분 ${r.threads.filter((t) => t.status === "read").length}/${r.threads.length}`} open>
          <ul className="grid gap-3">
            {r.threads.map((t) => (
              <li key={t.id}>
                <p className="font-semibold text-ink">{t.name} · {t.status === "read" ? "읽힘" : "읽지 않음"}</p>
                {t.status === "read" ? <p>{t.reading}</p> : <p>두 장면 중 {t.missing.join(" · ")}에 선택지를 고르지 않아 이 구분은 근거를 만들지 않아요(“자료 없음” 문장도 쓰지 않고 사주만으로 풀이해요).</p>}
              </li>
            ))}
          </ul>
        </Fold>
        <Fold title={`리포트 AI가 받는 응답 근거 ${r.evidence.length}개`}>
          {r.evidence.length === 0 ? <p>응답 근거가 없어요 — 사주 근거만으로 풀이해요.</p> : (
            <ul className="grid gap-3">
              {r.evidence.map((e) => (
                <li key={e.id}>
                  <p className="font-semibold text-ink">{e.id}</p>
                  <p>{e.fact}</p>
                  <p className="mt-1 text-ink-3">{e.cue}</p>
                </li>
              ))}
            </ul>
          )}
        </Fold>
        {r.rounds.length > 0 && (
          <Fold title={`생성 과정 · 검사에 걸린 ${r.rounds.length}번`} open>
            <ul className="grid gap-3">
              {r.rounds.map((x, i) => (
                <li key={i}>
                  <p className="font-semibold text-ink">{r.mode === "saved-proxy" ? "고치기 전 글" : `${x.round + 1}번째 시도`}에서 걸린 것</p>
                  {x.errors.length === 0 ? <p>걸린 것이 없었어요.</p> : <ul className="mt-1 grid gap-1">{x.errors.map((e, j) => <li key={j}>· {e}</li>)}</ul>}
                </li>
              ))}
            </ul>
          </Fold>
        )}
        {r.report && (
          <>
            <Fold title={`지어내지 않았나(통과 · 실패) — ${r.integrity.length === 0 ? "통과" : `실패 ${r.integrity.length}건`}`} open={r.integrity.length > 0}>
              {r.integrity.length === 0 ? <p>답하지 않은 장면의 행동을 사실처럼 쓰거나 고른 선택지 문장을 그대로 옮긴 곳이 검사에서 발견되지 않았어요(정규식을 센 어림이라 다른 말로 바꿔 쓴 것은 못 찾아요 — 직접 읽어 보세요).</p> : <ul className="grid gap-1">{r.integrity.map((e, j) => <li key={j}>· {e}</li>)}</ul>}
            </Fold>
            <Fold title={`새로 알게 해 주나(별도 기준) — 검사에서 ${r.quality.length === 0 ? "걸린 것 없음" : `${r.quality.length}건`}`} open={r.quality.length > 0}>
              {r.quality.length === 0 ? <p>답을 나열한 제목이나 얼버무린 양자택일은 찾지 못했어요. 이것이 “새로 알게 해 준다”는 뜻은 아니에요 — 읽고 판단해 주세요.</p> : <ul className="grid gap-1">{r.quality.map((e, j) => <li key={j}>· {e}</li>)}</ul>}
              {r.repeats.length > 0 && <p className="mt-2">같은 표현이 되풀이된 곳: {r.repeats.join(" / ")}</p>}
              {r.depthFlags.length > 0 && <ul className="mt-2 grid gap-1">{r.depthFlags.map((e, j) => <li key={j}>· 내용 검사 {e}</li>)}</ul>}
            </Fold>
            <Fold title="근거 구분 — 주제마다 사주 · 응답 · 입력 정보">
              <ul className="grid gap-1">
                {r.sourceMix.map((m) => (
                  <li key={m.block}>
                    <b className="text-ink">{m.block}</b> — {m.kind} (사주 {m.saju} · 응답 {m.response} · 입력 정보 {m.selfInput})
                    {m.citedButUnused.length > 0 && <span className="text-ink-3"> · 응답 근거 {m.citedButUnused.join(", ")}를 달았지만 글에서 그 장면을 쓰지 않았어요</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-ink-3">“사주 + 응답”은 한 주제 안에서 두 근거를 이어 읽은 풀이라는 뜻이에요. 문장마다 어느 근거인지는 가르지 못해요.</p>
            </Fold>
          </>
        )}
        {r.usage && (
          <Fold title={`호출 ${r.usage.calls}회 · 비용 어림 ${r.usage.costKrw === null ? "알 수 없음" : `${r.usage.costKrw.toLocaleString()}원`}`}>
            입력 {r.usage.inputTokens.toLocaleString()} · 출력 {r.usage.outputTokens.toLocaleString()}토큰 · 결과 {r.usage.outcomes.join(" → ") || "없음"}. 사용 기록에는 토큰 수와 비용 어림만 남고 글은 남지 않아요(승인 합계에 들어가요).
          </Fold>
        )}
      </div>

      {r.report && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-line">
          <ReadingReportView report={r.report} idPrefix="lab-" />
        </div>
      )}
    </section>
  );
}
