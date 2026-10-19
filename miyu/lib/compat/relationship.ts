// 궁합의 "무슨 사이인가요?"(관계)와 두 사람의 성별(남자 · 여자) — 간단 궁합(무료) · 사주 궁합 · 리포트 궁합이 같은 값과 같은 문구를 쓴다.
//
// 원칙(운영자 지시 2026-10-19)
// - 관계는 사용자가 알려 준 "지금의 사이"이고 사주로 알아낸 것이 아니다. 풀이의 관점 · 표현 · 조언에만 쓰고, 점수 · 커플 유형 · 근거(lib/saju/interpret/compat.ts)는 관계를 고른 것만으로 바뀌지 않는다.
// - 성별은 남자 · 여자 중 직접 고른다(기본 선택 없음 · 이름으로 추정하지 않음 · 동성 조합도 그대로). 사주의 10년 시기(대운) 계산에만 쓰고 점수 · 풀이 판정은 성별 조합으로 달라지지 않는다.
// - 이름은 화면에 보이는 호칭에만 쓴다. AI에는 이름 · 생년월일 · 성별을 값으로 보내지 않고, 관계는 아래 여섯 값 가운데 하나(그리고 그 값의 풀이 지침)만 보낸다.
// - 관계 정보가 없는 예전 데이터(null)는 특정 관계로 채우지 않고 예전 그대로 중립으로 읽는다.
// - 이 파일은 Next.js · React · 외부 SDK를 불러오지 않는다(lib/core.test.ts).
import type { CompatResult } from "../saju/interpret/compat.ts";

// ───── 값과 표시 문구 ─────

/** 화면에 보이는 순서 그대로다 — 연인 / 결혼준비중 / 썸타는중 / 결혼함 / 친구 / 기타 */
export const COMPAT_RELATIONSHIPS = ["lover", "engaged", "some", "married", "friend", "other"] as const;
export type CompatRelationship = (typeof COMPAT_RELATIONSHIPS)[number];

export const RELATIONSHIP_QUESTION = "무슨 사이인가요?";
export const RELATIONSHIP_LABEL: Record<CompatRelationship, string> = {
  lover: "연인",
  engaged: "결혼준비중",
  some: "썸타는중",
  married: "결혼함",
  friend: "친구",
  other: "기타",
};

export const NAME_PLACEHOLDER = { self: "본인의 이름을 적어주세요", partner: "상대의 이름을 적어주세요" } as const;

export const COMPAT_GENDERS = ["male", "female"] as const;
export type CompatGender = (typeof COMPAT_GENDERS)[number];
export const GENDER_LABEL: Record<CompatGender, string> = { male: "남자", female: "여자" };
export const GENDER_HELP = "사주의 10년 시기(대운)를 계산할 때만 써요. 궁합 지수나 풀이의 좋고 나쁨은 성별로 달라지지 않고, 어떤 조합이든 같은 기준으로 읽어요.";

export const isCompatRelationship = (v: unknown): v is CompatRelationship => typeof v === "string" && (COMPAT_RELATIONSHIPS as readonly string[]).includes(v);
export const isCompatGender = (v: unknown): v is CompatGender => v === "male" || v === "female";

/** 브라우저 · 저장소에서 온 값을 엄격하게 읽는다 — 정해진 여섯 값이 아니면 null (알 수 없는 값을 특정 관계로 바꾸지 않는다) */
export const parseRelationship = (raw: unknown): CompatRelationship | null => (isCompatRelationship(raw) ? raw : null);

export const RELATIONSHIP_REQUIRED_MESSAGE = "무슨 사이인지 선택해 주세요.";
export const GENDER_REQUIRED_MESSAGE = "성별을 선택해 주세요.";

/**
 * 내 성별 확인 — 직접 골라야 한다(기본 선택 없음). 분석 때 입력한 성별(내 사주 계산에 이미 쓰였다)과 다르면 조용히 덮어쓰지 않고 멈춰서 알려 준다:
 * 궁합은 분석 결과의 사주를 그대로 쓰므로 성별을 바꿔도 계산은 바뀌지 않는다. 잘못 입력했다면 무료 분석을 새로 받아야 한다.
 * 성별을 받기 전에 저장한 결과(저장된 성별 없음)는 고른 값을 확인만 하고, 내 사주의 대운 근거는 그대로 없다.
 */
