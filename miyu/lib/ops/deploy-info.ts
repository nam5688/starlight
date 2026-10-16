// 배포 정보 — 지금 돌고 있는 코드가 어느 브랜치 · 어느 커밋에서 배포된 것인지 읽는다(Vercel이 배포마다 넣어 주는 시스템 환경변수).
// 관리자 화면(/admin)에만 보이고 비밀값은 없다. 채널 독립 코드다(환경변수 객체를 받을 뿐 process를 직접 읽지 않는다).
//
// 읽는 값: VERCEL(=1) · VERCEL_ENV(production | preview | development) · VERCEL_GIT_COMMIT_REF(브랜치) · VERCEL_GIT_COMMIT_SHA(커밋) · VERCEL_GIT_REPO_OWNER · VERCEL_GIT_REPO_SLUG
// 이 값들은 Vercel 프로젝트의 "Enable access to System Environment Variables"가 켜져 있어야 들어온다(공식 문서, 2026-10-16 확인).

export type DeployWhere = "vercel-production" | "vercel-preview" | "vercel-development" | "local";

export type DeployInfo = {
  where: DeployWhere;
  branch: string | null;
  /** 커밋 전체 번호 (모양이 맞지 않으면 null) */
  commit: string | null;
  commitShort: string | null;
  commitUrl: string | null;
};

const SAFE_REF = /^[A-Za-z0-9._/-]{1,200}$/;
const SAFE_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const SAFE_SHA = /^[0-9a-f]{7,40}$/i;

export function deployInfoFrom(env: Record<string, string | undefined>): DeployInfo {
  const onVercel = env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
  const where: DeployWhere = !onVercel ? "local" : env.VERCEL_ENV === "production" ? "vercel-production" : env.VERCEL_ENV === "development" ? "vercel-development" : "vercel-preview";
  const branch = env.VERCEL_GIT_COMMIT_REF && SAFE_REF.test(env.VERCEL_GIT_COMMIT_REF) ? env.VERCEL_GIT_COMMIT_REF : null;
  const commit = env.VERCEL_GIT_COMMIT_SHA && SAFE_SHA.test(env.VERCEL_GIT_COMMIT_SHA) ? env.VERCEL_GIT_COMMIT_SHA.toLowerCase() : null;
  const owner = env.VERCEL_GIT_REPO_OWNER && SAFE_NAME.test(env.VERCEL_GIT_REPO_OWNER) ? env.VERCEL_GIT_REPO_OWNER : null;
  const slug = env.VERCEL_GIT_REPO_SLUG && SAFE_NAME.test(env.VERCEL_GIT_REPO_SLUG) ? env.VERCEL_GIT_REPO_SLUG : null;
  return {
    where,
    branch,
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    commitUrl: commit && owner && slug ? `https://github.com/${owner}/${slug}/commit/${commit}` : null,
  };
}

export const DEPLOY_WHERE_LABEL: Record<DeployWhere, string> = {
  "vercel-production": "Vercel · Production (정기 점검이 돌아요)",
  "vercel-preview": "Vercel · Preview (미리보기)",
  "vercel-development": "Vercel · Development",
  local: "내 컴퓨터(로컬)",
};

export type DeployNote = { level: "ok" | "warn"; text: string };

/** 정기 점검이 이 시간(시간)보다 오래 전에 마지막으로 실행됐으면 알린다 — Hobby는 하루 한 번이라 하루에 조금 더 여유를 둔다 */
export const CRON_STALE_HOURS = 26;

/**
 * 관리자 화면에 보일 점검 문구.
 * lastCronAt: 정기 점검의 마지막 실행 시각(운영 기록 cron.heartbeat, 없으면 null). 정기 점검은 Production 배포에서만 호출된다(Vercel 공식 문서).
 */
export function deployNotes(info: DeployInfo, lastCronAt: string | null, now: Date): DeployNote[] {
  const notes: DeployNote[] = [];
  if (info.where === "local") {
    notes.push({ level: "ok", text: "내 컴퓨터에서 실행 중이라 배포 정보는 없습니다." });
    return notes;
  }
  if (!info.commit) {
    notes.push({ level: "warn", text: "배포된 커밋 번호를 읽지 못했습니다 — Vercel 프로젝트 → Settings → Environment Variables에서 \"Enable access to System Environment Variables\"를 켜고 다시 배포하세요. 이 값이 없으면 어떤 코드가 올라갔는지 이 화면에서 확인할 수 없습니다." });
  }
  if (info.branch === "main" || info.branch === "master") {
    notes.push({ level: "warn", text: "기본 브랜치(main · master)에서 만든 배포입니다. 올리려던 작업 브랜치의 최신 커밋인지, 아래 커밋 번호를 GitHub에서 확인하세요." });
  }
  if (info.where === "vercel-preview") {
    notes.push({ level: "warn", text: "Preview(미리보기) 배포입니다. Vercel의 정기 실행(Cron)은 Production 배포에만 호출되므로, 이 배포에서는 결제 재확인 · 질문 환불 점검이 자동으로 돌지 않습니다(질문을 쓰기 직전의 환불 확인과 아래 \"지금 실행\" 버튼은 그대로 동작합니다)." });
  }
  if (info.where === "vercel-production") {
    if (!lastCronAt) {
      notes.push({ level: "warn", text: "정기 점검 실행 기록이 아직 없습니다. 배포 직후이거나, Vercel 프로젝트 → Settings → Cron Jobs에서 정기 실행이 꺼져 있거나 CRON_SECRET이 비어 있을 수 있습니다." });
    } else {
      const hours = (now.getTime() - new Date(lastCronAt).getTime()) / 3_600_000;
      if (hours > CRON_STALE_HOURS) {
        notes.push({ level: "warn", text: `정기 점검이 마지막으로 실행된 지 ${Math.floor(hours)}시간이 지났습니다. Vercel Hobby는 하루 한 번만 실행하므로 하루가 넘었다면 Cron Jobs 설정 · 로그를 확인하세요.` });
      } else {
        notes.push({ level: "ok", text: "정기 점검이 최근에 실행됐습니다." });
      }
    }
  }
  return notes;
}
