// 개발용 리포트 생성기 — 점수와 임시 규칙으로 문장을 조합한다 (AI 미사용).
// 결과에는 source: "dev-scoring"이 붙고, 화면에 개발용 표시가 나온다.

import type { TendencyId } from "../assessment/dev-rules.ts";
import type { ReportGenerator, ReportInput } from "./generator.ts";
import type { AxisRow, FullReport, ScoreRow } from "./types.ts";

const ACTIONS: Record<TendencyId, FullReport["actions"]> = {
  reassurance: [
    {
      title: "불안할 때 추측 대신 한 문장으로 묻기",
      detail: "예: “오늘 바빴어? 내일 통화 가능해?” 확인 한 번이 긴 고민을 줄여줍니다.",
    },
    {
      title: "연락 주기를 미리 이야기해 두기",
      detail: "기대하는 연락 빈도를 먼저 맞춰 두면, 답이 늦을 때 덜 흔들립니다.",
    },
    {
      title: "확인하고 싶은 것 중 하나만 먼저 묻기",
      detail: "여러 가지를 한 번에 묻기보다 가장 중요한 하나를 먼저 확인합니다.",
    },
  ],
  distance: [
    {
      title: "거리가 필요할 때 ‘언제 다시 이야기할지’ 먼저 알리기",
      detail: "연락을 끊기 전에 돌아올 시점을 알려 주면 상대의 불안이 줄어듭니다.",
    },
    {
      title: "혼자 정리하는 시간을 일정에 넣어 두기",
      detail: "미리 확보한 시간이 있으면 갑자기 물러날 일이 줄어듭니다.",
    },
    {
      title: "작은 도움 하나를 먼저 부탁해 보기",
      detail: "기대는 연습을 부담이 적은 일부터 시작합니다.",
    },
  ],
  stability: [
    {
      title: "결정이 길어질 때 확인할 항목을 세 가지로 줄이기",
      detail: "마감 시간을 함께 정하면 준비만 길어지는 것을 막을 수 있습니다.",
    },
    {
      title: "익숙한 방식 안에서 한 가지만 바꿔 보기",
      detail: "변화를 작게 나누면 부담이 줄어듭니다.",
    },
    {
      title: "계획이 바뀔 때의 대안 하나를 미리 적어 두기",
      detail: "변경이 생겨도 덜 흔들리고 바로 다음 행동을 고를 수 있습니다.",
    },
  ],
  exploration: [
    {
      title: "새 일을 시작할 때 ‘끝났다고 볼 기준’ 먼저 적기",
      detail: "흥미가 떨어질 때도 마무리 지점을 잡기 쉬워집니다.",
    },
    {
      title: "동시에 진행하는 일을 두 가지로 제한하기",
      detail: "새로운 시도가 늘어도 끝내는 일이 줄지 않게 합니다.",
    },
    {
      title: "반복되는 일에 작은 변화를 정해 두기",
      detail: "같은 절차가 길어질 때 지루함을 덜 수 있습니다.",
    },
  ],
};

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
  if (axis.score >= HIGH) return `${axis.label}은 ${axis.highCode} 쪽입니다. ${sentence(axis.highMeaning)}`;
  if (axis.score <= LOW) return `${axis.label}은 ${axis.lowCode} 쪽입니다. ${sentence(axis.lowMeaning)}`;
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
  const code = summary.mbti.code;

  // 알고 있던 MBTI와 다른 지표
  const differingAxes =
    knownMbti && knownMbti.length === 4
      ? summary.mbti.axes.filter((a, i) => code[i] !== "X" && code[i] !== knownMbti[i]).map((a) => a.label)
      : [];

  const mbtiFindings = summary.mbti.axes.map(axisFinding);
  if (knownMbti) {
    mbtiFindings.push(
      differingAxes.length === 0
        ? "알고 있던 MBTI와 이번 응답이 같습니다."
        : `알고 있던 MBTI는 ${knownMbti}이며, 이번 응답과는 ${differingAxes.join(", ")} 지표에서 다릅니다.`,
    );
  }

  // 공통적으로 나타나는 특징 — 서로 다른 영역의 지표가 같은 방향일 때만 적는다
  const common: FullReport["integrated"]["common"] = [];
  if (t.caution >= HIGH && axes.jp && axes.jp.score <= LOW) {
    common.push({
      point: "미리 계획하고 대비하려는 경향",
      basis: [`기질 · 신중함 ${t.caution}`, `MBTI · ${axes.jp.lowCode} 쪽`],
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
      basis: [`기질 · 새로움 추구 ${t.novelty}`, `MBTI · ${axes.jp.highCode} 쪽`],
    });
  }
  if (r.avoidance >= HIGH && axes.ei && axes.ei.score >= HIGH) {
    common.push({
      point: "혼자 정리하는 시간이 중요한 편",
      basis: [`관계 · 거리 두기 ${r.avoidance}`, `MBTI · ${axes.ei.highCode} 쪽`],
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
        "MBTI 응답에서는 논리와 기준을 먼저 따지는 T 쪽이었지만, 관계 응답에서는 상대의 반응에 민감했습니다. 판단 방식과 관계에서의 감정은 서로 다른 영역이라 함께 나타날 수 있습니다.",
    });
  }
  if (t.novelty >= HIGH && t.caution >= HIGH) {
    different.push({
      point: "새로움 추구와 신중함이 함께 높음",
      explanation: "새로운 것에 끌리면서도 시작 전에 위험을 살피는 편이라, 결정에 시간이 걸릴 수 있습니다.",
    });
  }
  if (knownMbti && differingAxes.length > 0) {
    different.push({
      point: "알고 있던 MBTI와 이번 응답",
      explanation: `${differingAxes.join(", ")} 지표가 다르게 나왔습니다. 중간값 50에 가까운 지표는 시기나 상황에 따라 달라질 수 있습니다.`,
    });
  }
  if (different.length === 0) {
    different.push({ point: "서로 크게 다른 결과는 없었습니다.", explanation: "영역별 점수를 함께 참고하세요." });
  }

  const relationshipFindings = summary.relationship.map(scoreFinding);
  const temperamentFindings = byStrength(summary.temperament).slice(0, 3).map(scoreFinding);
  const sajuConnected = input.saju.status === "ok";

  return {
    ...summary,
    personName: input.nickname,
    knownMbti,
    details: {
      mbti: {
        basis: "MBTI 성향 문항 응답 (개발용 예시 문항)",
        findings: mbtiFindings,
        limits:
          "공식 MBTI® 검사가 아니며, 개발용 예시 문항으로 계산했습니다. 중간값 50에 가까운 지표는 상황에 따라 다르게 나올 수 있습니다.",
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
        basis: `${input.birthText}${sajuConnected ? "" : " — 만세력 계산 연결 전"}`,
        findings: sajuConnected
          ? ["원국 해석 문구는 아직 연결되지 않았습니다."]
          : ["만세력 계산 모듈이 연결되면 원국과 오행 분포를 이 자리에 표시합니다."],
        limits: "사주는 전통 해석 체계이며 과학적으로 검증된 성격 측정이 아닙니다. 심리검사 점수와 합산하지 않습니다.",
        saju: { status: "not-connected" },
      },
    },
    integrated: { common, different },
    actions: ACTIONS[summary.tendency.id],
  };
}

export const devReportGenerator: ReportGenerator = {
  name: "dev-rules",
  version: "dev-0.1",
  async generate(input) {
    return buildDevReport(input);
  },
};
