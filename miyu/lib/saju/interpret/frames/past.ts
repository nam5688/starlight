// 과거 회고 프레임 6개 — 지난 대운 · 세운 × 원국. 연애 · 일 · 재물의 시기 프레임(L6 · W8)과 함께 과거 이야기의 재료가 된다.
// 소재는 세 갈래(연애 · 인연 / 일 · 진로 · 재물 / 가족 · 자립 · 성장)이고 어느 갈래를 쓸지는 명식이 정한다. 좋았던 시기와 성장도 같은 무게로 다룬다.
// 과거 회고는 가능성이다: 나이대 창("만 N세 무렵")과 조건형으로만 쓰고 정확한 나이 · 사건을 말하지 않으며, 현재 나이 이전의 시기만 쓴다.
// 가족 소재는 "환경 · 역할" 주제까지만 — 가족의 사건 · 갈등 · 건강 · 이별을 말하지 않는다. 전통 해석을 단순화한 초안이며 전문가 검토 전이다.
import type { FrameContext, FrameDef, FrameInstance, FrameUnit, Strand, Tone } from "./types.ts";
import type { Group } from "../structure.ts";

const unitName = (u: FrameUnit) => `${u.label}(천간 ${u.stemGod} · 지지 ${u.branchGod})`;
/** 현재 나이로 자른 지난 시기(아직 오지 않은 나이는 과거로 쓰지 않는다) */
const clipped = (u: FrameUnit, c: FrameContext): FrameUnit => ({ ...u, ageTo: Math.min(u.ageTo, c.age) });
const pastLuck = (c: FrameContext, minAge: number) => c.luck.filter((u) => u.ageFrom <= c.age - 1 && u.ageTo >= minAge);
const hasGroup = (u: FrameUnit, g: Group) => u.stemGroup === g || u.branchGroup === g;
const SUPPORT: Group[] = ["비겁", "인성"];

/** 대운 하나가 한 그룹을 들이는 시기 프레임 — 원국의 같은 자리가 약하거나 짝이 있을 때만(두 사실) */
function groupFrame(o: { group: Group; cond: (c: FrameContext) => string | null; minAge: number; strand: Strand; tone: Tone; angles: string[]; tag: string }) {
  return (c: FrameContext) => {
    const note = o.cond(c);
    if (!note) return null;
    const inst: FrameInstance[] = pastLuck(c, o.minAge)
      .filter((u) => hasGroup(u, o.group))
      .map((u) => ({
        id: `${o.tag}:${u.label}`, unit: clipped(u, c), ageFrom: Math.max(u.ageFrom, o.minAge), ageTo: Math.min(u.ageTo, c.age), strand: o.strand, tone: o.tone, angles: o.angles,
        why: `${unitName(u)}에 ${o.group}이 들어옴 + ${note}`, uses: [],
      }));
    return inst.length ? { facts: [`지난 대운에 ${o.group}이 들어온 시기 ${inst.length}곳`, note], uses: [], instances: inst } : null;
  };
}

