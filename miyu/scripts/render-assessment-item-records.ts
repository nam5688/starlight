// 문항별 개발 기록(내부 문서 docs/assessment-item-records.md)을 코드에서 만든다.
// 공개 페이지(/assessment-basis)는 요약만 보여 주고, 문항 문장 · 문항별 기록은 이 문서에만 둔다(운영자 2026-10-15).
// 실행: node scripts/render-assessment-item-records.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { CHECKED, DEVELOPMENT, NOT_CHECKED, PROVENANCE_DATE, PROVENANCE_VERSION, provenanceRows } from "../lib/assessment/provenance.ts";

const modules = provenanceRows()
  .map(({ module, record, items }) => {
    const rows = items
      .map(
        ({ item, record: r, scoring }) => `#### ${item.id}${item.reverse ? " (반대 방향 문항)" : ""}

"${item.text}"

- 알아보려는 생활 행동: ${r?.behavior ?? "기록 없음"}
- 점수 읽는 법: ${scoring}
- 이렇게 쓴 이유: ${r?.why ?? "기록 없음"}
`,
      )
      .join("\n");
    return `### ${record.title} — 문항 ${items.length}개 (버전 ${module.version}, 개발용 예시)

- 기존 이론과의 대응: ${record.corresponds}
- 가져오지 않은 것: ${record.notUsed}
- 지금의 쓰임: ${record.handling}

${rows}`;
  })
  .join("\n");

const doc = `# 성향 질문 문항별 개발 기록 (내부 · ${PROVENANCE_VERSION} · ${PROVENANCE_DATE} 정리)

- **내부 문서다.** 공개 페이지(\`/assessment-basis\`, "미유 성향 질문은 어떻게 만들었나요?")는 다섯 가지 요약만 보여 준다 — 어떤 성향을 보는지 · 어떻게 개발했는지 · 참고 자료와 이용 허락 범위 · 확인한 것과 못 한 것 · 검사 버전과 수정일. 문항 문장과 아래의 문항별 기록은 공개하지 않는다.
- 코드: \`lib/assessment/provenance.ts\`(기록) · \`provenance.test.ts\`(빠진 문항 · 하지 않은 확인을 했다고 쓴 표현을 막는다). 이 문서는 \`node scripts/render-assessment-item-records.ts\`로 코드에서 만든다.
- 이 기록은 문항을 쓸 당시의 메모가 아니라 ${PROVENANCE_DATE}에 문항 문장을 보고 다시 정리한 것이다.
- **법적 판단이 아니다.** 법적으로 문제가 없다는 확인도, 검사의 정확도 · 타당도 보증도 아니다.

## 확인한 것 · 확인하지 못한 것 (공개 페이지와 같다)

확인한 것
${CHECKED.map((t) => `- ${t}`).join("\n")}

확인하지 못한 것
${NOT_CHECKED.map((t) => `- ${t}`).join("\n")}

## 개발 방법 (공개 페이지와 같다)

${DEVELOPMENT.map((t) => `- ${t}`).join("\n")}

## 문항별 기록

${modules}`;

writeFileSync(new URL("../docs/assessment-item-records.md", import.meta.url), doc);
console.log(`docs/assessment-item-records.md (${doc.length}자)`);
