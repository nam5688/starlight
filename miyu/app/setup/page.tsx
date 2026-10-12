import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { getSiteUrl } from "@/server/session";
import { CONNECTION_TEXT, currentStep, type FieldState, type StepState } from "@/server/setup-checks";
import { getSetupStatus } from "@/server/setup-status";

export const metadata: Metadata = {
  title: "설정 점검 · ME:U 미유",
  robots: { index: false },
};

const FIELD_LABEL: Record<FieldState, string> = { set: "입력됨", empty: "비어 있음", check: "형식 확인 필요" };
const STEP_LABEL: Record<StepState, string> = { done: "완료", todo: "할 차례", blocked: "앞 단계 후" };

/** 개발용 설정 점검. 운영 빌드(공개 배포)에서는 열리지 않는다. 키 값은 보여주지 않는다. */
export default function SetupPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      </div>
      <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[30px]">설정 점검</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
        카카오 로그인 · 결과 저장 · 테스트 결제에 필요한 설정이 어디까지 됐는지 보여줍니다. 키 값은 이 화면에 나오지 않고, 입력
        여부만 표시합니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-[16px] text-ink-2">확인하고 있어요.</p>}>
        <SetupContent />
      </Suspense>
    </main>
  );
}

async function SetupContent() {
  await connection(); // 열 때마다 현재 설정을 다시 확인한다
  const [status, siteUrl] = await Promise.all([getSetupStatus(), getSiteUrl()]);
  const now = currentStep(status.steps);
  const nowIndex = now ? status.steps.indexOf(now) + 1 : null;

  return (
    <div className="mt-8 space-y-12">
      <section aria-labelledby="setup-now" className="rounded-xl bg-accent-soft px-5 py-5 md:px-7">
        <h2 id="setup-now" className="text-[15px] font-semibold text-accent">
          지금 할 일
        </h2>
        {now ? (
          <>
            <p className="mt-1 text-[20px] font-bold tracking-tight">
              {nowIndex}. {now.title}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{now.detail}</p>
            <p className="mt-3 text-[14px] text-ink-3">
              자세한 순서는{" "}
              <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px]">miyu/docs/setup-guide.md</code>의 {nowIndex}단계를
              보세요. 끝나면 이 화면을 새로고침합니다.
            </p>
          </>
        ) : (
          <p className="mt-1 text-[18px] font-bold">로컬 설정과 테스트 결제 확인이 모두 끝났습니다.</p>
        )}
      </section>

      <section aria-labelledby="setup-urls">
        <h2 id="setup-urls" className="text-[20px] font-bold tracking-tight">
          헷갈리기 쉬운 두 주소
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          카카오 → Supabase → 미유 순서로 로그인 결과가 전달됩니다. 두 주소는 서로 다른 곳에 등록합니다.
        </p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          <UrlRow
            label="① Supabase Callback URL"
            where="카카오디벨로퍼스 › 내 앱 › 플랫폼 키 › REST API 키 › 카카오 로그인 Redirect URI"
            role="카카오가 로그인 결과를 Supabase로 보내는 주소"
            value={status.supabaseCallbackUrl ?? "https://<프로젝트 주소>.supabase.co/auth/v1/callback"}
            note={
              status.supabaseCallbackUrl
                ? "Supabase › Authentication › Providers › Kakao 화면의 Callback URL과 같은지 확인하세요."
                : "Supabase 주소를 입력하면 실제 주소로 바뀝니다. Supabase › Providers › Kakao 화면에서도 복사할 수 있습니다."
            }
          />
          <UrlRow
            label="② 미유 로그인 완료 주소"
            where="Supabase › Authentication › URL Configuration › Redirect URLs"
            role="Supabase가 로그인을 마친 사람을 미유로 돌려보내는 주소"
            value={`${siteUrl}/auth/callback`}
            note={`같은 화면의 Site URL 칸에는 다음 주소를 넣습니다: ${siteUrl} · 공개 배포 후에는 실제 주소를 추가합니다.`}
          />
        </dl>
      </section>

      <section aria-labelledby="setup-steps">
        <h2 id="setup-steps" className="text-[20px] font-bold tracking-tight">
          전체 순서
        </h2>
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {status.steps.map((step, i) => (
            <li key={step.id} className="flex gap-3 py-4">
              <span className="w-6 shrink-0 text-[15px] font-semibold tabular-nums text-ink-3">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`text-[16px] font-semibold ${step.state === "blocked" ? "text-ink-3" : ""}`}>
                    {step.title}
                  </span>
                  <span
                    className={`text-[13px] font-medium ${step.state === "done" ? "text-accent" : step.state === "todo" ? "text-ink" : "text-ink-3"}`}
                  >
                    {STEP_LABEL[step.state]}
                  </span>
                </div>
                {step.state !== "done" && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{step.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="setup-env">
        <h2 id="setup-env" className="text-[20px] font-bold tracking-tight">
          .env.local 입력 상태
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          값을 바꾼 뒤에는 개발 서버를 껐다 켜야 반영됩니다 (PowerShell에서 <kbd>Ctrl + C</kbd> 후 <code>npm run dev</code>).
        </p>
        <table className="mt-4 w-full border-y border-line text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="py-2 pr-3 font-medium">
                이름
              </th>
              <th scope="col" className="py-2 font-medium">
                상태
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {status.env.map((field) => (
              <tr key={field.name}>
                <td className="py-2.5 pr-3 align-top font-mono text-[13px] break-all">{field.name}</td>
                <td className="py-2.5 align-top">
                  <span className={field.state === "set" ? "text-accent" : field.state === "check" ? "text-danger" : "text-ink-3"}>
                    {FIELD_LABEL[field.state]}
                  </span>
                  {field.hint && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{field.hint}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[14px] leading-relaxed">
          <span className="font-semibold">Supabase 연결</span>{" "}
          {status.connection === null ? (
            <span className="text-ink-3">Supabase 값 세 개가 모두 들어가면 실제로 연결해 봅니다.</span>
          ) : (
            <span className={status.connection === "ok" ? "text-accent" : "text-danger"}>{CONNECTION_TEXT[status.connection]}</span>
          )}
        </p>
      </section>

      {Object.keys(status.tables).length > 0 && (
        <section aria-labelledby="setup-db">
          <h2 id="setup-db" className="text-[20px] font-bold tracking-tight">
            DB 상태
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {Object.entries(status.tables).map(([table, ok]) => (
              <li key={table} className="rounded-md border border-line px-2.5 py-1 text-[13px]">
                <span className="font-mono">{table}</span>{" "}
                <span className={ok ? "text-accent" : "text-danger"}>{ok ? "있음" : "없음"}</span>
              </li>
            ))}
          </ul>
          {status.counts.savedAssessments !== null && (
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              약관 동의를 마친 회원 {status.counts.completedLogins}명 · 저장된 검사 {status.counts.savedAssessments}건 · 결제
              완료(테스트) {status.counts.paidOrders}건 · 만들어진 리포트 {status.counts.readyReports}건
            </p>
          )}
        </section>
      )}

      <p className="text-[14px] text-ink-3">
        확인이 끝나면{" "}
        <Link href="/analyze" className={textLink}>
          분석 시작
        </Link>
        에서 직접 검사 → 카카오 로그인 → 저장을 해 보세요.
      </p>
    </div>
  );
}

function UrlRow({ label, where, role, value, note }: { label: string; where: string; role: string; value: string; note: string }) {
  return (
    <div className="py-4">
      <dt className="text-[16px] font-semibold">{label}</dt>
      <dd className="mt-1 space-y-1.5 text-[14px] leading-relaxed text-ink-2">
        <p>
          <span className="text-ink-3">등록 위치</span> {where}
        </p>
        <p>
          <span className="text-ink-3">역할</span> {role}
        </p>
        <p className="rounded-md bg-mist px-3 py-2 font-mono text-[13px] break-all text-ink">{value}</p>
        <p className="text-[13px] text-ink-3">{note}</p>
      </dd>
    </div>
  );
}