export function myGenderError(saju: unknown, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return GENDER_REQUIRED_MESSAGE;
  if (!isCompatGender(raw)) return GENDER_REQUIRED_MESSAGE;
  const saved = (saju as { gender?: unknown } | null)?.gender;
  if (isCompatGender(saved) && saved !== raw) return `분석할 때는 "${GENDER_LABEL[saved]}"로 입력하셨어요. 궁합은 그 분석 결과를 그대로 쓰기 때문에 같게 선택해 주세요. 성별을 잘못 입력했다면 무료 분석을 새로 받아 주세요.`;
  return null;
}

// ───── 관계별 표시 규칙 ─────

/** 커플 유형 이름("찰떡 커플" 등) · "배우자 자리" 같은 말을 그대로 보여도 되는 사이 — 연인 · 결혼준비중 · 결혼함 (그리고 관계 정보가 없는 예전 데이터) */
export const showsCoupleType = (rel: CompatRelationship | null | undefined): boolean => !rel || rel === "lover" || rel === "engaged" || rel === "married";

/** 엔진 문구에 들어 있는 "배우자 자리"를 쓰지 않는 사이(썸 · 친구 · 기타)의 표시용 바꿈 — 계산 값이 아니라 글자만 바꾼다 */
export function neutralWording(text: string, rel: CompatRelationship | null | undefined): string {
  if (showsCoupleType(rel)) return text;
  return text.replace(/배우자 자리/g, "가까운 사이를 보는 자리");
}

// ───── 무료 간단 궁합: 관계에 맞는 결정론적 풀이 ─────

export type RelationFrame = {
  id: CompatRelationship;
  label: string;
  /** "연인으로 읽은 두 분" */
  title: string;
  /** 이 사이에서 무엇을 중심으로 읽었는가 */
  lens: string;
  fit: string;
  friction: string;
  understand: string;
  doNow: string[];
  /** 사이를 고른 것이 점수 · 사주 계산을 바꾸지 않았다는 안내 */
  note: string;
};

type Pull = 0 | 1 | 2;
type Friction = 0 | 1 | 2;
type Pace = CompatResult["levels"]["pace"];

type Copy = {
  title: string;
  lens: string;
  fit: [string, string, string];
  friction: [string, string, string];
  understand: Record<Pace, string>;
  doNow: { calm: [string, string]; rough: [string, string] };
};

