// 기본 풀이 층 — 특별한 프레임(조합 구조)이 없는 명식도 연애 · 재물 · 과거 이야기를 이 명식의 실제 위치와 운으로 읽을 수 있게 하는 근거(운영자 2026-10-18).
// 새 명리 계산 규칙이 아니다: 배우자 별 · 재성의 위치(천간 · 지지 · 지장간), 일지와 다른 기둥의 합 · 충 · 형, 월지의 십성, 지난 · 지금 · 다음 대운의 십성처럼 엔진이 이미 계산한 값을 모아 적고,
// "특별한 조합이 발동하지 않았다"를 근거에 밝힌다 — 프레임이 있는 것처럼 꾸미지 않는다. 같은 입력이면 늘 같은 결과이고 명식마다 위치 · 운이 달라 내용이 달라진다.
import type { Evidence } from "../../../report/evidence.ts";
import { KEY_LABEL } from "./context.ts";
import type { Selection } from "./select.ts";
import type { FrameContext, FrameUnit } from "./types.ts";
import type { Group } from "../structure.ts";

/** 가까운 관계 · 배우자 말을 읽는 사람의 연령대에 맞게 바꾼다(만 19세 미만은 배우자 · 연인 말을 쓰지 않는다) */
export function forAudience(text: string, audience: FrameContext["audience"]): string {
  if (audience === "adult") return text;
  return text.replaceAll("배우자 자리", "가까운 관계의 자리").replaceAll("배우자 별", "가까운 관계의 별").replaceAll("배우자", "가까운 사람").replaceAll("연인", "가까운 사람");
}

const GROUP_THEME: Record<Group, string> = {
  비겁: "또래 · 경쟁 · 자기 기준이 커지는 시기",
  식상: "표현 · 재능 · 활동이 드러나는 시기",
  재성: "현실 · 돈 · 관계의 무게가 커지는 시기",
  관성: "책임 · 평가 · 규칙이 커지는 시기",
  인성: "배움 · 도움 · 보호가 채워지는 시기",
};

const unitText = (u: FrameUnit) => `${u.label}(천간 ${u.stemGod} · 지지 ${u.branchGod})`;
const ageText = (a: number, b: number) => (a === b ? `만 ${a}세 무렵` : `만 ${a}~${b}세 무렵`);

/** 배우자 별(남 재성 · 여 관성)이 원국 어디에 있는지 — 천간 · 지지 본기 · 지장간 */
function starPlace(c: FrameContext): string {
  const parts: string[] = [];
  if (c.starOnStem.length) parts.push(`천간에 드러남(${c.starOnStem.join(", ")})`);
  if (c.starOnBranch.length) parts.push(`지지 본기에 있음(${c.starOnBranch.join(", ")})`);
  if (c.starInHidden.length) parts.push(`지장간에 있음(${c.starInHidden.join(", ")})`);
  return parts.length ? parts.join(" / ") : "원국 어디에도 없음";
}

/** 일지와 다른 기둥 지지의 합 · 충 · 형 */
function dayRelations(c: FrameContext): string {
  const rows = (Object.entries(c.dayRel) as [string, string[]][]).filter(([, k]) => k.length).map(([key, k]) => `일지–${KEY_LABEL[key]}지 ${k.join("·")}`);
  return rows.length ? rows.join(", ") : "일지가 다른 지지와 합 · 충 · 형을 이루지 않음";
}

/** 지금 · 다음 대운이 이 그룹을 들이는 시기인가 */
function luckBring(c: FrameContext, group: Group): string {
  const now = c.luck.find((u) => u.position === "current");
  const next = c.luck.find((u) => u.position === "future");
  const one = (label: string, u: FrameUnit | undefined) => (u ? `${label} ${unitText(u)} — ${u.stemGroup === group || u.branchGroup === group ? `${group}이 들어오는 시기` : `${group}이 들어오는 시기는 아님`}` : null);
  return [one("지금 대운", now), one("다음 대운", next)].filter(Boolean).join(" / ") || "대운 계산 없음";
}

