// 리포트 궁합(두 사람이 각자 분석한 결과를 서로 동의한 뒤 연결하는 상품 — 아직 만들지 않았다)의 두 사람 비교 근거 — 순수 계산, AI 미사용.
// 사주 궁합 엔진(compat.ts)의 근거에 더해, 두 사람이 **각자 직접 답한** 응답을 같은 영역끼리 비교한 근거를 만든다.
// 지키는 것:
//   · 두 사람 모두에게 뚜렷한 응답이 있는 영역만 비교한다. 한쪽만 뚜렷하면 비교하지 않고 "비교하지 않은 영역"으로만 센다 — 없는 응답을 만들어 채우지 않는다.
//   · 어느 쪽이 맞고 틀린 것이 아니라 "같은 쪽 · 서로 다른 쪽"으로만 말한다. 두 사람의 점수를 더하거나 비교 점수 · 궁합 지수를 새로 만들지 않는다(점수 숫자는 근거 문장에 쓰지 않는다).
//   · 가까운 관계 반응(관계 불안 · 거리 두기)은 애착 유형 이름으로 부르지 않고, 입력한 MBTI는 알파벳 없이 선호 방향만 비교하며 본인이 알려 준 참고 정보로 둔다.
//   · 규칙은 설계 가설이며 전문가 검토 · 실제 사람의 응답으로 확인하지 않았다 — 좋은 궁합 판정의 보증이 아니다.
import type { Evidence, Topic } from "../evidence.ts";
import { DISTINCTIONS, type DistinctionId } from "../../assessment/situational/reading.ts";
import { SIDE_COPY } from "../../assessment/situational/copy.ts";
import { mbtiDirections } from "../survey-evidence.ts";
import type { AxisRow, FreeSummary, ScoreRow } from "../types.ts";

export const PAIR_RULE_VERSION = "pair-rules-0.1-draft";