/** 관계마다 같은 칸을 같은 순서로 채운다 — 끌림(0~2) · 부딪힘(0~2) · 속도에서 고르며, 읽히지 않은 사실(갈등 사건 · 상대의 마음 · 재정 상황)은 쓰지 않는다 */
const COPY: Record<CompatRelationship, Copy> = {
  lover: {
    title: "연인으로 읽은 두 분",
    lens: "연인 사이라고 알려 주셔서, 대화하는 방식과 서운함을 풀어 가는 길을 중심으로 읽었어요.",
    fit: [
      "서로에게 마음이 가기 쉬운 결이 사주에서 두드러지게 읽혀요. 함께 있을 때 편안함이 빨리 생기는 편이라, 그 편안함을 대화로 이어 가기 좋아요.",
      "서로 닿는 결이 적당히 읽혀요. 처음에는 조용해 보여도 함께 보낸 시간이 쌓일수록 편해지는 모양이에요.",
      "눈에 띄게 끌리는 결은 크지 않아요. 대신 서로를 알아 가며 맞춰 가는 쪽으로 읽혀서, 대화로 채우는 부분이 많아요.",
    ],
    friction: [
      "표현하는 방식이 달라서 같은 말이 다르게 들리는 순간이 생기기 쉬워요. 서운함이 쌓이기 전에 짧게 풀어 두면 훨씬 가벼워요.",
      "속도나 말투가 가끔 어긋날 수 있어요. 크게 부딪히는 모양은 아니라서 그때그때 말로 맞추면 충분해요.",
      "크게 부딪히는 결은 읽히지 않아요. 다만 편한 사이일수록 말하지 않아도 알 거라고 넘기기 쉬우니, 필요한 말은 말로 해 두면 좋아요.",
    ],
    understand: {
      "go-go": "두 분 모두 먼저 움직이는 편이라 결정은 빠르지만, 서로 먼저 가려다 말이 겹칠 수 있어요. 한쪽이 끝까지 들어 주는 순서를 정해 두면 편해요.",
      "careful-careful": "두 분 모두 확인하고 움직이는 편이라 신중하지만, 서로 상대가 먼저 말하길 기다리다 이야기가 늦어질 수 있어요. 먼저 꺼내는 쪽을 번갈아 정해 보세요.",
      mixed: "한쪽은 먼저 움직이고 다른 쪽은 확인하고 움직이는 모양이에요. 빠른 쪽은 기다려 주고, 신중한 쪽은 생각을 중간중간 말로 알려 주면 오해가 줄어요.",
      even: "움직이는 속도가 비슷하게 맞아요. 속도 때문에 다투는 일은 적고, 상황에 따라 서로 맞추면 돼요.",
    },
    doNow: {
      calm: ["요즘 서로에게 고마웠던 점을 한 가지씩 말해 보세요.", "바쁜 날 연락하는 방식을 미리 정해 두세요. 예를 들어 '저녁에 한 번만 길게 이야기하자'처럼요."],
      rough: ["서운한 일은 미루지 말고 '그때 이런 점이 서운했어'처럼 내 마음부터 짧게 말해 보세요.", "의견이 갈릴 때는 누가 맞는지보다 각자 한 가지씩 양보할 수 있는 것을 먼저 적어 보세요."],
    },
  },
  engaged: {
    title: "결혼을 준비하는 두 분",
    lens: "결혼을 준비 중이라고 알려 주셔서, 함께 살 때 맞춰야 하는 생활 · 시간 · 돈 · 역할의 합의를 중심으로 읽었어요. 결혼이 잘 풀린다는 뜻은 아니에요.",
    fit: [
      "서로에게 편하게 기대는 결이 두드러지게 읽혀요. 함께 사는 모습을 그려 보며 이야기 나누기 좋은 바탕이에요.",
      "서로 닿는 결이 적당히 읽혀요. 생활을 함께 정해 가면서 편안함을 쌓아 가는 모양이에요.",
      "눈에 띄게 끌리는 결은 크지 않아요. 대신 하나씩 합의해 가며 맞춰 가는 쪽이라, 준비 과정의 대화가 중요해져요.",
    ],
    friction: [
      "생활 기준이 다른 지점이 생기기 쉬워요. 시간 · 돈 · 집안일처럼 현실적인 주제는 감정이 올라오기 전에 미리 말로 정해 두는 게 좋아요.",
      "생활 방식에서 어긋나는 부분이 가끔 있을 수 있어요. 크게 부딪히는 모양은 아니라서 하나씩 합의하면 충분해요.",
      "크게 부딪히는 결은 읽히지 않아요. 다만 잘 맞는다고 넘어가면 나중에 확인할 일이 한꺼번에 오기 쉬우니, 기준은 미리 말로 맞춰 두세요.",
    ],
    understand: {
      "go-go": "두 분 모두 먼저 정하는 편이라 준비가 빠르게 진행될 수 있어요. 빠진 확인이 없는지 중간에 한 번씩 같이 점검해 보세요.",
      "careful-careful": "두 분 모두 확인하고 정하는 편이라 신중하게 준비하지만 결정이 미뤄질 수 있어요. 정하는 기한을 함께 정해 두면 좋아요.",
      mixed: "한쪽은 앞서 정하고 다른 쪽은 확인하고 움직이는 모양이에요. 결정하기 전에 '이건 같이 정하자'고 말해 두는 항목을 정해 두면 편해요.",
      even: "정하고 움직이는 속도가 비슷해요. 준비 일정을 함께 잡고 서로 맞추기 수월한 편이에요.",
    },
    doNow: {
      calm: ["함께 정할 것을 '시간 · 돈 · 집안일과 역할 · 가족 행사'로 나눠 각자 생각을 적은 뒤 이야기해 보세요.", "서로 양보하기 어려운 것을 한 가지씩만 먼저 꺼내 보세요."],
      rough: ["돈 이야기는 금액이 아니라 어떤 기준으로 쓰고 모을지 생각부터 나눠 보세요.", "서로 다르게 생각하는 생활 습관은 누가 맞는지 대신 '둘이 같이 살 때는 어떻게 할까'로 바꿔 이야기해 보세요."],
    },
  },
  some: {
    title: "썸을 타는 두 분",
    lens: "썸 단계라고 알려 주셔서, 다가가는 속도와 서로의 선(경계), 대화하는 방식을 중심으로 읽었어요. 상대의 마음이 어떤지는 사주로 알 수 없어서 말하지 않아요.",
    fit: [
      "서로에게 마음이 가기 쉬운 모양이 사주에서 두드러지게 읽혀요. 다만 이건 두 사주의 모양이고, 실제로 어떤 마음인지는 대화로 확인해야 알 수 있어요.",
      "서로 편해질 수 있는 결이 적당히 읽혀요. 가까워지는 속도는 두 분의 대화로 정해져요.",
      "눈에 띄게 끌리는 결은 크지 않게 읽혀요. 이건 마음의 크기가 아니라 알아 가는 속도가 천천히 붙는 모양이라는 뜻이에요.",
    ],
    friction: [
      "속도나 표현 방식이 달라서 서로 다르게 받아들이기 쉬워요. 답이 늦거나 말투가 다를 때 뜻을 혼자 정하지 말고 가볍게 물어보세요.",
      "타이밍이 가끔 어긋날 수 있어요. 서로의 선이 어디인지 가볍게 물어보면 풀려요.",
      "크게 부딪히는 결은 읽히지 않아요. 편하다고 선을 넘지 않도록 상대가 편한 속도를 한 번씩 물어봐 주세요.",
    ],
    understand: {
      "go-go": "두 분 모두 먼저 다가가는 편이라 빠르게 가까워질 수 있어요. 빠르다고 같은 마음이라고 여기기보다 속도가 괜찮은지 말로 확인해 보세요.",
      "careful-careful": "두 분 모두 확인하며 다가가는 편이라 서로 눈치만 보다 시간이 갈 수 있어요. 한쪽이 가볍게 먼저 물어보면 흐름이 열려요.",
      mixed: "한쪽은 먼저 다가가고 다른 쪽은 확인하며 움직이는 모양이에요. 다가가는 쪽은 상대의 속도를 기다려 주고, 확인하는 쪽은 괜찮다는 신호를 말로 알려 주세요.",
      even: "다가가는 속도가 비슷하게 맞아요. 서로의 속도에 맞춰 천천히 대화를 이어 가도 좋아요.",
    },
    doNow: {
      calm: ["지금 서로 어떤 속도가 편한지 가볍게 물어보세요. 예를 들어 '요즘 연락하는 정도가 어때?'처럼요.", "궁금한 건 짐작으로 결론 내리지 말고 직접 물어보세요."],
      rough: ["답이 늦거나 말투가 달라도 뜻을 혼자 정하지 말고, 궁금하면 '요즘 바빴어?'처럼 가볍게 물어보세요.", "불편한 선이 있다면 내가 먼저 부드럽게 말해 두세요."],
    },
  },
  married: {
    title: "함께 살아가는 두 분",
    lens: "결혼한 사이라고 알려 주셔서, 일상에서 서로 돕는 방식과 다툰 뒤 회복하는 방식을 중심으로 읽었어요. 앞날을 판정하거나 보장하는 말은 아니에요.",
    fit: [
      "일상에서 서로 기대고 맞춰 가는 결이 두드러지게 읽혀요. 함께 있는 시간이 편안함으로 쌓이기 쉬운 바탕이에요.",
      "서로 닿는 결이 적당히 읽혀요. 생활 속에서 맞춰 가며 편안해지는 모양이에요.",
      "눈에 띄게 끌리는 결은 크지 않아요. 대신 일상의 협력으로 신뢰를 쌓는 쪽이라, 작은 약속을 지키는 일이 중요해요.",
    ],
    friction: [
      "방식이 달라서 같은 일을 다르게 느끼기 쉬워요. 집안일 · 시간 · 돈처럼 매번 부딪히는 주제는 규칙을 한 번 정해 두면 감정 소모가 줄어요.",
      "일상에서 가끔 어긋나는 순간이 있을 수 있어요. 크게 부딪히는 모양은 아니라서 그때그때 풀면 충분해요.",
      "크게 부딪히는 결은 읽히지 않아요. 오래 함께한 사이일수록 말하지 않고 넘기는 일이 쌓일 수 있으니 작은 불편도 가볍게 말해 두세요.",
    ],
    understand: {
      "go-go": "두 분 모두 먼저 움직이는 편이라 각자 바로 처리하다 겹치거나 빠질 수 있어요. 집안일 · 일정은 누가 맡을지 먼저 말로 나눠 두면 좋아요.",
      "careful-careful": "두 분 모두 확인하고 움직이는 편이라 신중하지만 서로 상대가 먼저 하길 기다릴 수 있어요. 맡을 일을 번갈아 정해 보세요.",
      mixed: "한쪽은 먼저 움직이고 다른 쪽은 확인하고 움직이는 모양이에요. 서두르는 쪽은 기다려 주고, 신중한 쪽은 진행 상황을 중간에 알려 주면 편해요.",
      even: "움직이는 속도가 비슷해서 일상의 호흡이 맞기 쉬워요. 바쁜 날에는 서로 역할을 가볍게 바꿔 보세요.",
    },
    doNow: {
      calm: ["이번 달 우리 집의 일정 · 집안일 · 돈 쓰는 방식을 십 분만 앉아 같이 정해 보세요.", "서로 챙겨 준 일 한 가지씩을 말로 인정해 보세요."],
      rough: ["다툰 뒤에는 누가 먼저 풀지보다 '풀 때 필요한 것(시간 · 설명 · 사과)'을 각자 말해 보세요.", "반복해서 부딪히는 주제는 그 자리에서 해결하려 하지 말고 따로 시간을 잡아 이야기해 보세요."],
    },
  },
  friend: {
    title: "친구로 읽은 두 분",
    lens: "친구 사이라고 알려 주셔서, 편하게 함께하는 방식과 적당한 거리감, 같이 무언가를 할 때의 협력을 중심으로 읽었어요.",
    fit: [
      "마음이 잘 통하는 결이 두드러지게 읽혀요. 같이 있으면 편하고 이야기가 잘 이어지는 쪽이에요.",
      "서로 닿는 결이 적당히 읽혀요. 자주 만나지 않아도 만나면 편해지는 모양이에요.",
      "눈에 띄게 끌리는 결은 크지 않아요. 대신 각자의 영역을 존중하면서 오래 가는 거리를 찾아가는 쪽이에요.",
    ],
    friction: [
      "방식이 달라서 약속 · 연락 · 계획에서 어긋나기 쉬워요. 서운함이 쌓이기 전에 가볍게 말해 두면 사이가 편해요.",
      "연락 빈도나 약속을 잡는 방식이 가끔 어긋날 수 있어요. 크게 부딪히는 모양은 아니에요.",
      "크게 부딪히는 결은 읽히지 않아요. 편한 사이일수록 서운함을 말하지 않고 넘기기 쉬우니 필요한 이야기는 가볍게 해 두세요.",
    ],
    understand: {
      "go-go": "두 분 모두 먼저 움직이는 편이라 계획이 빨리 잡히지만, 서로 앞서가다 맞추는 일을 놓칠 수 있어요. 같이 하는 일은 역할을 먼저 나눠 보세요.",
      "careful-careful": "두 분 모두 확인하고 움직이는 편이라 신중하지만 약속이 잘 안 잡힐 수 있어요. 먼저 날짜를 제안하는 쪽을 번갈아 정해 보세요.",
      mixed: "한쪽은 먼저 움직이고 다른 쪽은 확인하고 움직이는 모양이에요. 빠른 쪽은 기다려 주고, 신중한 쪽은 가능 여부를 빨리 알려 주면 편해요.",
      even: "움직이는 속도가 비슷해서 함께 계획을 세우기 수월해요.",
    },
    doNow: {
      calm: ["오랜만에 연락할 때는 근황을 가볍게 묻는 한 줄로 시작해 보세요.", "함께 하고 싶은 일을 하나씩 말해 보고 겹치는 것부터 해 보세요."],
      rough: ["연락이 뜸할 때 서운함을 쌓기보다 '요즘 바빴어?' 하고 가볍게 먼저 물어보세요.", "같이 무언가를 할 때는 각자 맡을 일을 먼저 나눠 보세요."],
    },
  },
  other: {
    title: "두 분이 함께 있을 때",
    lens: "어떤 사이인지는 따로 정하지 않고, 두 사주가 함께 있을 때 만드는 분위기만 읽었어요. 두 분의 관계가 무엇인지 짐작해서 풀이하지 않았어요.",
    fit: [
      "서로에게 편안함이 생기기 쉬운 결이 사주에서 두드러지게 읽혀요. 함께 있을 때 이야기가 자연스럽게 이어지기 쉬워요.",
      "서로 닿는 결이 적당히 읽혀요. 함께하는 시간이 쌓일수록 편해지는 모양이에요.",
      "눈에 띄게 닿는 결은 크지 않아요. 대신 서로의 방식을 알아 가며 맞춰 가는 쪽으로 읽혀요.",
    ],
    friction: [
      "표현하는 방식이 달라서 같은 말이 다르게 들릴 수 있어요. 뜻이 헷갈릴 때는 한 번 더 물어보면 오해가 줄어요.",
      "속도나 방식이 가끔 어긋날 수 있어요. 크게 부딪히는 모양은 아니라서 그때그때 맞추면 충분해요.",
      "크게 부딪히는 결은 읽히지 않아요. 다만 편한 만큼 말하지 않고 넘기는 일이 생길 수 있어요.",
    ],
    understand: {
      "go-go": "두 분 모두 먼저 움직이는 편이라 일이 빨리 진행되지만 서로 앞서가다 맞추는 일을 놓칠 수 있어요. 시작 전에 한 번 서로 의견을 확인해 보세요.",
      "careful-careful": "두 분 모두 확인하고 움직이는 편이라 신중하지만 서로 상대를 기다리다 늦어질 수 있어요. 먼저 말을 꺼내는 쪽을 번갈아 정해 보세요.",
      mixed: "한쪽은 먼저 움직이고 다른 쪽은 확인하고 움직이는 모양이에요. 서로의 속도 차이를 방식의 차이로 이해하면 오해가 줄어요.",
      even: "움직이는 속도가 비슷하게 맞아요. 속도 때문에 어긋나는 일은 적어요.",
    },
    doNow: {
      calm: ["서로 편한 대화 방식을 한 줄씩 말해 보세요.", "함께하는 일에서 각자 편한 속도를 가볍게 이야기해 보세요."],
      rough: ["부딪히는 부분이 있으면 상대를 고치려 하기보다 방식의 차이로 먼저 이야기해 보세요.", "헷갈리는 말은 짐작하지 말고 '이런 뜻이었어?' 하고 한 번 더 물어보세요."],
    },
  },
};

