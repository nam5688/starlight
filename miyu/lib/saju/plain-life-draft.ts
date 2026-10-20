// 무료 결과 문장의 생활 말 문구 — 무료 미리보기에 적용했다 (운영자 요청 · 승인 2026-10-20: "임수 · 수 기운 · 그 주제가 크게 느껴질 수" 해설과 긴 문단을 생활 말 · 문장별 줄바꿈 기준으로).
//
// 무료 결과의 이 문장들은 원래 `plain.ts`(일간 한 줄 · 오행 설명 · 관계 한 줄)가 만들고 화면이 그대로 보였다. 지금은 이 파일의 문구가 `lib/report/preview.ts`의 `saju.life`로 들어가
// `components/report/free-preview-body.tsx`가 앞에 읽히게 보이고, 사주 용어로 부르는 이름은 접힌 보조 영역(term)에만 둔다. `plain.ts` · 저장된 결과 · 유료 리포트 · 채팅 · AI 지시문은 바꾸지 않았다(plain-life-draft.test.ts가 연결 지점이 preview.ts 하나뿐임을 확인한다).
//
// 바꾸는 방식(의미는 그대로 두고 말만 바꾼다):
//  · 앞에서 읽히는 문장에는 사주 용어(임수 · 수 기운 · 일간 · 오행)와 한자 · 괄호 풀이를 쓰지 않고, 사람의 모습 · 힘 · 어려움으로 말한다. 용어 이름은 보조 한 줄(`term`)로만 따로 둔다 — 보일지 · 접어 둘지는 운영자 결정.
//  · 없거나 적은 기운은 "그 힘이 부족하다"로 번역하지 않는다(기존 규칙). 지금 문구가 말하는 범위(① 그 주제가 크게 와닿는 시기가 있다고 본다 ② 일부러 챙기라고 권하는 해석이 많다 ③ 그렇다고 그런 모습이 없다는 뜻은 아니다)만 쓰고, 사주 글자 구성이 말하는 것과 사람이 어떤 사람인지를 한 문장에 섞지 않는다.
//  · 한 문장에 하나만 말하고, 한 문장은 모바일에서 두 줄을 넘지 않게 짧게 쓴다(글자 수 한도는 시험이 지킨다).
//  · 일간 열 가지의 세 문장은 지금 `plain.ts`의 trait · goodAt · watchOut이 말하는 범위를 옮긴 것이다 — 새로운 해석을 더하지 않았다.
import type { FiveElement } from "./engine.ts";
import { ELEMENT_INFO, type ElementLevel } from "./plain.ts";
import { splitSentences } from "../report/reading/line-breaks.ts";

export const LIFE_DRAFT_VERSION = "plain-life-draft-0.1";

export type LifeLines = {
  /** 앞에서 읽히는 문장들 — 한 문장이 한 줄 덩어리 */
  lines: string[];
  /** 사주 용어로는 어떻게 부르는지 한 줄 — 보조 위치(작은 글씨 · 접힘)에만 둔다. 앞 문장에는 쓰지 않는다 */
  term: string;
};

/** 일간 열 가지 — [한 줄 모습, 잘하는 점, 조심할 점]. plain.ts의 trait · goodAt · watchOut을 생활 말로 옮겼다 */
const DAY_MASTER_LIFE: Record<string, [string, string, string]> = {
  갑: ["목표가 생기면 곧게 앞으로 나아가는 쪽이에요.", "시작하고 앞장서는 일에서 힘이 나요.", "한번 정한 건 굽히기 어려워서 고집으로 보일 때도 있어요."],
  을: ["주변 분위기에 맞춰 유연하게 움직이는 쪽이에요.", "상황을 읽고 맞추는 감각이 좋아서 관계에서 편안한 사람이 되기 쉬워요.", "눈치를 보다가 속마음을 말하는 게 늦어질 때가 있어요."],
  병: ["밝게 드러내고 먼저 나서는 쪽이에요.", "곁에 있으면 분위기가 살아나는 사람이라는 말을 듣기 쉬워요.", "열정이 식으면 갑자기 조용해지고, 관심이 한쪽으로 쏠릴 때도 있어요."],
  정: ["한 가지에 오래 집중하고 사람을 세심하게 챙기는 쪽이에요.", "조용하지만 따뜻한 온기가 있어요.", "속으로 오래 품고 있다가 예민해질 때가 있어요."],
  무: ["중심을 잡고 묵직하게 버티는 쪽이에요.", "곁에 있으면 믿음직하다는 말을 듣기 쉬워요.", "변화에는 느린 편이고, 속마음은 잘 드러내지 않아요."],
  기: ["사람과 일을 품어서 키우듯 돌보는 쪽이에요.", "실속 있게 챙기는 꼼꼼함이 있어요.", "걱정이 늘고, 남에게 맞추다 지칠 때가 있어요."],
  경: ["원칙을 세우고 미루지 않고 결단하는 쪽이에요.", "옳고 그름이 분명해서 정의감이 강해요.", "말이 직선적이라 타협하기 어려운 사람으로 보일 때도 있어요."],
  신: ["섬세하고 완성도를 끝까지 따지는 쪽이에요.", "눈이 정교해서 세밀한 부분을 다듬는 데 힘이 나요.", "예민해지기 쉽고, 자존심이 상하면 오래 남을 수 있어요."],
  임: ["넓게 받아들이고 큰 그림부터 보는 쪽이에요.", "생각의 폭이 넓어서 한 가지에 갇히지 않아요.", "흐름을 따라가다 방향이 흩어질 때도 있어요."],
  계: ["조용히 스며들듯 분위기와 마음을 읽는 쪽이에요.", "직감이 좋고 공감하는 힘이 커요.", "생각이 많아지고, 남의 감정까지 떠안을 때가 있어요."],
};

