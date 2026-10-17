// 고정 문구의 합쇼체(~입니다 · ~합니다 · ~습니다 · ~됩니다)를 해요체(~예요 · ~해요 · ~어요 · ~돼요)로 바꾸는 도구 — 호출 없음.
// 문자열 · JSX 글 안에서 합쇼체로 끝나는 말마디만 활용 규칙으로 바꾸고, 규칙으로 확신할 수 없는 것(ㄹ 불규칙 · ㅂ 불규칙 · 줄임말)은 바꾸지 않고 "수동"으로 목록에 낸다.
// 어미만 바꾸는 것으로는 자연스러운 말이 되지 않는 문장도 있으므로 **바꾼 결과는 반드시 사람이 읽고 다듬는다**(이 도구는 변환 초안을 만든다) — `--dry`로 전후를 먼저 보고 `--apply`로 쓴다.
//
// 사용: node scripts/voice-convert.ts --dry <경로 일부 ...>      (전후 표 + 수동 목록, 파일은 그대로)
//       node scripts/voice-convert.ts --apply <경로 일부 ...>    (파일에 쓴다)
// 대상은 scripts/audit-voice.ts가 "user"로 분류한 파일 가운데 경로가 일치하는 것뿐이다(약관 · 개인정보 · 운영자 화면 · 검사 오류 문구는 건드리지 않는다).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditVoice } from "./audit-voice.ts";

const ROOT = join(import.meta.dirname, "..");

const BATCHIM = (ch: string) => (ch.charCodeAt(0) - 0xac00) % 28;
const JUNG = (ch: string) => Math.floor(((ch.charCodeAt(0) - 0xac00) % 588) / 28);
// 중성 번호: ㅏ0 ㅐ1 ㅑ2 ㅒ3 ㅓ4 ㅔ5 ㅕ6 ㅖ7 ㅗ8 ㅘ9 ㅙ10 ㅚ11 ㅛ12 ㅜ13 ㅝ14 ㅞ15 ㅟ16 ㅠ17 ㅡ18 ㅢ19 ㅣ20
/** 받침 없는 음절에서 받침만 바꾼 음절 */
const withBatchim = (ch: string, t: number) => String.fromCharCode(ch.charCodeAt(0) - BATCHIM(ch) + t);
const compose = (base: string, jung: number, tail = 0) => {
  const code = base.charCodeAt(0) - 0xac00;
  const cho = Math.floor(code / 588);
  return String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + tail);
};

/** 활용을 규칙으로 정할 수 없는 말 — 바꾸지 않고 수동 목록에 낸다 */
const MANUAL_STEMS = /(?:르|묻|듣|걷|깨닫|싣)$|(?:쉽|어렵|가깝|무겁|아닙|돕|곱|덥|춥|맵|뜨겁|차갑|두렵|고맙|반갑|즐겁|아름답|그립|괴롭|가볍|무섭|부끄럽|새롭|가엾|사랑스럽)$/;

/** "…습니다 / …ㅂ니다 / …입니다" 하나를 해요체로. 바꿀 수 없으면 null */
/** 활용이 규칙에 맞지 않는 말(ㄹ 탈락 · ㅂ 불규칙 · 줄임말) — 말마디 끝이 이 목록과 같으면 이 값으로 바꾼다 */
const SPECIAL: Record<string, string> = {
  만듭니다: "만들어요",
  압니다: "알아요",
  엽니다: "열어요",
  풉니다: "풀어요",
  놉니다: "놀아요",
  겁니다: "거예요",
  고맙습니다: "고마워요",
  감사합니다: "감사해요",
  반갑습니다: "반가워요",
  어렵습니다: "어려워요",
  쉽습니다: "쉬워요",
  가깝습니다: "가까워요",
  무겁습니다: "무거워요",
  가볍습니다: "가벼워요",
  즐겁습니다: "즐거워요",
  아름답습니다: "아름다워요",
  그렇습니다: "그래요",
  어떻습니다: "어때요",
  이렇습니다: "이래요",
  저렇습니다: "저래요",
  모릅니다: "몰라요",
  다릅니다: "달라요",
  부릅니다: "불러요",
  누릅니다: "눌러요",
  고릅니다: "골라요",
  따릅니다: "따라요",
  흐릅니다: "흘러요",
  오릅니다: "올라요",
  자릅니다: "잘라요",
  이릅니다: "이르러요",
  바릅니다: "발라요",
  이어집니다: "이어져요",
  줄어듭니다: "줄어들어요",
  늘어납니다: "늘어나요",
  보입니다: "보여요",
  놓입니다: "놓여요",
  쌓입니다: "쌓여요",
  섞입니다: "섞여요",
  모입니다: "모여요",
  쓰입니다: "쓰여요",
  돕습니다: "도와요",
};

