// 리포트 예시용 가상 데이터.
// 실제 검사·만세력 계산 결과가 아니다. 운영 데이터와 섞지 않는다.

import { mbtiModule, relationshipModule, temperamentModule } from "../assessment/modules/index.ts";
import { toAxisRows, toScoreRows } from "../report/rows.ts";
import type { FullReport } from "../report/types.ts";

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
  temperament: toScoreRows(temperamentModule, {
    novelty: 34,
    caution: 71,
    sensitivity: 66,
    persistence: 58,
  }),
  relationship: toScoreRows(relationshipModule, { anxiety: 72, avoidance: 28 }),
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
      basis: "생년월일·출생시간으로 계산한 사주 원국 (이 예시는 가상 원국)",
      findings: [
        "일간은 을목입니다. 전통 해석에서는 유연하게 뻗어 나가는 풀이나 덩굴에 비유합니다.",
        "오행 중 목이 3개로 가장 많고, 금은 없습니다.",
      ],
      limits:
        "사주는 전통 해석 체계이며 과학적으로 검증된 성격 측정이 아닙니다. 심리검사 점수와 합산하지 않습니다. 이 예시의 원국은 만세력으로 계산한 값이 아닙니다.",
      saju: {
        status: "sample",
        pillars: [
          { position: "시주", stem: "壬", branch: "午" },
          { position: "일주", stem: "乙", branch: "未" },
          { position: "월주", stem: "丁", branch: "卯" },
          { position: "년주", stem: "甲", branch: "戌" },
        ],
        dayMaster: "을목(乙木)",
        elements: [
          { name: "목", count: 3 },
          { name: "화", count: 2 },
          { name: "토", count: 2 },
          { name: "금", count: 0 },
          { name: "수", count: 1 },
        ],
      },
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
          "사주 예시에서 일간을 ‘유연하게 뻗어 나가는 나무’로 보는 해석은 기질의 높은 신중함과 방향이 다릅니다. 사주는 전통 해석 체계이므로 심리검사 점수에 맞춰 바꾸지 않고 따로 제시합니다.",
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
};
