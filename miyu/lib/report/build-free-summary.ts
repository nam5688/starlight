import { classifyTendency, TENDENCY_NAMES } from "../assessment/dev-rules.ts";
import { mbtiModule, relationshipModule, temperamentModule } from "../assessment/modules/index.ts";
import { scoreModule, toScoreMap } from "../assessment/scoring.ts";
import type { Answers } from "../assessment/types.ts";
import { DEV_SUMMARY_TEMPLATES } from "./dev-summary-templates.ts";
import { buildFreeInsight } from "./free-insight.ts";
import { toAxisRows, toScoreRows } from "./rows.ts";
import type { FreeSummary } from "./types.ts";

/** 검증을 통과한 응답으로 무료 요약을 만든다. 상세 리포트 내용은 여기서 만들지 않는다. */
export function buildDevFreeSummary(answers: Answers): FreeSummary {
  const mbtiScores = scoreModule(mbtiModule, answers);
  const temperament = toScoreMap(scoreModule(temperamentModule, answers));
  const relationship = toScoreMap(scoreModule(relationshipModule, answers));
  const tendency = classifyTendency(temperament, relationship);
  const template = DEV_SUMMARY_TEMPLATES[tendency.id];

  const insight = buildFreeInsight(answers, tendency.id);
  return {
    source: "dev-scoring",
    contentVersion: [mbtiModule, temperamentModule, relationshipModule]
      .map((m) => `${m.id}@${m.version}`)
      .join(" "),
    tendency: { id: tendency.id, name: TENDENCY_NAMES[tendency.id] },
    oneLiner: template.oneLiner,
    ...(insight ? { insight } : {}),
    core: template.core,
    temperament: toScoreRows(temperamentModule, temperament),
    relationship: toScoreRows(relationshipModule, relationship),
    // 자체 응답을 MBTI 유형 글자로 바꾸지 않는다 — 네 가지 방향의 점수(0~100 환산값)만 만든다
    mbti: {
      axes: toAxisRows(mbtiModule, toScoreMap(mbtiScores)),
    },
  };
}
