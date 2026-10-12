#!/usr/bin/env node
// 의존성 점검 — 운영에 들어가는 패키지의 라이선스, 알려진 보안 취약점, 새 버전(업데이트 영향)을 한 번에 본다. 새 도구를 설치하지 않는다.
// 실행: npm run deps   (인터넷 필요 — npm 보안 정보 · 최신 버전 조회)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const run = (args) => {
  try {
    return execFileSync("npm", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return e.stdout ?? ""; // audit · outdated는 문제가 있으면 종료 코드가 0이 아니다
  }
};

// 1) 운영에 들어가는 패키지(개발 도구 제외)와 라이선스
const ALLOWED = /^(MIT|ISC|Apache-2\.0|BSD-[23]-Clause|0BSD|BlueOak-1\.0\.0|CC0-1\.0|CC-BY-4\.0|Python-2\.0|Unlicense|OFL-1\.1|MPL-2\.0|\(.*\))$/;
const tree = JSON.parse(run(["ls", "--omit=dev", "--all", "--json", "--long"]) || "{}");
const seen = new Map();
(function walk(deps) {
  for (const [name, info] of Object.entries(deps ?? {})) {
    if (!info.version) continue; // 이 컴퓨터에 설치되지 않은 선택 패키지(다른 운영체제용 실행 파일 등)
    const key = `${name}@${info.version}`;
    if (!seen.has(key)) {
      let license = info.license;
      if (!license) {
        try {
          license = JSON.parse(fs.readFileSync(path.join(info.path ?? path.join(root, "node_modules", name), "package.json"), "utf8")).license;
        } catch {
          license = undefined;
        }
      }
      seen.set(key, typeof license === "string" ? license : JSON.stringify(license ?? "알 수 없음"));
    }
    walk(info.dependencies);
  }
})(tree.dependencies);
const byLicense = {};
for (const [pkg, lic] of seen) (byLicense[lic] ??= []).push(pkg);
console.log(`## 운영 패키지 라이선스 (${seen.size}개)`);
const NOTES = {
  "LGPL-3.0-or-later": "sharp(이미지 처리)가 함께 쓰는 libvips 실행 파일. 서버에서 수정 없이 쓰는 경우이며 브라우저로 배포하지 않는다 — 허용 범위로 본다(공개 전 변경 · 재배포 계획이 생기면 다시 확인)",
};
for (const [lic, pkgs] of Object.entries(byLicense).sort((a, b) => b[1].length - a[1].length)) {
  const ok = ALLOWED.test(lic);
  if (!ok && Object.keys(NOTES).some((k) => lic.includes(k))) {
    console.log(`- 검토됨: ${lic} — ${pkgs.length}개 (${pkgs.join(", ")})\n    ${NOTES["LGPL-3.0-or-later"]}`);
    continue;
  }
  console.log(`- ${ok ? "허용" : "확인 필요"}: ${lic} — ${pkgs.length}개${ok && pkgs.length > 6 ? "" : ` (${pkgs.slice(0, 8).join(", ")}${pkgs.length > 8 ? " …" : ""})`}`);
}

// 2) 알려진 보안 취약점 (운영 패키지만)
const audit = JSON.parse(run(["audit", "--omit=dev", "--json"]) || "{}");
const v = audit.metadata?.vulnerabilities ?? {};
console.log("\n## 보안 취약점 (npm audit --omit=dev)");
console.log(audit.metadata ? `- 심각 ${v.critical ?? 0} · 높음 ${v.high ?? 0} · 보통 ${v.moderate ?? 0} · 낮음 ${v.low ?? 0}` : "- 조회하지 못했습니다 (인터넷 · npm 설정 확인)");
for (const [name, info] of Object.entries(audit.vulnerabilities ?? {})) console.log(`  - ${name}: ${info.severity} (${info.range})`);

// 3) 새 버전 — 큰 버전(major)이 바뀌면 업데이트 전에 영향을 따로 확인한다
const outdated = JSON.parse(run(["outdated", "--json"]) || "{}");
console.log("\n## 새 버전이 있는 패키지");
const rows = Object.entries(outdated);
if (rows.length === 0) console.log("- 모두 최신입니다");
for (const [name, o] of rows) {
  const major = String(o.current).split(".")[0] !== String(o.latest).split(".")[0];
  console.log(`- ${name}: ${o.current} → ${o.latest}${major ? "  [큰 버전 변경 — 문서 · 변경 내역을 읽고 테스트 후 올리기]" : ""}`);
}
console.log("\n업데이트 규칙: 한 번에 하나씩 올리고 npm run check · npm run test:db를 다시 통과시킨 뒤 반영한다. npm audit fix --force는 영향 확인 없이 쓰지 않는다.");
