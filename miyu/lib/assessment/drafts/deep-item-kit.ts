// 미유 자체 심화 검사 문항 — 문항을 만드는 도구 (초안 · 검토 전, 화면 · 저장 · 리포트에 연결하지 않음)
// 문항 데이터(deep-items-a/b/c.ts)가 이 도구로 문항을 만든다. 규칙은 situational-draft.ts(30문항 초안 0.2)와 같다:
//  - 문항 하나는 **세부 항목 하나**에만 점수를 준다(선택지가 다른 세부 항목에 점수를 주지 않는다).
//  - 선택지는 4개 + 모든 문항에 같이 붙는 "해당 없음"(점수에 넣지 않음). 같은 행동이어도 이유가 다른 답은 점수에 넣지 않고(unscored) 이유만 남긴다.
//  - 선택지의 점수 방향은 높은 쪽 둘(+2 · +1)과 낮은 쪽 둘(−1 · −2)이고, 보이는 순서는 문항 번호로 정한 고정 순열로 섞는다(순서만 보고 방향을 짐작하지 못하게).
//    사람이 읽는 순서는 docs/assessment-deep-questions-v01.md에 그대로 나온다.
import type { ItemKind, Scene } from "./situational-draft.ts";

export type DeepDomainId = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7";
export type DeepSubId =
  | "D1-1" | "D1-2" | "D1-3"
  | "D2-1" | "D2-2" | "D2-3"
  | "D3-1" | "D3-2" | "D3-3"
  | "D4-1" | "D4-2" | "D4-3" | "D4-4"
  | "D5-1" | "D5-2" | "D5-3" | "D5-4"
  | "D6-1" | "D6-2" | "D6-3" | "D6-4"
  | "D7-1" | "D7-2" | "D7-3" | "D7-4";

export type DeepWeight = -2 | -1 | 1 | 2;

export type DeepOption = {
  id: "a" | "b" | "c" | "d";
  text: string;
  /** 점수를 주는 선택지의 세기(+ 높은 쪽 · − 낮은 쪽). 이 문항의 세부 항목(sub)에만 준다 */
  w?: DeepWeight;
  /** true면 이 문항의 세부 항목의 증거로 쓰지 않는다 — 같은 행동이어도 이유가 다른 답 (이유만 남긴다) */
  unscored?: boolean;
  reason?: string;
};

export type DeepItem = {
  id: string;
  domain: DeepDomainId;
  sub: DeepSubId;
  scene: Scene;
  kind: ItemKind;
  /** 문항 이름 (검토용) */
  topic: string;
  stem: string;
  /** 이 문항으로 알고 싶은 것 */
  purpose: string;
  options: [DeepOption, DeepOption, DeepOption, DeepOption];
};

/** 문항 하나를 쓰는 입력 — 높은 쪽 둘 · 낮은 쪽 둘, 점수에 넣지 않는 이유 답이 있으면 그 자리를 대신한다(네 칸이 정확히 차야 한다) */
export type DeepItemInput = {
  sub: DeepSubId;
  scene: Scene;
  kind: ItemKind;
  topic: string;
  stem: string;
  purpose: string;
  /** 가장 높은 쪽 (+2) */
  h2?: string;
  /** 조금 높은 쪽 (+1) */
  h1?: string;
  /** 조금 낮은 쪽 (−1) */
  l1?: string;
  /** 가장 낮은 쪽 (−2) */
  l2?: string;
  /** 같은 행동이어도 이유가 다른 답 — 점수에 넣지 않는다 */
  u?: { text: string; reason: string };
  /** 보이는 순서를 고정 순열 대신 직접 정할 때(검사에서 줄 서기가 걸린 문항만) — 0~21 */
  perm?: number;
};

type Role = "h2" | "h1" | "l1" | "l2" | "u";
const ROLE_ORDER: Role[] = ["h2", "h1", "l1", "l2", "u"];
const WEIGHT: Record<Exclude<Role, "u">, DeepWeight> = { h2: 2, h1: 1, l1: -1, l2: -2 };

/** 0~3 네 자리의 모든 순열 중 "그대로(0123)"와 "거꾸로(3210)"를 뺀 22개 — 선택지가 높음 → 낮음 순으로 줄 서는 것을 막는다 */
const PERMS: number[][] = (() => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (rest.length === 0) out.push(cur);
    else for (let i = 0; i < rest.length; i++) rec([...cur, rest[i]], rest.filter((_, j) => j !== i));
  };
  rec([], [0, 1, 2, 3]);
  return out.filter((p) => p.join("") !== "0123" && p.join("") !== "3210");
})();

export const PERM_COUNT = PERMS.length;

/** 문항 번호(1부터)로 정하는 고정 순열 — 7과 22는 서로소라서 22문항마다 순열이 한 바퀴 돈다 */
export const permFor = (n: number) => (n * 7 + 3) % PERM_COUNT;

export function deepItem(n: number, input: DeepItemInput): DeepItem {
  const roles = ROLE_ORDER.filter((r) => input[r] !== undefined);
  if (roles.length !== 4) throw new Error(`E${n}: 선택지는 정확히 네 개여야 한다 (${roles.join(",")})`);
  const perm = PERMS[input.perm ?? permFor(n)];
  const ids = ["a", "b", "c", "d"] as const;
  const slots: (DeepOption | null)[] = [null, null, null, null];
  roles.forEach((role, i) => {
    const position = perm[i];
    if (role === "u") {
      const u = input.u!;
      slots[position] = { id: ids[position], text: u.text, unscored: true, reason: u.reason };
    } else {
      slots[position] = { id: ids[position], text: input[role] as string, w: WEIGHT[role] };
    }
  });
  const domain = input.sub.slice(0, 2) as DeepDomainId;
  return {
    id: `E${String(n).padStart(2, "0")}`,
    domain,
    sub: input.sub,
    scene: input.scene,
    kind: input.kind,
    topic: input.topic,
    stem: input.stem,
    purpose: input.purpose,
    options: slots as DeepItem["options"],
  };
}
