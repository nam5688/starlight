// 무료 결과 문장 생활 말 시안의 전후 문서(docs/free-result-life-language-proposal-v1.md)를 만든다(순수 함수 — 사주 계산 결과를 받아 지금 문장과 시안을 나란히 놓는다).
// 연결하지 않은 초안이다. 문서는 `node scripts/plain-life-draft-render.ts`로 만들고 직접 고치지 않는다.
import { customerVoiceLeaks } from "../report/reading/customer-voice.ts";
import { lineGroups, splitSentences } from "../report/reading/line-breaks.ts";
import type { SajuOk } from "./engine.ts";
import { LIFE_DRAFT_VERSION, dayMasterLife, elementLife, headlineLife, relationLeadLife, relationLife } from "./plain-life-draft.ts";
import { plainSajuReading, type ElementReading } from "./plain.ts";

/** 문서의 예시 사주 — 가상의 생년월일이다(실제 사람의 정보가 아니다). 일간 임수 · 많은 기운 수 · 없는 기운 금 · 적은 기운 목 */
export const SAMPLE_BIRTH = { year: 1988, month: 12, day: 23, calendar: "solar", isLeapMonth: false, birthTime: "12:00", gender: "female" } as const;

const jargon = (text: string) => customerVoiceLeaks(text);
const maxLen = (text: string) => Math.max(0, ...splitSentences(text).map((s) => s.length));
const blocks = (lines: string[]) => lines.flatMap((l) => lineGroups(l));
const quote = (items: string[]) => items.map((s) => `> ${s}`);

/** 무료 결과 화면이 지금 보이는 문장(앞 절의 코드 경로를 그대로 따른다 — 일간 문단은 components/report/free-preview-body.tsx의 문장 조립, 관계 한 줄은 lib/report/preview.ts) */
export function currentFreeTexts(saju: SajuOk) {
  const plain = plainSajuReading(saju);
  const dayMaster = `나를 나타내는 글자(일간)는 ${plain.dayMaster.label}이고, 전통 해석에서는 ${plain.dayMaster.image}에 비유합니다. ${plain.dayMaster.trait}`;
  const notable = [...plain.elements.filter((e) => e.level === "many").sort((a, b) => b.count - a.count), ...plain.elements.filter((e) => e.level === "none"), ...plain.elements.filter((e) => e.level === "few")].find((e) => e.domains);
  const relation = notable?.domains ? `${notable.element}(${notable.image}) 기운이 ${notable.level === "many" ? "많아요" : notable.level === "none" ? "없어요" : "적어요"} — ${notable.domains.relation}` : null;
  return { plain, headline: plain.headline, dayMaster, everyday: plain.everyday, relation, notable };
}

function levelOf(e: ElementReading): "many" | "few" | "none" | null {
  return e.level === "many" || e.level === "few" || e.level === "none" ? e.level : null;
}