export function toHaeyo(word: string): string | null {
  for (const [from, to] of Object.entries(SPECIAL)) if (word.endsWith(from)) return word.slice(0, word.length - from.length) + to;
  if (/십시오$/.test(word)) return word.replace(/십시오$/, "세요");
  if (/[가-힣]듭니다$/.test(word) && !/(?:드|이)듭니다$/.test(word)) return word.replace(/듭니다$/, "들어요"); // 들다 · 줄어들다 · 만들다처럼 ㄹ이 빠진 말(생각이 듭니다)
  // 합쇼체 말마디(공백 없는 덩어리)만 받는다 — 끝의 "니다/니까"를 떼고 앞부분을 활용한다
  let m: RegExpExecArray | null;
  // 이었습니다 / 였습니다 / 았습니다 / 었습니다 / 겠습니다 / 했습니다
  if ((m = /^(.*)(이었|였|았|었|겠|했|됐|하였|되었)습니다$/.exec(word))) {
    const [, head, past] = m;
    const map: Record<string, string> = { 이었: "이었어요", 였: "였어요", 았: "았어요", 었: "었어요", 겠: "겠어요", 했: "했어요", 됐: "됐어요", 하였: "했어요", 되었: "됐어요" };
    return head + map[past];
  }
  // 바랍니다 / 주시기 바랍니다
  if ((m = /^(.*)주시기 ?바랍니다$/.exec(word))) return `${m[1]}주세요`;
  if (/바랍니다$/.test(word)) return word.replace(/바랍니다$/, "바라요");
  // 아닙니다 · 입니다
  if (/아닙니다$/.test(word)) return word.replace(/아닙니다$/, "아니에요");
  if ((m = /^(.*)([가-힣])입니다$/.exec(word))) return `${m[1]}${m[2]}${BATCHIM(m[2]) === 0 ? "예요" : "이에요"}`;
  if (/^입니다$/.test(word)) return "이에요";
  // 있습니다 · 없습니다 · 않습니다 · 좋습니다 처럼 받침 + 습니다
  if ((m = /^(.*)([가-힣])습니다$/.exec(word))) {
    const [, head, stem] = m;
    if (BATCHIM(stem) === 20) return `${head}${stem}어요`; // 골랐 · 갔 · 봤 처럼 ㅆ 받침이 이미 있는 과거형
    if (MANUAL_STEMS.test(head + stem)) return null;
    const bright = [0, 2, 8, 9, 12].includes(JUNG(stem)); // ㅏ ㅑ ㅗ ㅘ ㅛ → 아요, 그 밖은 어요
    return `${head}${stem}${bright ? "아요" : "어요"}`;
  }
  // 합니다 · 됩니다 · 갑니다 · 봅니다 · 줍니다 · 씁니다 · 읽힙니다 · 십니다 — 받침 ㅂ + 니다
  if ((m = /^(.*)([가-힣])니다$/.exec(word)) && BATCHIM(m[2]) === 17) {
    const [, head, syl] = m;
    const open = withBatchim(syl, 0);
    if (MANUAL_STEMS.test(head + open) || MANUAL_STEMS.test(head + syl)) return null;
    if (open === "하") return `${head}해요`;
    if (open === "되") return `${head}돼요`;
    if (open === "시") return `${head}세요`;
    const j = JUNG(open);
    if (j === 20) return `${head}${compose(open, 6)}요`; // ㅣ → ㅕ (읽히 → 읽혀 · 보이 → 보여)
    if (j === 8) return `${head}${compose(open, 9)}요`; // ㅗ → ㅘ (보 → 봐 · 오 → 와)
    if (j === 13) return `${head}${compose(open, 14)}요`; // ㅜ → ㅝ (주 → 줘 · 누 → 눠)
    if (j === 18) return `${head}${compose(open, 4)}요`; // ㅡ → ㅓ (쓰 → 써)
    if ([0, 4, 1, 5].includes(j)) return `${head}${open}요`; // ㅏ ㅓ ㅐ ㅔ → 가요 · 서요 · 내요
    return null;
  }
  // 하십니까 · 습니까 · ㅂ니까 (물음)
  if ((m = /^(.*)([가-힣])니까$/.exec(word)) && BATCHIM(m[2]) === 17) {
    const as = toHaeyo(`${m[1]}${m[2]}니다`);
    return as ? as.replace(/(?:요)$/, "요") : null;
  }
  return null;
}

type Change = { file: string; line: number; before: string; after: string };
type Manual = { file: string; line: number; text: string };

const isFormalWord = (w: string) => /(?:습니다|입니다|합니다|됩니다|바랍니다|십시오)$/.test(w) || (/[가-힣]니다$/.test(w) && BATCHIM(w[w.length - 3] ?? "") === 17) || /니까$/.test(w);

