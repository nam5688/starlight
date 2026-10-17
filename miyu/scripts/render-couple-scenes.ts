// 궁합 장면 질문 초안 문서 만들기 — docs/couple-scenes-v1.md (코드에서 생성, 손으로 고치지 않는다).
// 실행: node scripts/render-couple-scenes.ts (miyu 폴더에서). 질문 · 선택지 · 두 사람 비교 규칙은 lib/assessment/drafts/couple-scenes-v1.ts · lib/report/compat/pair-scene-evidence.ts에 있다.
import { writeFileSync } from "node:fs";
import { COUPLE_AREAS, COUPLE_NONE_OPTIONS, COUPLE_SCENE_BY_ID, COUPLE_SCENE_DATE, COUPLE_SCENE_PROMPT, COUPLE_SCENE_VERSION, COUPLE_THREADS, type CoupleScene } from "../lib/assessment/drafts/couple-scenes-v1.ts";
import { pairSceneEvidenceOf } from "../lib/report/compat/pair-scene-evidence.ts";
import { PAIR_SCENE_RULE_VERSION } from "../lib/report/compat/pair-scene-evidence.ts";
import { PAIR_SCENE_RULE_META } from "../lib/saju/interpret/rule-meta.ts";

const ROLE: Record<string, string> = { give: "내가 상대에게 하는 것", need: "내가 받고 싶은 것", same: "내 반응" };
const sceneBlock = (s: CoupleScene) =>
  `**${s.id} · ${s.label}** (${ROLE[s.role]})\n> ${s.ask}\n${s.options.map((o) => `> - ${o.id.toUpperCase()}) ${o.text} — _이름표 ${o.tag}_`).join("\n")}\n> - 이런 일이 거의 없었어요 / 맞는 선택지가 없어요 (둘 다 그 영역을 읽지 않는다)\n\n가르려는 차이: ${s.difference}\n시범 인터뷰에서 확인할 것: ${s.watch}`;

// 모든 장면에 같은 선택지로 답한 두 가상 인물로 예시 한 줄씩
const all = (id: "a" | "b" | "c" | "d") => Object.fromEntries(Object.keys(COUPLE_SCENE_BY_ID).map((k) => [k, id]));
const sample = pairSceneEvidenceOf(all("a"), all("c"));

const doc = `# 궁합 장면 질문 v1 — 리포트 궁합용 설계 초안 (${COUPLE_SCENE_VERSION})

- 이 문서는 \`lib/assessment/drafts/couple-scenes-v1.ts\`에서 \`node scripts/render-couple-scenes.ts\`로 만든다(${COUPLE_SCENE_DATE}). 손으로 고치지 않는다.
- **상태: 설계 초안 · 시범 인터뷰 전 · 화면 · 저장 · 결제 · 리포트에 연결하지 않았다.** 지금 화면의 22문항 · 점수표 · 저장된 회원 결과와 섞지 않는다.
- 근거: 운영자 확정(2026-10-17, D6) — 리포트 궁합 구현 전에 두 사람이 같은 영역에 직접 답한 장면형 질문을 먼저 연결한다. 결과를 직접 묻는 문항은 쓰지 않고, 한 문항으로 사람을 유형으로 정하지 않는다.
- 리포트 궁합의 흐름(운영자 2026-10-17): 두 사람의 차이 → 그 차이가 만드는 관계 장면 → A가 B를 이해하는 법 → B가 A에게 조금 바꿀 것 → 같이 해 볼 구체적인 행동(건넬 짧은 말 한 문장).

## 1. 영역 8개와 묶음 7개

| 운영자가 말한 영역 | 맡는 묶음 | 모양 |
| --- | --- | --- |
${COUPLE_AREAS.map((a) => `| ${a.area} | ${a.thread} · ${COUPLE_THREADS.find((t) => t.id === a.thread)!.name} | ${COUPLE_THREADS.find((t) => t.id === a.thread)!.kind === "cross" ? "cross(받고 싶은 것 ↔ 하는 것)" : "same(같은 장면 나란히)"} |`).join("\n")}

- **cross**: 한 장면은 내가 받고 싶은 것, 다른 장면은 내가 상대에게 하는 것이고 선택지 이름표가 같다. 두 사람을 비교할 때 "A가 건네는 방식 ↔ B가 크게 느끼는 방식"이 닿는지 · 엇갈리는지를 두 방향으로 본다.
- **same**: 두 장면 모두 내 반응이고 두 사람의 같은 장면 답을 나란히 비교한다(같은 방식 · 다른 방식).
- 새로 만든 장면 10개(K1~K5) + 개인용 장면 질문(\`scenario-v1.ts\`)의 장면 4개(S5 · S6 · S7 · S8)를 문장 · 선택지 그대로 가져왔다(복사하지 않고 같은 데이터를 쓴다 — 시험이 어긋나지 않음을 확인한다).
- 안내 문장: "${COUPLE_SCENE_PROMPT}" · 선택지는 같은 장면을 다루는 방식 4개이며 좋고 나쁨 · 높고 낮음이 없다(점수를 매기지 않는다).

## 2. 묶음과 장면

${COUPLE_THREADS.map((t) => `### ${t.id} · ${t.area} — ${t.name}\n- 가르려는 것: ${t.asks}\n- 붙이면 안 되는 결론: ${t.notThis.join(" · ")}\n- 닿거나 같을 때: ${t.matchNote}\n- 엇갈리거나 다를 때: ${t.gapNote}\n- 같이 해 볼 행동: ${t.together}\n- 닮은 점(숨기지 않는다): ${t.overlap}\n\n${t.scenes.map((id) => sceneBlock(COUPLE_SCENE_BY_ID[id])).join("\n\n")}`).join("\n\n")}