export type PairResponses = { summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti" | "situational">; mbti: string | null };

export type PairEvidenceResult = {
  evidence: Evidence[];
  /** 두 사람 모두 뚜렷하게 답해 비교한 영역 id */
  compared: string[];
  /** 비교한 영역의 이름(화면 요약용 — 점수 · 원래 답 없음) */
  comparedLabels: string[];
  /** 한쪽만 뚜렷하게 답해 비교하지 않은 영역 id — 화면에서 "비교하지 않았어요"로만 알린다(둘 다 뚜렷하지 않은 영역은 세지 않는다) */
  unclear: string[];
  /** 한 사람은 상황형 28문항, 다른 사람은 22문항(또는 그 반대)으로 답해 응답 비교를 하지 않았다 — 서로 다른 질문의 답을 환산해 맞추지 않는다 */
  versionMismatch?: boolean;
};

const TOPICS: Record<string, Topic[]> = {
  anxiety: ["love", "relationship"],
  avoidance: ["love", "relationship"],
  sensitivity: ["relationship", "personality"],
  novelty: ["personality", "relationship"],
  caution: ["personality", "relationship", "money"],
  persistence: ["personality", "work"],
  ei: ["relationship", "personality"],
  sn: ["relationship", "personality"],
  tf: ["relationship", "personality"],
  jp: ["relationship", "personality", "money"],
};

const TOPICS28: Record<DistinctionId, Topic[]> = {
  energy: ["relationship", "personality"],
  basis: ["relationship", "personality"],
  structure: ["relationship", "personality", "money"],
  first: ["relationship", "personality"],
  explore: ["personality", "relationship", "money"],
  confirm: ["love", "relationship"],
  repair: ["love", "relationship"],
  help: ["relationship", "love"],
};

type Row = { id: string; label: string; score: number; side: "high" | "low" | null; meaning: string };
const rowOf = (r: ScoreRow | AxisRow, axis: boolean): Row => {
  const side = r.score >= 65 ? "high" : r.score <= 35 ? "low" : null;
  return { id: r.id, label: axis ? `평소 행동 방식 · ${r.label}` : r.label, score: r.score, side, meaning: side === "high" ? r.highMeaning : side === "low" ? r.lowMeaning : "" };
};
const rowsOf = (p: PairResponses): Map<string, Row> => new Map([...p.summary.temperament.map((r) => rowOf(r, false)), ...p.summary.relationship.map((r) => rowOf(r, false)), ...p.summary.mbti.axes.map((r) => rowOf(r, true))].map((r) => [r.id, r]));

const SAME_CUE = "두 사람이 같은 쪽으로 답했다면 같은 장면에서 비슷하게 반응하기 쉬워 서로를 이해하기 쉽지만, 같은 부분에서 함께 막히거나 서로의 빈 곳을 채워 주지 못할 수도 있다고 읽습니다.";
const DIFF_CUE = "두 사람이 서로 다른 쪽으로 답했다면 같은 장면에서 서로 다르게 반응하기 쉬워 오해가 생길 수 있지만, 서로의 빈 곳을 채울 수도 있다고 읽습니다. 어느 쪽이 맞고 틀린 것이 아니라 반응의 차이입니다.";
const LIMIT_CUE = "각자가 직접 답한 자기 응답을 비교한 한 가지 서술이며 두 사람의 실제 행동을 보증하지 않습니다. 상대의 속마음을 알려 주는 근거가 아닙니다.";

/** 두 사람의 응답을 같은 영역끼리 비교한 근거 목록 — 두 사람은 "A님 · B님"으로 부른다(사주 궁합 근거와 같은 이름) */
export function pairEvidenceOf(a: PairResponses, b: PairResponses): PairEvidenceResult {
  const sa = a.summary.situational;
  const sb = b.summary.situational;
  // 질문 버전이 다르면 점수 줄(22문항)과 장면 읽기(28문항)를 서로 환산하지 않는다 — 응답 비교는 건너뛰고, 본인들이 알려 준 MBTI 참고 정보만 같은 방식으로 비교한다
  const mismatch = Boolean(sa) !== Boolean(sb);
  const ra = sa || sb ? new Map<string, Row>() : rowsOf(a);
  const rb = sa || sb ? new Map<string, Row>() : rowsOf(b);
  const evidence: Evidence[] = [];
  const compared: string[] = [];
  const comparedLabels: string[] = [];
  const unclear: string[] = [];
  if (sa && sb) {
    const dims = Object.keys(DISTINCTIONS) as DistinctionId[];
    for (const d of dims) {
      const x = sa.readings.find((r) => r.d === d);
      const y = sb.readings.find((r) => r.d === d);
      const cx = x?.status === "sufficient" && x.side ? SIDE_COPY[d]?.[x.side] : undefined;
      const cy = y?.status === "sufficient" && y.side ? SIDE_COPY[d]?.[y.side] : undefined;
      if (!x || !y) continue;
      if (!cx || !cy) {
        // 둘 다 뚜렷하지 않으면 말할 것이 없다 — 한쪽만 뚜렷한 구분만 "비교하지 않은 영역"으로 센다
        if (cx || cy) unclear.push(d);
        continue;
      }
      const same = x.side === y.side;
      const strong = x.strength === "strong" && !x.leaning && y.strength === "strong" && !y.leaning;
      compared.push(d);
      comparedLabels.push(DISTINCTIONS[d].name);
      evidence.push({
        id: `pair.s28.${d}`,
        source: "survey",
        topics: TOPICS28[d],
        strength: strong ? "moderate" : "weak",
        fact: `${DISTINCTIONS[d].name}: A님은 "${cx.strengthLabel}", B님은 "${cy.strengthLabel}" 쪽으로 읽혔어요 — ${same ? "같은 쪽" : "서로 다른 쪽"} (각자 답한 여러 장면을 가로로 읽은 결과, 점수 없음)`,
        cue: `${same ? SAME_CUE : DIFF_CUE}${DISTINCTIONS[d].attachmentWay ? " 가까운 관계의 방식은 애착 유형 이름으로 부르지 않고 어떤 장면에서 나타나는지로만 씁니다." : ""} ${LIMIT_CUE}`,
      });
    }
  }
  for (const [id, x] of ra) {
    const y = rb.get(id);
    if (!y) continue;
    if (!x.side || !y.side) {
      // 둘 다 뚜렷하지 않으면 말할 것이 없다 — 한쪽만 뚜렷한 영역만 "비교하지 않은 영역"으로 센다
      if (x.side || y.side) unclear.push(id);
      continue;
    }
    const same = x.side === y.side;
    const both = Math.abs(x.score - 50) >= 30 && Math.abs(y.score - 50) >= 30;
    compared.push(id);
    comparedLabels.push(x.label);
    evidence.push({
      id: `pair.${id}`,
      source: "survey",
      topics: TOPICS[id] ?? ["relationship"],
      strength: both ? "moderate" : "weak",
      fact: `${x.label}: A님의 응답에서 나타난 경향은 "${x.meaning}", B님은 "${y.meaning}" — ${same ? "같은 쪽" : "서로 다른 쪽"}으로 답했어요 (각자 답한 응답을 비교, 점수 없음)`,
      cue: `${same ? SAME_CUE : DIFF_CUE}${id === "anxiety" || id === "avoidance" ? " 가까운 관계 반응은 애착 유형 이름으로 부르지 않고 어떤 장면에서 나타나는지로만 씁니다." : ""} ${LIMIT_CUE}`,
    });
  }
  // 입력한 MBTI — 두 사람 모두 네 글자로 알려 준 경우만, 알파벳 없이 선호 방향만 비교한다
  const da = a.mbti ? mbtiDirections(a.mbti) : null;
  const db = b.mbti ? mbtiDirections(b.mbti) : null;
  if (da && db) {
    const diff = da.map((t, i) => (t === db[i] ? null : `A님은 ${t}, B님은 ${db[i]}`)).filter((t): t is string => t !== null);
    evidence.push({
      id: "pair.mbti",
      source: "self",
      topics: ["relationship", "personality"],
      strength: "weak",
      fact: diff.length === 0 ? "두 사람이 알려 준 MBTI는 네 가지 선호 방향이 모두 같아요" : `두 사람이 알려 준 MBTI는 네 가지 선호 방향 가운데 ${4 - diff.length}곳이 같고 ${diff.length}곳이 달라요 — ${diff.join(" / ")} (본인들이 알려 준 참고 정보)`,
      cue: `본인들이 알려 준 자기 인식 참고값입니다. 선호가 같은 곳은 닮은 반응, 다른 곳은 다른 반응이 나타날 수 있는 장면을 구체화하는 데만 쓰고, 행동의 원인으로 단정하거나 두 사람의 응답 · 사주 풀이를 덮어쓰지 않습니다(응답이 먼저입니다). 알파벳 코드를 본문에 쓰지 않습니다. ${LIMIT_CUE}`,
    });
  }
  return { evidence, compared, comparedLabels, unclear, ...(mismatch ? { versionMismatch: true } : {}) };
}