export const RELATION_FRAME_NOTE = "사이는 직접 알려 주신 값으로, 읽는 관점과 표현만 바꿨어요. 궁합 지수와 사주 계산은 어떤 사이를 고르든 같아요.";

/** 엔진 결과(끌림 · 부딪힘 · 속도)와 관계로 무료 풀이를 고른다 — 비용 없는 결정론적 문구이고 같은 입력이면 늘 같다 */
export function relationFrameOf(rel: CompatRelationship, levels: Pick<CompatResult["levels"], "pull" | "friction" | "pace">): RelationFrame {
  const c = COPY[rel];
  const pull = levels.pull as Pull;
  const friction = levels.friction as Friction;
  const doNow = friction >= 1 ? c.doNow.rough : c.doNow.calm;
  return {
    id: rel,
    label: RELATIONSHIP_LABEL[rel],
    title: c.title,
    lens: c.lens,
    fit: c.fit[2 - pull],
    friction: c.friction[2 - friction],
    understand: c.understand[levels.pace],
    doNow: [...doNow],
    note: RELATION_FRAME_NOTE,
  };
}

/** 이 사이에서 무엇을 중심으로 읽었는가 — 저장된 리포트의 위쪽에서 커플 유형 대신 보여 줄 한 줄 */
export const relationLensOf = (rel: CompatRelationship): string => COPY[rel].lens;