## 3. 선택지마다 고정한 문장(상대가 해 볼 것 · 건넬 말)

코드가 만든 근거에 그대로 들어가며 AI가 새로 쓰지 않는다. give 장면은 "이렇게 건넨 마음을 알아봐 주는 법 · 받는 사람이 건넬 말", need 장면은 "이 방식으로 마음을 건네는 법 · 건네는 사람이 건넬 말", same 장면은 "이 방식인 사람과 지낼 때 해 볼 것 · 건넬 말"이다.

${COUPLE_THREADS.map((t) => `#### ${t.id} · ${t.area}\n${t.scenes.map((id) => { const s = COUPLE_SCENE_BY_ID[id]; return `**${s.id}**\n${s.options.map((o) => `- ${o.text} → 읽기: ${o.readThisAs} / 해 볼 것: ${o.partnerCanTry} / 건넬 말: "${o.sayToThem}"`).join("\n")}`; }).join("\n\n")}`).join("\n\n")}

## 4. 두 사람 비교 근거 (\`lib/report/compat/pair-scene-evidence.ts\`, ${PAIR_SCENE_RULE_VERSION})

- 두 사람 모두 그 영역의 두 장면에 선택지로 답했을 때만 근거(\`pair.scene.K1~K7\`)를 만든다. "거의 없었어요 · 맞는 선택지 없음 · 미응답"은 그 영역을 읽지 않는다(없는 응답을 만들어 채우지 않는다).
- 근거는 사실(fact: 두 사람이 고른 답과 닿음 · 엇갈림)과 해석 단서(cue: 조건형 읽기 + 서로가 해 볼 것 + 건넬 말 + 같이 해 볼 행동 + 붙이면 안 되는 결론 + 한계)로 나뉜다. 점수 · 궁합 지수를 새로 만들지 않고 속마음을 사실로 말하지 않으며 사람 이름 대신 A님 · B님을 쓴다.
- 4 × 4 × 4 × 4 답 조합이 영역마다 모두 읽히고 A · B 순서를 바꿔도 같은 상태인지 단위 시험이 확인한다.

예시(모든 장면에 A님은 첫 번째 선택지, B님은 세 번째 선택지로 답한 가상 두 사람 — 실제 사람의 응답이 아니다) 근거 ${sample.evidence.length}개 가운데 하나:

> ${sample.evidence[0].fact}

## 5. 규칙 이력

${PAIR_SCENE_RULE_META.map((m) => `- **${m.title}** (${m.id}, v${m.version}, 검토 상태: ${m.review === "unreviewed" ? "전문가 검토 전" : m.review})\n  - 계산: ${m.calculation}\n  - 해석: ${m.interpretation}\n  - 출처: ${m.source}\n  - 예외 · 한계: ${m.exceptions.join(" / ")}`).join("\n")}

## 6. 하지 못한 것 · 운영자 확인 항목

- **실제 사람에게 풀어 보게 한 적이 없다** — 질문이 이해되는지, 선택지가 서로 겹치지 않는지, 좋게 보이는 선택지가 있는지(시범 인터뷰 · 시범 응답 전의 설계 가설). 신뢰도 · 타당도 · 정확도는 확인하지 못했다.
- 선택지의 "읽기 · 해 볼 것 · 건넬 말"은 개발 중 직접 쓴 문장이며 관계 심리 · 상담 문헌에서 확인한 것이 아니다. 전문가(관계 상담 · 검사 저작권) 검토를 받지 않았다.
- 닮은 점: K1은 널리 알려진 "사랑 표현 방식" 이야기, K2 · K3 · K6은 성인 애착 연구, K5 · K7은 갈등 · 지지 연구가 다루는 주제와 닮았다. 문항 · 채점 · 유형 이름은 가져오지 않았고 법률 판단이 아니다.
- 이 근거를 실제 AI 풀이(리포트 궁합)에 넣고 읽어 본 적이 없다(대리 작성기 시험도 아직 없음 — 7단계).
- 확인해 주세요: ① 영역 7묶음 · 장면 14개와 선택지 문장 ② "상대가 해 볼 것 · 건넬 말" 문장의 어조(반말) ③ 시범 인터뷰를 어떻게 할지(\`docs/assessment-pilot-protocol.md\` 절차 재사용 여부) ④ 두 사람이 각자 몇 개 장면에 답해야 하는지(지금은 14개 장면 · 약 3분 어림, 재지 않았다).
`;
writeFileSync(new URL("../docs/couple-scenes-v1.md", import.meta.url), doc);
console.log(`docs/couple-scenes-v1.md ${doc.length}자 (선택지 ${COUPLE_NONE_OPTIONS.length}종 안내 포함)`);
