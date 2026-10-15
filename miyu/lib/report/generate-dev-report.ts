// 개발용 리포트 생성기 — 점수와 임시 규칙으로 문장을 조합한다 (AI 미사용).
// 결과에는 source: "dev-scoring"이 붙고, 화면에 개발용 표시가 나온다.

import { FIVE_ELEMENTS, type FiveElement } from "../saju/engine.ts";
import { sajuSection } from "../saju/display.ts";
import type { ReportGenerator, ReportInput } from "./generator.ts";
import { buildReportExtras } from "./extras.ts";
import { seoulReference } from "./reference.ts";
import { STARTER_ACTIONS } from "./starter-actions.ts";
import type { AxisRow, FullReport, ScoreRow } from "./types.ts";

const HIGH = 60;
const LOW = 40;

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function scoreFinding(row: ScoreRow): string {
  if (row.score >= HIGH) return `${row.label} ${row.score}: ${sentence(row.highMeaning)}`;
  if (row.score <= LOW) return `${row.label} ${row.score}: ${sentence(row.lowMeaning)}`;
  return `${row.label} ${row.score}: 중간 정도입니다.`;
}

function axisFinding(axis: AxisRow): string {
  if (axis.score >= HIGH) return `${axis.label}은 ${axis.highName} 쪽입니다. ${sentence(axis.highMeaning)}`;
  if (axis.score <= LOW) return `${axis.label}은 ${axis.lowName} 쪽입니다. ${sentence(axis.lowMeaning)}`;
  return `${axis.label}은 중간에 가깝습니다. 상황에 따라 달라질 수 있습니다.`;
}

function byStrength(rows: ScoreRow[]): ScoreRow[] {
  return [...rows].sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
}