/** 결과 첫머리에 쓰는 제목 — 커플 유형을 보이는 사이는 유형 이름을, 아니면 그 사이의 제목을 쓴다 */
export const headingOf = (rel: CompatRelationship | null | undefined, typeName: string): string => (showsCoupleType(rel) ? typeName : COPY[rel as CompatRelationship].title);

// ───── AI 풀이 지침(사주 궁합 · 리포트 궁합) ─────

/** AI에 가는 사용자 메시지의 relationship 항목 — 이름 · 성별 · 생년월일은 없고, 사용자가 직접 고른 사이와 그 사이의 읽는 법만 있다 */
export type RelationshipBrief = { id: CompatRelationship; label: string; given: string; read: string; avoid: string };

const BRIEF: Record<CompatRelationship, { read: string; avoid: string }> = {
  lover: {
    read: "연인 사이로 읽는다. 대화하는 방식과 서운함 · 갈등을 풀어 가는 방식을 중심에 두고, 잘 맞는 부분 · 부딪히기 쉬운 부분 · 서로 이해할 점 · 지금 해 볼 구체적인 행동을 생활 장면으로 쓴다.",
    avoid: "결혼을 하게 된다 · 오래 간다 · 헤어진다는 앞날 판정과 있었던 다툼 · 사건을 사실처럼 쓰지 않는다.",
  },
  engaged: {
    read: "결혼을 준비하는 사이로 읽는다. 함께 살 때 맞춰야 하는 생활 · 시간 · 돈 · 역할의 합의를 중심에 두고, 정해 볼 주제와 대화 방법을 생활 장면으로 쓴다. 5번 장의 오래 함께할 때의 생활 방식은 이 합의의 관점으로 쓴다.",
    avoid: "결혼이 성공한다 · 행복하다 · 날짜 · 예식 · 두 사람의 재정 상황 · 집안 사정을 사실처럼 쓰지 않는다. 돈은 정해 볼 주제로만 쓴다.",
  },
  some: {
    read: "썸 단계의 사이로 읽는다. 다가가는 속도 · 서로의 선(경계) · 대화하는 방식을 중심에 두고, 서로의 마음은 직접 물어보고 확인해야 한다는 쪽으로 쓴다. 5번 장은 연애로 이어진다는 말 없이 가까워지는 속도와 선을 다루는 방법으로 쓴다.",
    avoid: "서로 좋아한다 · 상대도 같은 마음이다 · 곧 사귀게 된다 · 상대가 어떤 마음이라고 추측하는 말 · 연인이나 부부로 부르는 말 · 배우자 · 결혼 이야기를 쓰지 않는다.",
  },
  married: {
    read: "결혼한 사이로 읽는다. 일상에서 서로 돕고 협력하는 방식과 다툰 뒤 회복하는 방식을 중심에 두고, 생활 속 조율과 회복에 도움이 되는 행동을 쓴다.",
    avoid: "결혼 생활이 행복하다 · 오래 간다 · 위기가 온다 · 이혼 · 별거 · 가족 사정이나 있었던 다툼을 사실처럼 쓰지 않는다.",
  },
  friend: {
    read: "친구 사이로 읽는다. 우정이 편안하게 이어지는 방식 · 적당한 거리감 · 함께 계획하거나 일할 때의 협력을 중심에 두고 쓴다. 5번 장은 연애 · 결혼이 아니라 오래 가까이 지내는 방식으로 쓴다.",
    avoid: "연애 · 연인 · 배우자 · 결혼 · 부부 · 이성적인 끌림 · 고백 · 스킨십을 쓰지 않고, 두 사람 사이에 있었던 일이나 한쪽의 속마음을 사실처럼 쓰지 않는다.",
  },
  other: {
    read: "어떤 사이인지 알려 주지 않았다. 구체적인 관계를 짐작하지 않고 두 사람이 함께 있을 때의 분위기와 서로를 이해하는 방법을 중립적으로 쓴다. 5번 장은 오래 가까이 지낼 때의 방식으로 쓴다.",
    avoid: "연인 · 부부 · 친구 · 가족 · 동료 같은 구체적인 관계 이름 · 연애 · 결혼 이야기와 두 사람 사이의 사건 · 한쪽의 속마음을 쓰지 않는다.",
  },
};