/** 지난 대운(만 7세 이후, 현재 나이로 자른 것) — 오래된 순 */
export function pastLuckOf(c: FrameContext): FrameUnit[] {
  return c.luck.filter((u) => u.position === "past" && u.ageTo >= 7).map((u) => ({ ...u, ageFrom: Math.max(u.ageFrom, 7), ageTo: Math.min(u.ageTo, c.age) }));
}

/**
 * 기본 풀이 근거. 프레임 이야기가 있는 곳에는 만들지 않는다(같은 이야기를 두 번 건네지 않는다).
 *  · base-love: 만 16세 이상이고 연애 구조 이야기가 없을 때 / base-wealth: 만 16세 이상이고 재물 구조 이야기가 없을 때
 *  · base-past: 과거 회고 시기 프레임이 둘 미만일 때 지난 대운 개요 / base-peer: 만 16세 미만에게 연애 대신 또래 관계 읽기
 */
export function baseEvidenceOf(c: FrameContext, sel: Selection): Evidence[] {
  const out: Evidence[] = [];
  const A = (t: string) => forAudience(t, c.audience);
  const day = c.pillars.day;
  const month = c.pillars.month;

  if (c.gender && c.star && c.audience !== "child" && !sel.love?.structure && day) {
    out.push({
      id: "saju.frame.base-love",
      source: "saju",
      topics: c.audience === "adult" ? ["love", "marriage", "relationship"] : ["love", "relationship"],
      strength: "weak",
      fact: A(`배우자 자리(일지) ${day.branch} — 일간 기준 ${day.branchGod}(${day.branchGroup}) / 배우자 별(${c.star}) 위치: ${starPlace(c)} / 일지의 관계: ${dayRelations(c)} / ${luckBring(c, c.star)}`),
      cue: A(
        `특별한 조합 구조는 발동하지 않았어요 — 조합 이름을 붙이지 않고 이 명식의 위치와 운으로만 읽습니다. 전통에서는 배우자 별이 천간에 드러나면 인연이 눈에 띄고, 지지 · 지장간 속에 있으면 신뢰가 쌓인 뒤 드러나며, 원국에 없으면 운에서 들어올 때 이 주제가 크게 느껴진다고 읽습니다. 일지의 합은 안정, 충 · 형은 움직임으로 읽되 사건으로 단정하지 않습니다. 지금 · 다음 대운이 배우자 별을 들이는 때는 관계 주제가 두드러지는 시기로 읽습니다.${c.audience === "adult" ? " 상대의 나이 · 직업 · 마음 · 만날 날짜 · 결혼 여부와 시기는 말하지 않습니다." : " 실제 연애 경험이 있는지는 알 수 없으니 경험을 사실처럼 쓰지 않고, 호감 · 친밀감 · 관계에서 마음을 쓰는 방식으로만 읽습니다."}`,
      ),
    });
  }

  if (c.audience !== "child" && !sel.wealth?.structure && month) {
    const jae = c.stems.재성 > 0 ? "천간에 드러남" : c.anywhere.재성 > 0 ? "지장간에만 있음" : "원국에 없음";
    out.push({
      id: "saju.frame.base-wealth",
      source: "saju",
      topics: ["money", "work"],
      strength: "weak",
      fact: `재성 위치: ${jae}(정재 ${c.godCount["정재"] ?? 0} · 편재 ${c.godCount["편재"] ?? 0}, 천간과 지지 본기 기준) / 월지(일 · 사회 환경 자리) ${month.branch} — 일간 기준 ${month.branchGod}(${month.branchGroup}) / ${luckBring(c, "재성")}`,
      cue: `특별한 조합 구조(식상생재 · 재생관 · 비겁탈재 같은 이름 있는 구조)는 발동하지 않았어요 — 조합 이름을 붙이지 않고 재성의 위치와 월지 · 운으로만 읽습니다. 전통에서는 재성이 천간에 드러나면 돈의 길이 눈에 띄고, 지장간에만 있으면 때가 되어 드러나며, 원국에 없으면 재성 운에서 이 주제가 크게 느껴진다고 읽습니다. 월지는 일 · 사회 환경의 바탕으로 읽습니다. 재성 개수만으로 부자 · 가난을 정하지 않고 실제 소득 · 소비 습관은 입력받지 않았습니다.${c.audience === "teen" ? " 만 16~18세는 용돈 · 돈에 대한 태도 · 진로 준비의 바탕으로만 읽습니다." : ""}`,
    });
  }

  if (c.audience === "child") {
    out.push({
      id: "saju.frame.base-peer",
      source: "saju",
      topics: ["relationship", "personality"],
      strength: "weak",
      fact: `가까운 관계의 자리(일지) ${day?.branch ?? "-"} — 일간 기준 ${day?.branchGod ?? "-"}(${day?.branchGroup ?? "-"}) / 또래 · 친구(비겁) ${c.visible.비겁}자리 · 표현(식상) ${c.visible.식상}자리 · 도와주는 사람(인성) ${c.visible.인성}자리 · 규칙과 기대(관성) ${c.visible.관성}자리(천간과 지지 본기 기준) / 일지의 관계: ${dayRelations(c)}`,
      cue: "만 16세 미만이라 어른의 관계 이야기는 하지 않고, 친구 · 또래 사이에서 마음을 표현하는 방식과 거리 조절, 도움을 받는 모습으로 읽습니다. 전통 대응에서 비겁은 친구 · 또래, 식상은 표현, 인성은 도움을 주는 사람, 관성은 규칙과 기대입니다. 자리 수로 좋고 나쁨을 정하지 않고 실제 친구 관계가 어떤지는 알 수 없습니다.",
    });
  }

  // 과거 회고 — 시기 프레임이 둘 미만이면 지난 대운 개요를 건넨다(없는 사건을 만들지 않고, 지난 대운의 간지 · 나이 범위 · 십성만)
  if (c.luck.length && sel.past.picks.length < 2) {
    const past = pastLuckOf(c).slice(-4);
    if (past.length) {
      const rows = past.map((u) => `${unitText(u)} ${ageText(u.ageFrom, u.ageTo)} — ${u.stemGroup && u.branchGroup && u.stemGroup !== u.branchGroup ? `${u.stemGroup} · ${u.branchGroup}` : (u.stemGroup ?? u.branchGroup ?? "")}`);
      out.push({
        id: "saju.frame.base-past",
        source: "saju",
        topics: ["timing", "personality"],
        strength: "weak",
        fact: `지난 대운(만 7세 이후, 현재 나이까지): ${rows.join(" / ")}`,
        cue: `특별한 시기 프레임은 ${sel.past.picks.length ? "하나만 발동했어요" : "발동하지 않았어요"} — 지난 대운의 십성 그룹으로만 읽습니다. 전통에서는 대운의 천간 · 지지가 어느 그룹이냐에 따라 그 시기의 주제를 읽습니다: ${(Object.keys(GROUP_THEME) as Group[]).map((g) => `${g} ${GROUP_THEME[g]}`).join(" / ")}. 지난 시기에 실제로 무슨 일이 있었는지는 알 수 없으니 사건을 쓰지 않고 "그 무렵 이런 주제가 두드러졌을 수 있어요"처럼 가능성으로만 풉니다. 긍정적인 경험과 힘들었던 경험을 함께 다루고 나이는 근거에 적힌 범위 안에서만 말합니다.`,
        period: { from: past[0].from, to: past[past.length - 1].to, label: "지난 대운 흐름" },
        ageWindows: past.map((u) => ({ from: u.ageFrom, to: u.ageTo })),
      });
    }
  }
  return out;
}