export function buildDevReport(input: ReportInput): FullReport {
  const { summary, knownMbti } = input;
  const t = Object.fromEntries(summary.temperament.map((r) => [r.id, r.score]));
  const r = Object.fromEntries(summary.relationship.map((row) => [row.id, row.score]));
  const axes = Object.fromEntries(summary.mbti.axes.map((a) => [a.id, a]));

  // 이번 응답을 MBTI 유형으로 바꾸지 않는다 — 본인이 입력한 값은 참고용으로만 따로 적는다
  const mbtiFindings = summary.mbti.axes.map(axisFinding);
  if (knownMbti) {
    mbtiFindings.push(`본인이 입력한 MBTI는 ${knownMbti}이며, 참고값으로 따로 보관했고 이번 응답과 비교하거나 유형으로 바꾸지 않습니다.`);
  }

  // 공통적으로 나타나는 특징 — 서로 다른 영역의 지표가 같은 방향일 때만 적는다
  const common: FullReport["integrated"]["common"] = [];
  if (t.caution >= HIGH && axes.jp && axes.jp.score <= LOW) {
    common.push({
      point: "미리 계획하고 대비하려는 경향",
      basis: [`기질 · 신중함 ${t.caution}`, `평소 행동 방식 · ${axes.jp.lowName} 쪽`],
    });
  }
  if (t.sensitivity >= HIGH && r.anxiety >= HIGH) {
    common.push({
      point: "다른 사람의 반응이 행동과 기분에 영향을 주는 편",
      basis: [`기질 · 타인 반응 민감도 ${t.sensitivity}`, `관계 · 관계 불안 ${r.anxiety}`],
    });
  }
  if (t.novelty >= HIGH && axes.jp && axes.jp.score >= HIGH) {
    common.push({
      point: "새로운 방식과 유연한 진행을 선호하는 편",
      basis: [`기질 · 새로움 추구 ${t.novelty}`, `평소 행동 방식 · ${axes.jp.highName} 쪽`],
    });
  }
  if (r.avoidance >= HIGH && axes.ei && axes.ei.score >= HIGH) {
    common.push({
      point: "혼자 정리하는 시간이 중요한 편",
      basis: [`관계 · 거리 두기 ${r.avoidance}`, `평소 행동 방식 · ${axes.ei.highName} 쪽`],
    });
  }
  if (t.persistence >= HIGH && t.caution >= HIGH) {
    common.push({
      point: "시작한 일을 신중하게 끝까지 이어가는 편",
      basis: [`기질 · 지속성 ${t.persistence}`, `기질 · 신중함 ${t.caution}`],
    });
  }
  if (common.length === 0) {
    common.push({ point: "여러 영역에서 함께 두드러지는 경향은 적습니다. 영역마다 따로 읽어 보세요.", basis: [] });
  }

  // 관점이 다른 부분 — 억지로 맞추지 않고 차이를 설명한다
  const different: FullReport["integrated"]["different"] = [];
  if (axes.tf && axes.tf.score <= LOW && (t.sensitivity >= HIGH || r.anxiety >= HIGH)) {
    different.push({
      point: "판단 방식과 관계에서의 감정",
      explanation:
        "평소 행동 방식 응답에서는 논리와 기준을 먼저 따지는 쪽이었지만, 관계 응답에서는 상대의 반응에 민감했습니다. 판단 방식과 관계에서의 감정은 서로 다른 영역이라 함께 나타날 수 있습니다.",
    });
  }
  if (t.novelty >= HIGH && t.caution >= HIGH) {
    different.push({
      point: "새로움 추구와 신중함이 함께 높음",
      explanation: "새로운 것에 끌리면서도 시작 전에 위험을 살피는 편이라, 결정에 시간이 걸릴 수 있습니다.",
    });
  }
  if (different.length === 0) {
    different.push({ point: "서로 크게 다른 결과는 없었습니다.", explanation: "영역별 점수를 함께 참고하세요." });
  }

  const relationshipFindings = summary.relationship.map(scoreFinding);
  const temperamentFindings = byStrength(summary.temperament).slice(0, 3).map(scoreFinding);
  const saju = input.saju;
  const extras = buildReportExtras({ summary, saju, reference: input.reference ?? seoulReference(new Date()) });

  return {
    ...summary,
    personName: input.nickname,
    knownMbti,
    details: {
      mbti: {
        basis: "평소 행동 방식 문항 응답 (개발용 예시 문항)",
        findings: mbtiFindings,
        limits:
          "MBTI® 같은 공식 검사가 아니며, 개발용 예시 문항으로 계산했습니다. 중간값 50에 가까운 지표는 상황에 따라 다르게 나올 수 있습니다.",
      },
      temperament: {
        basis: "기질 문항 응답 (개발용 예시 문항)",
        findings: temperamentFindings,
        limits:
          "타고난 성향을 확정하는 검사가 아니라, 현재 응답에서 보이는 경향입니다. 점수가 높거나 낮은 것 자체가 좋고 나쁨을 뜻하지 않습니다.",
      },
      relationship: {
        basis: "관계(애착) 문항 응답 (개발용 예시 문항)",
        findings: relationshipFindings,
        limits: "임상 진단이 아니며, 특정 관계나 시기의 경험에 따라 응답이 달라질 수 있습니다.",
      },
      saju: {
        basis: `${input.birthText}${saju.status === "ok" ? " · 만세력으로 계산한 원국" : " — 만세력 계산 연결 전"}`,
        findings:
          saju.status === "ok"
            ? [
                `일간은 ${saju.dayMaster.stem}${saju.dayMaster.element}(${saju.dayMaster.stemHanja}), ${saju.dayMaster.yinYang}의 ${saju.dayMaster.element}입니다. ${extras.plain ? `전통 해석에서는 ${extras.plain.dayMaster.image}에 비유하며, ${extras.plain.dayMaster.trait}` : ""}`.trim(),
                elementFinding(saju.elementCounts),
                ...(extras.plain?.everyday ?? []),
              ]
            : ["만세력 계산 결과가 없습니다."],
        limits: "사주는 전통 해석 체계이며 과학적으로 검증된 성격 측정이 아닙니다. 심리검사 점수와 합산하지 않습니다.",
        saju: sajuSection(saju),
      },
    },
    integrated: { common, different },
    actions: STARTER_ACTIONS[summary.tendency.id],
    extras,
  };
}

function elementFinding(counts: Record<FiveElement, number>): string {
  const entries = FIVE_ELEMENTS.map((e) => [e, counts[e]] as const);
  const max = Math.max(...entries.map(([, n]) => n));
  const most = entries.filter(([, n]) => n === max).map(([e]) => e);
  const none = entries.filter(([, n]) => n === 0).map(([e]) => e);
  const list = entries.map(([e, n]) => `${e} ${n}`).join(" · ");
  return `원국 글자의 오행: ${list}. 가장 많은 오행은 ${most.join("·")}${none.length ? `, 없는 오행은 ${none.join("·")}` : ""}입니다.`;
}

export const devReportGenerator: ReportGenerator = {
  name: "dev-rules",
  version: "dev-0.2",
  usesContext: false,
  async generate(input) {
    return buildDevReport(input);
  },
};