export const PAST_FRAMES: FrameDef[] = [
  {
    id: "R1", area: "past", kind: "timing", name: "환경 · 역할이 바뀐 시기", minAge: 7,
    question: "어린 시절이나 학창 시절에 환경이 크게 바뀐 때가 있었을까요?",
    tradition: "대운이 바뀌면서 새 대운의 지지가 월지(부모 · 환경 자리)나 년지(초년 환경 자리)와 합 · 충 · 형을 이루고 천간의 방향이 돕는 쪽과 덜어내는 쪽 사이에서 뒤집히면, 환경과 맡는 역할이 달라지는 시기로 봅니다.",
    meaning: ["환경이 바뀜", "맡는 역할의 전환", "적응"],
    faces: {
      bright: ["새 환경에서 적응력이 자란 시기", "역할이 커지며 책임감이 생긴 시기"],
      hard: ["변화 때문에 마음에 오래 남은 일이 있었을 가능성", "환경에 맞추느라 내 속도를 잃은 시기"],
    },
    pastScenes: ["학교 · 생활 환경이 바뀐 시기", "맡는 역할이 달라진 시기", "또래와 어른 사이에서 내 위치가 바뀐 시기"],
    present: ["새 환경에 적응하며 나를 맞추는 습관"],
    future: ["다음 대운 전환기에 환경이 다시 바뀌는 주제를 미리 가늠하는 흐름"],
    hooks: [
      { axis: "sensitivity", side: "high", mode: "complement", face: "hard", note: "변화가 마음에 오래 남음" },
      { axis: "caution", side: "low", mode: "match", face: "bright", note: "변화에 적응이 빠름" },
    ],
    needs: ["luck"],
    limits: ["가족의 사건 · 이사 · 전학을 사실처럼 말하지 않는다(환경 · 역할이 바뀌었을 가능성으로만)", "만 7세 이전은 쓰지 않는다", "월주 · 년주가 절기 경계에서 달라질 수 있으면 근거에서 뺀다", "시각을 모르면 전환은 연 단위 무렵으로만"],
    overlaps: ["R2와 같은 시기를 쓰면 R2를 앞세우고 R1은 한 줄로 줄인다", "6장 한 곳에서만 쓴다"],
    grade: "자체조합",
    gradeNote: "대운이 바뀌는 지점의 지지가 월·년지와 합·충·형을 이루는 것과 천간의 돕는/덜어내는 방향 반전을 함께 보는 조합은 미유가 만들었다. 두 조건 모두 전통 근거를 확인하지 못했고 가족·환경 사건으로 읽힐 위험이 있어 쓰지 않는다.",
    condition: ["두 번째 이후 대운이 바뀌는 시점이 만 7세 이후 · 현재 나이 이전", "새 대운의 지지가 월지 또는 년지와 합 · 충 · 형을 이룸", "대운 천간 방향이 돕는 쪽(비겁 · 인성)과 덜어내는 쪽 사이에서 앞 대운과 반대로 바뀜"],
    data: ["luck-past", "luck-rel", "luck-god", "uncertain", "age", "hour-unknown"],
    check: (c) => {
      const out: FrameInstance[] = [];
      for (let i = 1; i < c.luck.length; i++) {
        const u = c.luck[i], prev = c.luck[i - 1];
        if (u.ageFrom < 7 || u.ageFrom > c.age - 1) continue;
        const rel = [...(u.rel.month ?? []), ...(u.rel.year ?? [])];
        if (!rel.length) continue;
        const dirPrev = prev.stemGroup && SUPPORT.includes(prev.stemGroup) ? "돕는 쪽" : "덜어내는 쪽";
        const dirNew = u.stemGroup && SUPPORT.includes(u.stemGroup) ? "돕는 쪽" : "덜어내는 쪽";
        if (dirPrev === dirNew) continue;
        out.push({
          id: `R1:${u.label}`, unit: clipped(u, c), ageFrom: u.ageFrom, ageTo: Math.min(u.ageTo, c.age), strand: "family", tone: "mixed",
          angles: ["환경과 역할이 달라지는 전환", "새 환경에 맞추며 자라는 시기"],
          why: `새 대운 ${unitName(u)}의 지지가 월 · 년지와 ${[...new Set(rel)].join("·")}, 천간 방향이 ${dirPrev} → ${dirNew}로 바뀜`, uses: ["year", "month"],
        });
      }
      return out.length ? { facts: [`대운 전환 × 월 · 년지 관계 + 천간 방향 반전 ${out.length}곳`, "전환 시기는 연 단위 무렵으로만 말함"], uses: ["year", "month"], instances: out } : null;
    },
  },
  {
    id: "R2", area: "past", kind: "timing", name: "기대와 자립 사이의 시기", minAge: 7,
    question: "어릴 때 나는 어떤 기대 속에서 자랐을까요? 내 방식을 찾기까지는 어땠을까요?",
    tradition: "월지 정기가 관성이나 인성이면 규범과 보호의 환경을 뜻하고, 학창 시절의 대운이 식상이나 비겁이면 표현 · 또래 · 독립 쪽으로 움직이는 시기로 읽어, 기대와 자립 사이의 균형을 익히는 구조로 봅니다.",
    meaning: ["규범과 보호의 환경", "표현 · 독립으로의 이동", "균형 익히기"],
    faces: {
      bright: ["성실함과 책임감이 일찍 자람", "틀 안에서 기본기를 탄탄히 익힘"],
      hard: ["기대에 맞추느라 속마음을 늦게 꺼냄", "내 방식을 찾기까지 시간이 걸림"],
    },
    pastScenes: ["집안 · 학교의 기대와 내 방식 사이에서 균형을 배운 시기", "일찍 책임을 익힌 시기", "또래와 어울리며 자유를 찾아간 시기"],
    present: ["규칙을 지키면서도 내 방식을 지키려는 모습"],
    future: ["식상 · 비겁 시기에 내 방식이 드러나는 주제"],
    hooks: [
      { axis: "jp", side: "high", mode: "complement", face: "bright", note: "틀 속에서 책임을 일찍 익힘" },
      { axis: "novelty", side: "high", mode: "match", face: "hard", note: "자유를 찾아 나감" },
    ],
    needs: ["luck"],
    limits: ["부모 · 가족의 태도를 사실처럼 말하지 않는다(환경의 성격으로만)", "월령에 기대므로 월주가 절기 경계에서 달라질 수 있으면 근거에서 뺀다", "학창 시절 한 대운에만 쓴다"],
    overlaps: ["R1과 같은 시기이면 R2를 앞세운다"],
    grade: "자체조합",
    gradeNote: "월지 정기가 관성·인성이고 학창기 대운이 식상·비겁이면 '기대와 자립 사이'라는 읽기는 미유가 만든 조합이다. 부모·가정의 태도를 읽는 쪽으로 번질 위험이 있어 쓰지 않는다.",
    condition: ["월지 정기가 관성 또는 인성(규범 · 보호 환경 자리)", "만 7세 이후 첫 지난 대운(학창 시절)의 천간 또는 지지가 식상 또는 비겁"],
    data: ["luck-past", "luck-god", "month-ling", "uncertain", "age"],
    check: (c) => {
      if (!(c.monthGroup === "관성" || c.monthGroup === "인성")) return null;
      const f = c.luck.find((u) => u.ageTo >= 7 && u.ageFrom <= c.age - 1);
      if (!f) return null;
      if (!(hasGroup(f, "식상") || hasGroup(f, "비겁"))) return null;
      return {
        facts: [`월지 정기가 ${c.monthGroup}(규범 · 보호 환경 자리)`, `학창 시절 ${unitName(f)}이 식상 · 비겁(표현 · 또래 · 독립 쪽)`],
        uses: ["month"],
        instances: [{ id: `R2:${f.label}`, unit: clipped(f, c), ageFrom: Math.max(f.ageFrom, 7), ageTo: Math.min(f.ageTo, c.age), strand: "family", tone: "mixed", angles: ["기대와 내 방식 사이의 균형", "책임감과 자유 욕구가 함께 자라는 시기"], why: `월지 ${c.monthGroup} 환경 + ${unitName(f)}`, uses: ["month"] }],
      };
    },
  },
  {
    id: "R3", area: "past", kind: "timing", name: "도움 · 배움을 받은 시기", minAge: 8,
    question: "배움이나 도움을 크게 받은 시기가 있었을까요?",
    tradition: "원국에 인성이 적은데 대운에 인성이 들어오면 배움 · 보호 · 도움이 그 시기에 두드러지는 흐름으로 봅니다.",
    meaning: ["배움 · 보호 · 도움", "채워지는 시기", "준비와 자격"],
    faces: {
      bright: ["좋은 어른 · 스승 · 환경에서 배움을 얻은 시기", "공부와 준비에 힘이 붙은 시기"],
      hard: ["도움에 기대다 내 결정이 늦어진 시기", "채워지는 동안 속도가 느리게 느껴진 시기"],
    },
    pastScenes: ["배움 · 자격 · 준비에 집중한 시기", "도움을 주는 사람이 곁에 있던 시기"],
    present: ["배운 것을 내 것으로 만드는 방식"],
    future: ["인성이 다시 들어오는 시기에 배움 · 정비 주제가 열리는 흐름"],
    hooks: [{ axis: "caution", side: "high", mode: "complement", face: "bright", note: "신중하게 익힘" }],
    needs: ["luck"],
    limits: ["특정 인물(스승 · 부모)을 사실처럼 말하지 않는다", "만 8세 이전은 쓰지 않는다"],
    overlaps: ["R4와 같은 시기를 쓰지 않는다(한 시기 한 이야기)"],
    grade: "단순화",
    gradeNote: "대운에 인성이 들어오는 시기를 배움·도움의 때로 읽는 십성 대운론이다. 원국에 인성이 적을 때로 줄였다(용신·희신 판정은 쓰지 않는다).",
    condition: ["원국 인성 1자리 이하", "지난 대운(만 8세 이후)의 천간 또는 지지에 인성이 들어옴"],
    data: ["luck-past", "luck-god", "group-count", "age"],
    check: groupFrame({ group: "인성", cond: (c) => (c.visible.인성 <= 1 ? `원국 인성 ${c.visible.인성}자리(1 이하)` : null), minAge: 8, strand: "growth", tone: "positive", angles: ["배움과 도움이 채워지는 시기", "준비하며 실력을 쌓는 시기"], tag: "R3" }),
  },
  {
    id: "R4", area: "past", kind: "timing", name: "표현 · 성과가 드러난 시기", minAge: 10,
    question: "내 재능이나 표현이 드러나 인정받은 시기가 있었을까요?",
    tradition: "원국에 식상이 적은데 대운에 식상이 들어오면 표현 · 재능 · 활동이 그 시기에 드러나는 흐름으로 봅니다. 받침(월령 · 뿌리)이 약하면 성과보다 소모를 느끼기도 하는 것으로 읽습니다.",
    meaning: ["표현과 재능이 드러남", "활동의 확장", "소모 주의"],
    faces: {
      bright: ["하고 싶은 것을 드러내고 인정받은 시기", "재능이나 취미가 성과로 이어진 시기"],
      hard: ["표현이 앞서 에너지를 많이 쓴 시기", "성과보다 소모를 느낀 시기"],
    },
    pastScenes: ["재능 · 취미 · 활동으로 인정받은 시기", "새로운 것을 시도해 반응을 얻은 시기"],
    present: ["드러내는 것에 대한 용기와 부담이 함께 있는 모습"],
    future: ["식상이 다시 들어오는 시기에 표현 · 결과물 주제가 열리는 흐름"],
    hooks: [{ axis: "novelty", side: "high", mode: "match", face: "bright", note: "새로움 시도가 성과로" }],
    needs: ["luck"],
    limits: ["수상 · 합격 같은 구체적 성과를 말하지 않는다", "만 10세 이전은 쓰지 않는다"],
    overlaps: ["R3와 같은 시기를 쓰지 않는다"],
    grade: "단순화",
    gradeNote: "대운에 식상이 들어오는 시기를 표현·재능이 드러나는 때로 읽는 십성 대운론이다. 원국에 식상이 적을 때로 줄였다.",
    condition: ["원국 식상 1자리 이하", "지난 대운(만 10세 이후)의 천간 또는 지지에 식상이 들어옴"],
    data: ["luck-past", "luck-god", "group-count", "age"],
    check: groupFrame({ group: "식상", cond: (c) => (c.visible.식상 <= 1 ? `원국 식상 ${c.visible.식상}자리(1 이하)` : null), minAge: 10, strand: "growth", tone: "positive", angles: ["표현과 재능이 드러나는 시기", "활동 폭이 넓어지는 시기"], tag: "R4" }),
  },
  {
    id: "R5", area: "past", kind: "timing", name: "경쟁 · 비교가 늘던 시기", minAge: 10,
    question: "친구나 동료와 비교하며 마음이 쓰였던 시기가 있었을까요?",
    tradition: "원국에 재성이 있는데 대운에 비겁이 들어오면 같은 몫을 두고 다투는 사람(친구 · 동료)이 늘어 경쟁과 비교가 주제가 되는 시기로 봅니다.",
    meaning: ["경쟁과 비교", "또래의 영향", "자극과 성장"],
    faces: {
      bright: ["경쟁 속에서 실력이 크는 시기", "함께 겨루며 친구가 늘던 시기"],
      hard: ["비교 때문에 마음이 흔들린 시기", "내 몫을 지키려 긴장한 시기"],
    },
    pastScenes: ["친구 · 동료와 비교하며 자극받은 시기", "같은 자리를 두고 경쟁했던 시기"],
    present: ["비교하지 않으려 해도 기준을 가늠하는 모습"],
    future: ["비겁이 다시 들어오는 시기에 동료 · 경쟁 주제가 올라오는 흐름"],
    hooks: [{ axis: "sensitivity", side: "high", mode: "complement", face: "hard", note: "비교에 예민" }],
    needs: ["luck"],
    limits: ["특정 친구와의 갈등을 말하지 않는다", "만 10세 이전은 쓰지 않는다"],
    overlaps: ["W2와 같은 이야기를 재물 쪽에서 반복하지 않는다(과거 시기는 6장 한 곳)"],
    grade: "단순화",
    gradeNote: "원국에 재성이 있는데 대운에 비겁이 들어오면 몫을 다투는 사람이 늘어난다고 읽는 서술(비겁 대운)이다. 또래 비교 주제로 줄였다.",
    condition: ["원국 재성 1자리 이상(경쟁 대상이 있음)", "지난 대운(만 10세 이후)의 천간 또는 지지에 비겁이 들어옴"],
    data: ["luck-past", "luck-god", "group-count", "age"],
    check: groupFrame({ group: "비겁", cond: (c) => (c.visible.재성 >= 1 ? `원국 재성 ${c.visible.재성}자리(경쟁 대상이 있음)` : null), minAge: 10, strand: "work", tone: "mixed", angles: ["경쟁과 비교가 주제가 되는 시기", "함께 겨루며 크는 시기"], tag: "R5" }),
  },
  {
    id: "R6", area: "past", kind: "timing", name: "책임 · 평가가 커진 시기", minAge: 12,
    question: "책임이나 평가의 무게가 커졌던 시기가 있었을까요?",
    tradition: "원국에 관성이 적은데 대운에 관성이 들어오면 규칙 · 평가 · 책임이 그 시기에 커지는 흐름으로 봅니다.",
    meaning: ["책임과 평가", "규칙의 무게", "신뢰를 얻음"],
    faces: {
      bright: ["책임을 맡으며 신뢰를 얻은 시기", "기준이 분명해지며 실력이 선 시기"],
      hard: ["평가의 무게로 지친 시기", "규칙이 답답하게 느껴진 시기"],
    },
    pastScenes: ["시험 · 평가 · 직장의 기준 안에서 책임을 맡은 시기", "규칙과 기대가 커진 시기"],
    present: ["평가 앞에서 기준을 세우려는 모습"],
    future: ["관성이 다시 들어오는 시기에 책임 · 평가 주제가 올라오는 흐름"],
    hooks: [{ axis: "persistence", side: "high", mode: "match", face: "bright", note: "책임을 끝까지" }],
    needs: ["luck"],
    limits: ["실제 직장 · 시험 결과를 말하지 않는다", "만 12세 이전은 쓰지 않는다"],
    overlaps: ["W3와 같은 이야기를 재물 쪽에서 반복하지 않는다"],
    grade: "단순화",
    gradeNote: "대운에 관성이 들어오는 시기를 책임·평가가 커지는 때로 읽는 십성 대운론이다. 원국에 관성이 적을 때로 줄였다.",
    condition: ["원국 관성 1자리 이하", "지난 대운(만 12세 이후)의 천간 또는 지지에 관성이 들어옴"],
    data: ["luck-past", "luck-god", "group-count", "age"],
    check: groupFrame({ group: "관성", cond: (c) => (c.visible.관성 <= 1 ? `원국 관성 ${c.visible.관성}자리(1 이하)` : null), minAge: 12, strand: "work", tone: "mixed", angles: ["책임과 평가가 커지는 시기", "신뢰를 얻으며 기준이 서는 시기"], tag: "R6" }),
  },
];