export const RELATIONSHIP_GIVEN = "이 relationship은 사용자가 직접 알려 준 두 사람의 현재 사이다(사주로 알아낸 것이 아니다). 앞의 규칙 중 두 사람의 관계 종류를 만들지 않는다는 말은 이 값에는 적용하지 않지만, 사이의 이름은 풀이를 이끄는 관점으로만 쓰고 그 사이가 어떻게 되어 간다는 판정은 쓰지 않는다. 궁합 지수와 근거 목록은 이 값과 상관없이 그대로 읽고, 사이를 이유로 근거를 더하거나 빼거나 다르게 해석하지 않는다.";

export function relationshipBrief(rel: CompatRelationship): RelationshipBrief {
  return { id: rel, label: RELATIONSHIP_LABEL[rel], given: RELATIONSHIP_GIVEN, ...BRIEF[rel] };
}

// ───── AI 글 검사(validate.ts가 쓴다) ─────

/** 연애 · 배우자 · 결혼 말 — 친구 · 기타 사이의 글에는 쓰지 않는다 */
export const ROMANCE_TALK = /연애|연인|애인|사귀|사귄|배우자|결혼|부부|신혼|남편|아내|이성\s*(?:간|친구|관계|으로|적\s*끌림)|고백|스킨십|데이트|짝사랑|(?<![가-힣])썸/;
/** 썸 사이의 글에서 상대의 마음 · 연애 확정을 말하는 표현 */
export const SOME_CERTAIN = /서로\s*(?:좋아|사랑|마음이\s*있)|(?:상대|상대방|[AB]님)(?:도|은|는|이)?\s*[^.!?]{0,14}(?:좋아하고|좋아하는\s*것|호감이?\s*있|마음이\s*(?:있|가|같)|관심이\s*있)|사귀게\s*될|연인이\s*될|연인\s*사이|커플이\s*될|이어질\s*거|결혼|배우자|부부/;
/** 결혼을 준비하는 · 결혼한 사이의 글에서 앞날 보장 · 판정 */
export const MARRIAGE_FUTURE = /결혼(?:은|이)?\s*(?:성공|행복|잘\s*될|잘될|무사)|(?:행복한|성공적인)\s*(?:결혼|부부)|평생\s*(?:함께|행복)|백년해로|이혼|별거|파혼|재혼|결혼식\s*날짜|예식\s*날짜|혼수|(?:재정|경제)\s*(?:상태|상황)(?:가|는|이)?\s*(?:좋|나쁘|넉넉|어렵)/;
/** '기타'에서 구체적인 관계 이름을 지어낸 표현 */
export const OTHER_KIND = /연인|애인|부부|남편|아내|동업|룸메이트|(?:친구|가족|형제|자매|부모|동료|선후배)\s*(?:사이|관계|끼리|로서|처럼)/;

