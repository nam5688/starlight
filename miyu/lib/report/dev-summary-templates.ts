import type { TendencyId } from "../assessment/dev-rules.ts";
import type { CoreSummary } from "./types.ts";

// 개발용 요약 문구 — 대표 경향 후보별 임시 문구.
// 운영에서는 "서버 채점 → 구조화된 결과 → AI 해석 → 저장" 흐름으로 대체한다.
// 서버에서만 불러온다 (화면 코드에서 import하지 않는다).

export const DEV_SUMMARY_TEMPLATES: Record<TendencyId, { oneLiner: string; core: CoreSummary }> = {
  reassurance: {
    oneLiner: "관계가 불확실할 때, 상대의 반응을 확인하려는 편이에요.",
    core: {
      comfortableEnvironment: "서로의 기대와 연락 방식이 미리 공유되어, 반응의 이유를 짐작하지 않아도 되는 관계",
      repeatedReaction: "연락이나 반응이 평소와 달라지면 그 이유가 마음에 남아 확인하고 싶어질 수 있어요.",
      stressTrigger: "분명한 답을 듣지 못한 채 기다려야 하거나, 연락이 달라진 이유를 알 수 없을 때",
      tryNow: "불안할 때는 추측을 늘리기보다 확인하고 싶은 것 한 가지를 짧게 묻기",
    },
  },
  distance: {
    oneLiner: "가까워질수록, 나만의 시간과 공간을 먼저 확보하려는 편이에요.",
    core: {
      comfortableEnvironment: "각자의 시간이 존중되고, 마음을 꺼내는 속도를 기다려 주는 관계",
      repeatedReaction: "관계가 깊어질수록 혼자 숨 돌리는 시간이 필요해지고, 마음을 말로 꺼내기까지 시간이 걸릴 수 있어요.",
      stressTrigger: "혼자 정리할 시간 없이 마음을 바로 말해야 할 때",
      tryNow: "거리가 필요할 때는 연락을 끊기 전에 ‘언제 다시 이야기할지’를 먼저 알려주기",
    },
  },
  stability: {
    oneLiner: "변화가 생기면, 익숙한 방식과 계획을 먼저 지키려는 편이에요.",
    core: {
      comfortableEnvironment: "익숙한 방식을 이어 갈 수 있고, 바꾸기 전에 확인할 시간이 있는 환경",
      repeatedReaction: "새로운 선택지 앞에서 위험 요소를 먼저 살피고, 해본 적 있는 방식에 마음이 갈 수 있어요.",
      stressTrigger: "충분한 정보 없이 빠르게 결정해야 할 때",
      tryNow: "결정이 길어질 때는 확인할 항목을 세 가지로 줄이고 마감 시간을 정하기",
    },
  },
  exploration: {
    oneLiner: "익숙한 상황이 길어지면, 새로운 방식이나 경험을 먼저 찾는 편이에요.",
    core: {
      comfortableEnvironment: "시도해볼 여지가 있고, 방식을 스스로 정할 수 있는 환경",
      repeatedReaction: "흥미가 생기면 빠르게 시작하고, 진행하면서 방향을 조정하는 편일 수 있어요.",
      stressTrigger: "같은 절차를 오래 반복하거나 바꿀 여지가 없을 때",
      tryNow: "새 일을 시작할 때 ‘끝났다고 볼 기준’ 한 가지를 먼저 적어두기",
    },
  },
};