export function renderLifeLanguageProposal(saju: SajuOk): string {
  const cur = currentFreeTexts(saju);
  const stem = saju.dayMaster.stem;
  const manyEls = cur.plain.elements.filter((e) => e.level === "many").map((e) => e.element);
  const dm = dayMasterLife(stem, cur.plain.dayMaster.label, cur.plain.dayMaster.image)!;
  const head = headlineLife(stem, manyEls)!;
  const out: string[] = [];
  out.push(
    "# 무료 결과 문장 — 생활 말 · 문장별 줄바꿈 전후 시안 (생성 문서)",
    "",
    "> **시안과 비교만이다.** 지금 무료 결과 화면 · 저장된 결과 · 리포트 · AI 지시문 · 점수 · 사주 계산 어디에도 연결하지 않았고 바꾸지 않았다(`plain-life-draft.test.ts`가 확인). 운영자가 문구를 확인하기 전에는 `plain.ts` · 화면을 바꾸지 않는다. 새 AI 호출 0.",
    `> 이 문서는 코드에서 만들었다 — \`node scripts/plain-life-draft-render.ts\`(원본: \`lib/saju/plain-life-draft.ts\` · 시안 버전 \`${LIFE_DRAFT_VERSION}\`). 직접 고치지 않는다. 문구는 전통 해석을 쉬운 말로 옮긴 초안이며 전문가 검토 전이다.`,
    "> **의미는 그대로 두고 말만 바꿨다.** 새로운 해석 · 새 계산 규칙 · 점수 · 단정이 없다. 없거나 적은 기운을 \"그 힘이 부족하다\"로 번역하지 않는 규칙도 그대로다.",
    "",
    "## 0. 지금 어디에서 나오는 문장인가",
    "",
    "| 화면 자리 | 지금 문장을 만드는 곳 | 줄바꿈 |",
    "| --- | --- | --- |",
    "| 한 줄 소개(\"큰 강 · 바다처럼 넓게 흐르는 사람 — 원국에는 …\") | `lib/saju/plain.ts` `headline` | **문장 나눔 없음**(`<p>` 한 덩어리) |",
    "| 일간 문단(\"나를 나타내는 글자(일간)는 임수(壬)이고 …\") | `components/report/free-preview-body.tsx`가 조립(`dayMaster.label` · `image` · `trait`) | **문장 나눔 없음**(`<p>` 한 덩어리, 합쇼체 \"비유합니다 · 봅니다\"와 해요체가 섞임) |",
    "| 오행 설명(\"목(나무) 기운이 없어요 — 그 기운(…)이 들어오는 시기에 그 주제가 …\") | `plain.ts` `everyday` · `fewNote` · `ELEMENT_INFO` | `Prose`(한 문장 한 블록) |",
    "| 가까운 관계 한 줄(\"토(흙) 기운이 많아요 — …\") | `lib/report/preview.ts` `relation` · `plain.ts` `manyDomains` · `fewDomains` | `Prose` |",
    "",
    `예시 사주: **일간 ${cur.plain.dayMaster.label}** · 많은 기운 ${manyEls.join(" · ") || "없음"} · 없는 기운 ${cur.plain.elements.filter((e) => e.level === "none").map((e) => e.element).join(" · ") || "없음"} · 적은 기운 ${cur.plain.elements.filter((e) => e.level === "few").map((e) => e.element).join(" · ") || "없음"}(엔진이 계산한 값, 문구만 다르다).`,
    "",
    "## 1. 한 줄 소개",
    "",
    "**지금**",
    "",
    ...quote([cur.headline]),
    "",
    "**시안**",
    "",
    ...quote(head),
    "",
    "## 2. 일간 문단",
    "",
    "**지금** — 한 덩어리 `<p>`",
    "",
    ...quote([cur.dayMaster]),
    "",
    "**시안** — 앞 문장은 생활 말, 용어는 보조 한 줄",
    "",
    ...quote(dm.lines),
    "",
    `보조 한 줄(작은 글씨 또는 접힘에 둘지는 운영자 결정): ${dm.term}`,
    "",
    "## 3. 오행 설명",
    ""
  );
  for (const e of cur.plain.elements) {
    const level = levelOf(e);
    if (!level) continue;
    const idx = cur.everyday.findIndex((t) => t.startsWith(`${e.element}(`));
    if (idx < 0) continue;
    const after = elementLife(e.element, level);
    out.push(`### ${e.element}(${e.image}) · ${e.levelLabel}`, "", "**지금**", "", ...quote([cur.everyday[idx]]), "", "**시안**", "", ...quote(after.lines), "", `보조 한 줄: ${after.term}`, "");
  }
  out.push("## 4. 가까운 관계 한 줄", "");
  if (cur.relation && cur.notable) {
    const lvl = levelOf(cur.notable)!;
    const afterLines = [relationLeadLife(cur.notable.element, lvl)!, ...relationLife(cur.notable.element, lvl)!];
    out.push("**지금**", "", ...quote([cur.relation]), "", "**시안**", "", ...quote(afterLines), "");
  } else out.push("(이 사주에는 관계 한 줄이 나오는 기운이 없다)", "");

  // 정량 비교
  const beforeAll = [cur.headline, cur.dayMaster, ...cur.everyday, ...(cur.relation ? [cur.relation] : [])];
  const afterAll = [...head, ...dm.lines, ...cur.plain.elements.flatMap((e) => { const l = levelOf(e); return l ? elementLife(e.element, l).lines : []; }), ...(cur.notable && levelOf(cur.notable) ? [relationLeadLife(cur.notable.element, levelOf(cur.notable)!)!, ...relationLife(cur.notable.element, levelOf(cur.notable)!)!] : [])];
  const leaksBefore = [...new Set(beforeAll.flatMap(jargon))];
  const leaksAfter = [...new Set(afterAll.flatMap(jargon))];
  const hasTerm = (s: string) => /일간|오행|십성|대운|세운|기운|임수|[갑을병정무기경신임계]수|[갑을병정무기경신임계]목|[갑을병정무기경신임계]화|[갑을병정무기경신임계]토|[갑을병정무기경신임계]금|그 주제/.test(s);
  out.push(
    "## 5. 숫자로 본 차이 (이 예시 사주)",
    "",
    "| 지표 | 지금 | 시안 |",
    "| --- | --- | --- |",
    `| 앞에서 읽히는 글에 새어 나온 명리 용어(\`customerVoiceLeaks\`) | ${leaksBefore.length}개: ${leaksBefore.join(" · ") || "없음"} | ${leaksAfter.length}개: ${leaksAfter.join(" · ") || "없음"} |`,
    `| 사주 말이 들어간 문장(일간 · 오행 · 기운 · 임수류 · "그 주제") | ${beforeAll.flatMap(splitSentences).filter(hasTerm).length}문장 / ${beforeAll.flatMap(splitSentences).length}문장 | ${afterAll.flatMap(splitSentences).filter(hasTerm).length}문장 / ${afterAll.flatMap(splitSentences).length}문장 |`,
    `| 가장 긴 문장 글자 수(공백 포함) | ${Math.max(...beforeAll.map(maxLen))}자 | ${Math.max(...afterAll.map(maxLen))}자 |`,
    `| 화면에 보이는 줄 덩어리 수(한 문장 한 블록 · 짧은 두 문장 묶음 기준) | ${blocks(beforeAll).length}개 | ${blocks(afterAll).length}개 |`,
    "",
    "- 일간 문단과 한 줄 소개는 지금 `Prose`를 거치지 않아 문장 나눔이 없다 — 시안을 연결할 때 이 두 자리를 `Prose`로 바꾸면(표시 계층만, 저장된 글 불변) 같은 규칙으로 줄이 나뉜다.",
    "- 줄 덩어리 수가 늘어나는 것은 문장이 짧아져서이고, 읽을 내용은 늘리지 않았다(의미가 같은 문장을 나눈 것).",
    "",
    "## 6. 바꾼 기준 (시험이 지키는 것)",
    "",
    "1. 앞에서 읽히는 문장에는 일간 · 오행 · 십성 · 대운 · 세운 · 기운 · \"임수\"류 · 한자 · \"그 주제\" · \"상대적으로 크게 느껴질 수\"를 쓰지 않는다. 용어는 보조 한 줄(`term`)에만 둔다.",
    "2. 모든 문장은 해요체(\"~요.\")로 끝나고 합쇼체(입니다 · 합니다 · 봅니다)가 없다.",
    "3. 한 문장은 46자를 넘지 않는다(모바일 두 줄 안쪽).",
    "4. 없거나 적은 기운의 문장은 ① 사주 글자 구성에서 도드라지지 않는다 ② 그런 모습이 없다는 뜻은 아니다 ③ 전통 해석으로는 그 주제가 크게 와닿는 시기가 있다 ④ 그럴 때 일부러 챙기라고 권하는 해석이 많다 — 지금 문구가 말하는 세 가지 범위(시기 · 권하는 해석 · 부족하다는 뜻이 아님)만 문장마다 따로 말한다. 한 문장에 기운 이름 · 없음 표현 · 생활 기능어를 함께 넣지 않는다(기존 `ABSENCE_MAPPING`과 같은 취지).",
    "5. 일간 열 가지의 세 문장은 지금 `plain.ts`의 trait · goodAt · watchOut이 말하는 범위를 옮긴 것이다. 새 성격 풀이를 더하지 않았다.",
    "",
    "## 7. 연결할 때 바뀌는 곳 · 영향 (이번에는 연결하지 않았다)",
    "",
    "| 바뀌는 곳 | 내용 |",
    "| --- | --- |",
    "| `lib/saju/plain.ts` | `headline` · `everyday` · `fewNote` · `manyDomains` · `fewDomains`를 시안 함수로 대신하거나 읽는 쪽에서 시안으로 바꿔 보이게 한다. `plain.ts`는 유료 리포트의 오행별 풀이 · 채팅 · 맛보기도 쓰므로 한 번에 바꾸면 그쪽 문구도 바뀐다 — 무료 결과에만 적용할지 같이 바꿀지는 운영자 결정 |",
    "| `lib/report/preview.ts` | 관계 한 줄(`relation.lead` · `text`)과 오행 첫 문장(`everyday.shown`) |",
    "| `components/report/free-preview-body.tsx` | 한 줄 소개 · 일간 문단을 `Prose`로(표시 계층) · 용어 보조 한 줄 자리 |",
    "| 저장된 옛 결과 | 저장된 `summary`를 바꾸지 않는다. 무료 풀이 문장 최신화(`withCurrentInsight`)처럼 화면에서 저장된 사주 값으로 다시 만들면 된다 |",
    "| 시험 | `preview.test.ts` · `free-preview-parity.test.ts`(로그인 전후 동일) · 무료/유료 문장 일치 · 새로 `plain-life-draft.test.ts`의 기준을 실제 문구에 적용 |",
    "",
    "## 8. 운영자 결정 · 한계",
    "",
    "1. 용어 보조 한 줄(\"사주 용어로는 ‘임수(壬)’이고 …\")을 작은 글씨로 보일지, 접어 둘지, 두지 않을지(`한자 · 한자 뜻 · 쉬운 말을 함께 풀어 쓴다`는 기존 원칙과 \"본문은 생활 말\"이라는 고객용 서술 방향의 균형).",
    "2. 무료 결과에만 적용할지, 유료 리포트의 오행별 풀이 · 채팅 · 맛보기에도 같이 적용할지.",
    "3. 일간 열 가지 문구 · 오행 다섯 가지 한 구절(\"안정을 지키는 일\" 등)이 뜻을 바꾸지 않았는지 확인. **전문가 검토 전 초안이다.**",
    "4. 이 시안은 사람이 읽어 보지 않았다 — 글자 수 · 용어 · 어미 규칙은 시험이 지키지만 \"읽기 편한가\"는 사람이 판단한다.",
    ""
  );
  return out.join("\n");
}