export type RelationshipIssue = { where: string; message: string };

/** 글 조각들(where, text)을 사이에 맞게 검사한다 — 사이가 없으면(예전 방식) 아무것도 걸지 않는다 */
export function relationshipIssues(texts: { where: string; text: string }[], rel: CompatRelationship | null | undefined): RelationshipIssue[] {
  if (!rel) return [];
  const out: RelationshipIssue[] = [];
  for (const { where, text } of texts) {
    const romance = (rel === "friend" || rel === "other") && ROMANCE_TALK.test(text);
    if (romance) {
      out.push({ where, message: `${RELATIONSHIP_LABEL[rel]} 사이의 풀이에는 연애 · 배우자 · 결혼 이야기("${ROMANCE_TALK.exec(text)![0]}")를 쓰지 않습니다 — 이 사이에 맞는 말로 바꾸세요.` });
    }
    if (rel === "other" && !romance) {
      const m = OTHER_KIND.exec(text);
      if (m) out.push({ where, message: `어떤 사이인지 알려 주지 않았으므로 구체적인 관계 이름("${m[0]}")을 지어내지 않습니다 — "두 분"으로 쓰세요.` });
    }
    if (rel === "some") {
      const m = SOME_CERTAIN.exec(text);
      if (m) out.push({ where, message: `썸 사이의 풀이에서 서로의 마음 · 연애 확정 · 배우자 · 결혼("${m[0]}")을 말하지 않습니다 — 마음은 직접 확인해야 한다는 쪽으로 쓰세요.` });
    }
    if (rel === "engaged" || rel === "married") {
      const m = MARRIAGE_FUTURE.exec(text);
      if (m) out.push({ where, message: `${RELATIONSHIP_LABEL[rel]} 사이의 풀이에서 앞날을 보장하거나 판정하는 말 · 지어낸 사정("${m[0]}")을 쓰지 않습니다 — 생활에서 합의하고 조율하는 방법으로 쓰세요.` });
    }
  }
  return out;
}
