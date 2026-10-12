// 리포트 예시용 가상 데이터.
// 실제 검사·만세력 계산 결과가 아니다. 운영 데이터와 섞지 않는다.

import { mbtiModule, relationshipModule, temperamentModule } from "../assessment/modules/index.ts";
import { buildReportExtras } from "../report/extras.ts";
import { toAxisRows, toScoreRows } from "../report/rows.ts";
import type { FullReport } from "../report/types.ts";
import { sajuSection } from "../saju/display.ts";
import type { SajuOk } from "../saju/engine.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";

// 가상의 인물(서윤)의 생년월일을 실제 만세력 엔진으로 계산한 원국 — 리포트가 어떻게 풀리는지 보여 주는 예시용이다.
const SAMPLE_CHART = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }) as SajuOk;
const COMPUTED = sajuSection(SAMPLE_CHART);
if (COMPUTED.status === "not-connected") throw new Error("예시 원국을 계산하지 못했습니다.");
const SAMPLE_SAJU = { ...COMPUTED, status: "sample" as const };
const SAMPLE_TEMPERAMENT = toScoreRows(temperamentModule, { novelty: 34, caution: 71, sensitivity: 66, persistence: 58 });
const SAMPLE_RELATIONSHIP = toScoreRows(relationshipModule, { anxiety: 72, avoidance: 28 });

