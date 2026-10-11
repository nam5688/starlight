import "server-only";
import type { TendencyId } from "../assessment/dev-rules.ts";
import type { CoreSummary } from "./types.ts";

// 개발용 요약 문구 — 대표 경향 후보별 임시 문구.
// 운영에서는 "서버 채점 → 구조화된 결과 → AI 해석 → 저장" 흐름으로 대체한다.
// 서버 전용 파일이다 (브라우저 번들에 포함되지 않는다).

export const DEV_SUMMARY_TEMPLATES: Record<TendencyId, { oneLiner: string; core: CoreSummary }> = {
  reassurance: {
    oneLiner: "관계가 불확실할 때, 상대의 반응을 확인하려는 편입니다.",
    core: {
      comfortableEnvironment: "기대하는 것과 일정이 미리 공유되고, 연락 주기가 일정한 관계와 환경",
      repeatedReaction: "상대의 답이 늦거나 반응이 달라지면 이유를 여러 가지로 추측하고 다시 확인하려 합니다.",
      stressTrigger: "계획이 갑자기 바뀌거나, 분명한 답을 듣지 못한 채 기다려야 할 때",
      tryNow: "불안할 때는 추측을 늘리기보다 확인하고 싶은 것 한 가지를 짧게 묻기",
    },
  },
  distance: {
    oneLiner: "가까워질수록, 나만의 시간과 공간을 먼저 확보하려는 편입니다.",
    core: {
      comfortableEnvironment: "각자의 시간이 존중되고, 연락 빈도를 스스로 조절할 수 있는 관계",
      repeatedReaction: "감정적인 대화가 길어지면 잠시 물러나 혼자 정리한 뒤 다시 이야기하려 합니다.",
      stressTrigger: "즉각적인 답이나 감정 표현을 계속 요구받을 때",
      tryNow: "거리가 필요할 때는 연락을 끊기 전에 ‘언제 다시 이야기할지’를 먼저 알려주기",
    },
  },
  stability: {
    oneLiner: "변화가 생기면, 익숙한 방식과 계획을 먼저 지키려는 편입니다.",
    core: {
      comfortableEnvironment: "역할과 일정이 분명하고, 갑작스러운 변경이 적은 환경",
      repeatedReaction: "새로운 선택지 앞에서 위험 요소를 먼저 확인하고, 해본 적 있는 방식을 고릅니다.",
      stressTrigger: "충분한 정보 없이 빠르게 결정해야 할 때",
      tryNow: "결정이 길어질 때는 확인할 항목을 세 가지로 줄이고 마감 시간을 정하기",
    },
  },
  exploration: {
    oneLiner: "익숙한 상황이 길어지면, 새로운 방식이나 경험을 먼저 찾는 편입니다.",
    core: {
      comfortableEnvironment: "시도해볼 여지가 있고, 방식을 스스로 정할 수 있는 환경",
      repeatedReaction: "흥미가 생기면 빠르게 시작하고, 진행하면서 방향을 조정합니다.",
      stressTrigger: "같은 절차를 오래 반복하거나 바꿀 여지가 없을 때",
      tryNow: "새 일을 시작할 때 ‘끝났다고 볼 기준’ 한 가지를 먼저 적어두기",
    },
  },
};