/** 태어난 날의 글자(일간)를 사람의 모습으로 — label은 plain.ts의 "임수(壬)" · image는 "큰 강 · 바다" */
export function dayMasterLife(stem: string, label: string, image: string): LifeLines | null {
  const lines = DAY_MASTER_LIFE[stem];
  return lines ? { lines: [...lines], term: `사주 용어로는 ‘${label}’이고, ${image}에 비유해요.` } : null;
}

/** 오행마다 "그 힘이 무엇인지"를 짧은 한 구절로 — life-words.ts의 표현 예시와 같은 뜻(문장이 길어지지 않게 줄였다) */
const POWER: Record<FiveElement, string> = {
  목: "시작하고 키우는 일",
  화: "마음을 드러내는 일",
  토: "안정을 지키는 일",
  금: "기준을 세우고 정하는 일",
  수: "생각하고 쉬어 가는 일",
};

const ELEMENT_TERM: Record<FiveElement, string> = { 목: "목(나무)", 화: "화(불)", 토: "토(흙)", 금: "금(쇠)", 수: "수(물)" };

/**
 * 오행 하나가 많거나(many) 적거나 없을 때의 설명.
 *  · many: 지금 문구(ELEMENT_INFO.many)가 이미 생활 말이라 문장만 나눈다(앞의 "토(흙) 기운이 많아요 —"만 사라진다).
 *  · few · none: 같은 문구를 쓴다(지금도 둘이 같다) — 사주 글자 구성이 말하는 것 · 전통 해석이 말하는 시기 · 권하는 해석 · "없다는 뜻이 아니다"를 문장마다 따로 말한다.
 */
export function elementLife(el: FiveElement, level: Extract<ElementLevel, "many" | "few" | "none">): LifeLines {
  if (level === "many") return { lines: splitSentences(ELEMENT_INFO[el].many), term: `사주 용어로는 ${ELEMENT_TERM[el]} 기운이 많은 구성이에요.` };
  const topic = POWER[el];
  return {
    lines: [
      `${topic}은 이 사주에서 크게 도드라지지는 않아요.`,
      "그렇다고 그런 모습이 없다는 뜻은 아니에요.",
      `전통 해석으로는 ${topic}이 유난히 크게 와닿는 시기가 있다고 봐요.`,
      "그럴 때는 일부러 챙겨 보라고 권하는 해석이 많아요.",
    ],
    term: `사주 용어로는 ${ELEMENT_TERM[el]} 기운이 ${level === "none" ? "없는" : "적은"} 구성이에요.`,
  };
}

/** 가까운 관계에서 이렇게 나타날 수 있어요 — 기운이 적거나 없을 때(많을 때의 문구는 지금 그대로 생활 말이라 문장만 나눈다) */
export function relationLife(el: FiveElement, level: ElementLevel): string[] | null {
  if (level === "many") return splitSentences(ELEMENT_INFO[el].manyDomains.relation);
  if (level === "none" || level === "few") {
    const topic = POWER[el];
    return [`${topic}이 가까운 관계에서 더 또렷해지는 시기가 있다고 봐요.`, "평소 모습은 내가 고른 답과 가까운 사람의 말에서 확인하는 쪽이 정확해요."];
  }
  return null;
}

/** 관계 한 줄의 첫머리 — 지금은 "토(흙) 기운이 많아요 —"처럼 용어로 시작한다 */
export function relationLeadLife(el: FiveElement, level: ElementLevel): string | null {
  if (level === "many") return `${POWER[el]}에서 힘이 도드라져요.`;
  if (level === "none" || level === "few") return `${POWER[el]}은 이 사주에서 크게 도드라지지는 않아요.`;
  return null;
}

/** 한 줄 소개 — "큰 강 · 바다처럼 넓게 흐르는 사람 — 원국에는 토(흙) 기운이 많고 …" 대신. 많은 기운만 생활 말로 말한다(없는 기운은 위 elementLife에서 따로 말한다) */
export function headlineLife(stem: string, many: FiveElement[]): string[] | null {
  const first = DAY_MASTER_LIFE[stem]?.[0];
  if (!first) return null;
  const lines = [first];
  if (many.length) lines.push(`타고난 구성에서는 ${many.map((m) => POWER[m]).join(" · ")}에서 힘이 도드라져요.`);
  return lines;
}