export const sampleReport: FullReport = {
  source: "sample",
  contentVersion: "sample-0.1",
  personName: "서윤",
  knownMbti: "INFJ",
  tendency: { id: "reassurance", name: "확인추구형" },
  oneLiner: "관계가 불확실할 때, 상대의 반응을 확인하려는 편입니다.",
  core: {
    comfortableEnvironment: "기대하는 것과 일정이 미리 공유되고, 연락 주기가 일정한 관계와 환경",
    repeatedReaction: "상대의 답이 늦거나 반응이 달라지면 이유를 여러 가지로 추측하고 다시 확인하려 합니다.",
    stressTrigger: "계획이 갑자기 바뀌거나, 분명한 답을 듣지 못한 채 기다려야 할 때",
    tryNow: "불안할 때는 추측을 늘리기보다 확인하고 싶은 것 한 가지를 짧게 묻기",
  },
  temperament: SAMPLE_TEMPERAMENT,
  relationship: SAMPLE_RELATIONSHIP,
  mbti: {
    code: "INTJ",
    axes: toAxisRows(mbtiModule, { ei: 68, sn: 59, tf: 38, jp: 31 }),
  },
  details: {
    mbti: {
      basis: "MBTI 성향 문항 8개 응답 (개발용 예시 문항)",
      findings: [
        "혼자 정리하는 시간에서 에너지를 얻는 I 쪽으로 응답했습니다.",
        "결정할 때는 논리와 기준을 따지는 T 쪽, 생활에서는 미리 정해 두는 J 쪽을 선호했습니다.",
        "본인이 알고 있던 INFJ와는 판단 기준 지표에서 다르게 나왔습니다.",
      ],
      limits:
        "공식 MBTI® 검사가 아니며, 화면 확인용 예시 문항으로 계산했습니다. 중간값 50에 가까운 지표는 상황에 따라 다르게 나올 수 있습니다.",
    },
    temperament: {
      basis: "기질 문항 8개 응답 (개발용 예시 문항)",
      findings: [
        "새로운 일을 시작하기 전에 위험과 변수를 먼저 살피는 편입니다 (신중함 71).",
        "익숙한 방식을 선호하는 쪽에 가깝습니다 (새로움 추구 34).",
        "다른 사람의 반응이 의욕에 영향을 주는 편입니다 (타인 반응 민감도 66).",
      ],
      limits:
        "타고난 성향을 확정하는 검사가 아니라, 현재 응답에서 보이는 경향입니다. 점수가 높거나 낮은 것 자체가 좋고 나쁨을 뜻하지 않습니다.",
    },
    relationship: {
      basis: "관계(애착) 문항 6개 응답 (개발용 예시 문항)",
      findings: [
        "관계가 불확실하면 상대의 반응을 확인하고 싶어지는 편입니다 (관계 불안 72).",
        "가까워지고 기대는 것은 비교적 편하게 느낍니다 (거리 두기 28).",
      ],
      limits:
        "임상 진단이 아니며, 특정 관계나 시기의 경험에 따라 응답이 달라질 수 있습니다.",
    },
    saju: {
      basis: "생년월일·출생시간으로 계산한 사주 원국 (가상 인물 예시)",
      findings: [
        "일간은 정화(丁), 음의 화입니다. 전통 해석에서는 촛불에 비유하며, 한곳을 오래 비추는 집중력과 섬세함으로 봅니다.",
        "원국 글자의 오행은 목 3 · 토 3 · 화 1 · 금 1 · 수 0입니다. 목과 토가 많고 수가 없습니다.",
        "수(물) 기운이 없어요 — 생각을 멈추고 쉬어 가는 일이 서툴 수 있어요. 쉬는 것도 일처럼 계획해야 마음이 놓일 수 있다고 봅니다.",
      ],
      limits:
        "사주는 전통 해석 체계이며 과학적으로 검증된 성격 측정이 아닙니다. 심리검사 점수와 합산하지 않습니다. 이 예시는 가상 인물의 생년월일을 만세력으로 계산한 것입니다.",
      saju: SAMPLE_SAJU,
    },
  },
  integrated: {
    common: [
      {
        point: "불확실한 상황에서 미리 확인하고 대비하려는 경향",
        basis: ["기질 · 신중함 71", "관계 · 관계 불안 72", "MBTI · J 선호"],
      },
      {
        point: "다른 사람의 반응이 행동과 기분에 영향을 주는 편",
        basis: ["기질 · 타인 반응 민감도 66", "관계 · 관계 불안 72"],
      },
    ],
    different: [
      {
        point: "판단 방식과 관계에서의 감정",
        explanation:
          "MBTI 응답에서는 논리와 기준을 먼저 따지는 T 쪽이었지만, 관계 응답에서는 상대의 반응에 민감했습니다. 판단 방식과 관계에서의 감정은 서로 다른 영역이라 함께 나타날 수 있습니다.",
      },
      {
        point: "알고 있던 MBTI와 이번 응답",
        explanation:
          "알고 있던 INFJ와 이번 응답 INTJ는 판단 기준에서 다릅니다. 이 지표는 38로 중간값에 비교적 가까워, 시기나 상황에 따라 다르게 나올 수 있습니다.",
      },
      {
        point: "사주 해석과 기질 점수",
        explanation:
          "사주 예시에서 일간을 ‘한곳을 오래 비추는 촛불’로 보는 해석은 기질의 높은 신중함과 비슷한 방향으로 읽힙니다. 하지만 두 결과는 서로 다른 근거이므로 합치지 않고 따로 제시하며, 사주는 심리검사 점수에 맞춰 바꾸지 않습니다.",
      },
    ],
  },
  actions: [
    {
      title: "연락이 늦어 불안할 때, 추측 대신 한 문장으로 묻기",
      detail: "예: “오늘 바빴어? 내일 통화 가능해?” 확인 한 번이 긴 고민을 줄여줍니다.",
    },
    {
      title: "새 일은 ‘첫 단계’만 정하고 바로 시작하기",
      detail: "준비가 길어지기 쉬운 편입니다. 시작한 뒤 다시 점검할 날짜를 함께 정해 두세요.",
    },
    {
      title: "칭찬이 없을 때 확인할 내 기준 하나 적어두기",
      detail: "다른 사람의 반응에 따라 의욕이 흔들릴 때, 스스로 정한 기준으로 진행 상황을 확인합니다.",
    },
  ],
  extras: buildReportExtras({
    summary: { temperament: SAMPLE_TEMPERAMENT, relationship: SAMPLE_RELATIONSHIP, tendency: { id: "reassurance", name: "확인추구형" } },
    saju: SAMPLE_CHART,
    reference: { year: 2026, month: 10 },
  }),
};
