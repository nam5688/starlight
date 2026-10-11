// 사주(만세력) 계산 모듈의 연결 지점.
// 2단계에서 음양력 변환 + 만세력 계산 엔진을 검토해 이 인터페이스에 맞춰 연결한다.
// AI가 생년월일만 보고 원국을 지어내지 않도록, 원국은 반드시 이 엔진의 계산 결과만 사용한다.
// 검수 항목은 docs/product-spec.md "사주 엔진 검수 항목"에 있다.

export type SajuInput = {
  /** 입력한 그대로의 날짜 (음력이면 음력 날짜) */
  year: number;
  month: number;
  day: number;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  /** "HH:MM". 모르면 null — 임의의 시간을 넣지 않는다 */
  birthTime: string | null;
};

export type SajuResult =
  | { status: "not-connected" }
  | {
      status: "ok";
      engine: { name: string; version: string };
      pillars: { position: "년주" | "월주" | "일주" | "시주"; stem: string; branch: string }[];
      /** 출생시간을 모르면 시주 없이 계산했다는 표시 */
      hourPillarOmitted: boolean;
    };

export interface SajuEngine {
  calculate(input: SajuInput): Promise<SajuResult>;
}

/** 엔진 연결 전 — 항상 "not-connected"를 돌려준다 */
export const sajuEngine: SajuEngine = {
  async calculate() {
    return { status: "not-connected" };
  },
};