/** 한 문장(또는 줄)의 합쇼체 끝맺음을 해요체로 — 바꾼 것과 못 바꾼 것을 돌려준다 */
export function convertLine(text: string): { out: string; manual: string[] } {
  const manual: string[] = [];
  const out = text.replace(/([가-힣]+(?: ?[가-힣]+)?)(?=[.?!"'`<)\s,—–]|$)/g, (full, w: string) => {
    // 마지막 어절만 본다
    const parts = w.split(" ");
    const last = parts[parts.length - 1];
    if (!isFormalWord(last)) return full;
    // "주시기 바랍니다"처럼 두 어절에 걸친 것
    const two = parts.length >= 2 ? `${parts[parts.length - 2]} ${last}` : "";
    const withTwo = two && /주시기 바랍니다$/.test(two) ? toHaeyo(two) : null;
    if (withTwo) return [...parts.slice(0, -2), withTwo].join(" ");
    const c = toHaeyo(last);
    if (c === null) {
      manual.push(last);
      return full;
    }
    return [...parts.slice(0, -1), c].join(" ");
  });
  return { out, manual };
}

/**
 * 어미만 바꾸면 뜻이 달라지는 파일은 건드리지 않는다 — AI 지시문(말투 규칙이 "~입니다로 끝내지 않는다"처럼 합쇼체를 인용한다) · 검사 오류 · 운영자용 · 개발용 · 문항 초안 · 모의 작성기 · 법률 고지 성격의 하단 안내(plan.ts)
 */
const NEVER = /prompt\.ts$|prompt-|drafts\/|mock-model|setup-checks|setup-status|generate-dev-report|philosophy\/|\/dev\/|telegram|ai-candidates|fake-toss|memory-repository|live-plan|render-text|reading\/plan\.ts|compat\/plan\.ts|lib\/report\/ai\/|lib\/integrations\/|\.test\.|lib\/commerce\/|lib\/saju\/interpret\/|survey-evidence|pair-evidence|pair-scene-evidence|pair-consent|tendency-v2|reconcile-service|admin-service|admin-support-service|benefit-service|server\/env\.ts|server\/capacity\.ts|lib\/report\/style\//;

const rawArgs = process.argv.slice(2);
const exceptIdx = rawArgs.indexOf("--except");
const except = exceptIdx >= 0 ? rawArgs.slice(exceptIdx + 1).filter((a) => !a.startsWith("--")) : [];
const args = exceptIdx >= 0 ? rawArgs.slice(0, exceptIdx) : rawArgs;
const apply = args.includes("--apply");
const dry = args.includes("--dry");
const parts = args.filter((a) => !a.startsWith("--"));

if ((apply || dry) && import.meta.url === `file://${process.argv[1]}`) {
  const hits = auditVoice().filter((h) => h.kind === "user" && !NEVER.test(h.file) && (parts.length === 0 || parts.some((p) => h.file.includes(p))));
  const byFile = new Map<string, typeof hits>();
  for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
  const changes: Change[] = [];
  const manuals: Manual[] = [];
  for (const [file, list] of byFile) {
    const abs = join(ROOT, file);
    const lines = readFileSync(abs, "utf8").split("\n");
    for (const h of list) {
      const raw = lines[h.line - 1];
      if (except.some((x) => raw.includes(x))) continue;
      // 문자열 · JSX 글 부분만 바꾸되, 코드(식별자 · 정규식 · 주석)는 건드리지 않도록 한글 덩어리만 치환한다
      const r = convertLine(raw);
      if (r.out !== raw) {
        changes.push({ file, line: h.line, before: raw.trim(), after: r.out.trim() });
        lines[h.line - 1] = r.out;
      }
      for (const w of r.manual) manuals.push({ file, line: h.line, text: `${w} ← ${raw.trim().slice(0, 100)}` });
    }
    if (apply) writeFileSync(abs, lines.join("\n"));
  }
  for (const c of changes) console.log(`${c.file}:${c.line}\n  - ${c.before.slice(0, 200)}\n  + ${c.after.slice(0, 200)}`);
  const words = new Map<string, number>();
  for (const c of changes) {
    const a = c.before.split(/\s+/);
    const b = c.after.split(/\s+/);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) words.set(`${a[i].replace(/[.,;:)"'`<>]+$/g, "")} → ${b[i].replace(/[.,;:)"'`<>]+$/g, "")}`, (words.get(`${a[i].replace(/[.,;:)"'`<>]+$/g, "")} → ${b[i].replace(/[.,;:)"'`<>]+$/g, "")}`) ?? 0) + 1);
  }
  console.log("\n단어 변환 목록(검토용)");
  for (const [k, n] of [...words].sort()) console.log(`  ${k}${n > 1 ? ` ×${n}` : ""}`);
  console.log(`\n바꾼 줄 ${changes.length} · 수동 ${manuals.length}${apply ? " (파일에 썼습니다)" : " (dry — 파일은 그대로)"}`);
  for (const m of manuals) console.log(`수동: ${m.file}:${m.line}  ${m.text}`);
}
