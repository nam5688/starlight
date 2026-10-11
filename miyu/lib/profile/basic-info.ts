// 기본 정보 입력값과 검증.
// 지역은 성향 분석에 쓰지 않는다 — 향후 장소 추천용으로만 따로 보관할 예정이다.

export type BasicInfo = {
  nickname: string;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  birthTime: string;
  birthTimeUnknown: boolean;
  knownMbti: string;
  regionProvince: string;
  regionDistrict: string;
};

export const EMPTY_BASIC_INFO: BasicInfo = {
  nickname: "",
  calendar: "solar",
  isLeapMonth: false,
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  birthTime: "",
  birthTimeUnknown: false,
  knownMbti: "",
  regionProvince: "",
  regionDistrict: "",
};

export type BasicInfoErrors = Partial<Record<"nickname" | "birthDate" | "birthTime", string>>;

export const NICKNAME_MAX = 12;

/** today는 호출하는 쪽에서 넘긴다 (렌더링 중 현재 시각을 읽지 않기 위해) */
export function validateBasicInfo(info: BasicInfo, today: Date): BasicInfoErrors {
  const errors: BasicInfoErrors = {};
  const nickname = info.nickname.trim();
  if (!nickname) errors.nickname = "닉네임을 입력해 주세요.";
  else if (nickname.length > NICKNAME_MAX) errors.nickname = `닉네임은 ${NICKNAME_MAX}자 이내로 입력해 주세요.`;

  const y = Number(info.birthYear);
  const m = Number(info.birthMonth);
  const d = Number(info.birthDay);
  if (!info.birthYear || !info.birthMonth || !info.birthDay) {
    errors.birthDate = "생년월일을 모두 입력해 주세요.";
  } else if (!/^\d{4}$/.test(info.birthYear) || y < 1900 || y > today.getFullYear()) {
    errors.birthDate = `태어난 해는 1900년부터 ${today.getFullYear()}년 사이로 입력해 주세요.`;
  } else if (info.calendar === "solar") {
    const date = new Date(y, m - 1, d);
    if (date.getMonth() !== m - 1 || date.getDate() !== d) errors.birthDate = "존재하지 않는 날짜입니다.";
    else if (date > today) errors.birthDate = "오늘 이후 날짜는 입력할 수 없습니다.";
  } else if (d > 30) {
    // 음력 한 달은 29일 또는 30일. 정확한 달 길이 확인은 만세력 엔진 연결 후 서버에서 한다.
    errors.birthDate = "음력 날짜는 30일까지 입력할 수 있습니다.";
  }

  if (!info.birthTimeUnknown && !/^\d{2}:\d{2}$/.test(info.birthTime)) {
    errors.birthTime = "출생시간을 입력하거나 ‘출생시간을 몰라요’를 선택해 주세요.";
  }
  return errors;
}

/** 진행률 표시용: 필수 항목이 채워졌는지만 본다 (날짜 유효성은 validateBasicInfo에서 확인) */
export function hasRequiredBasicInfo(info: BasicInfo): boolean {
  return (
    info.nickname.trim() !== "" &&
    info.birthYear !== "" &&
    info.birthMonth !== "" &&
    info.birthDay !== "" &&
    (info.birthTimeUnknown || info.birthTime !== "")
  );
}

export function formatBirth(info: BasicInfo): string {
  const cal = info.calendar === "solar" ? "양력" : info.isLeapMonth ? "음력 윤달" : "음력";
  const time = info.birthTimeUnknown ? "출생시간 모름" : info.birthTime;
  return `${info.birthYear}년 ${Number(info.birthMonth)}월 ${Number(info.birthDay)}일 (${cal}) · ${time}`;
}

export const MBTI_TYPES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;

export const PROVINCES = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
  "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
] as const;

/** 서버로 들어온 값을 BasicInfo 형태로만 받아들인다 (형식이 다르면 null). 내용 검증은 validateBasicInfo. */
export function parseBasicInfo(raw: unknown): BasicInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const str = (k: keyof BasicInfo, max: number) => (typeof r[k] === "string" ? (r[k] as string).slice(0, max) : null);
  const info = {
    nickname: str("nickname", 40),
    calendar: r.calendar === "lunar" ? "lunar" : r.calendar === "solar" ? "solar" : null,
    isLeapMonth: r.isLeapMonth === true,
    birthYear: str("birthYear", 4),
    birthMonth: str("birthMonth", 2),
    birthDay: str("birthDay", 2),
    birthTime: str("birthTime", 5),
    birthTimeUnknown: r.birthTimeUnknown === true,
    knownMbti: str("knownMbti", 4),
    regionProvince: str("regionProvince", 20),
    regionDistrict: str("regionDistrict", 20),
  };
  return Object.values(info).some((v) => v === null) ? null : (info as BasicInfo);
}
