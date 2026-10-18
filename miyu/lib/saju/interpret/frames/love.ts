// 연애 · 배우자 프레임 6개 — 배우자 자리(일지) × 배우자 별(남 재성 · 여 관성) × 합 · 충 · 형 × 운(대운 · 세운).
// 배우자 별은 전통 한 가지 기준이다(운영자 2026-10-18 — 다른 학파 기준은 내부 문서로만). 전통 해석을 단순화한 초안이며 전문가 검토 전이다.
// 각 프레임은 서로 다른 사실 둘 이상이 겹칠 때만 발동한다. 키워드는 문장이 아니고 가능성의 범위다 — 실제 연애 · 결혼 · 이별 여부를 말하지 않는다.
import { KEY_LABEL, presentKeys } from "./context.ts";
import type { PillarKey } from "../../engine.ts";
import type { FrameContext, FrameDef, FrameInstance, FrameUnit } from "./types.ts";

const isHe = (k: string[] | undefined) => !!k?.some((x) => x === "육합" || x === "반합");
const isChungHyung = (k: string[] | undefined) => !!k?.some((x) => x === "충" || x === "형");
const relPairs = (c: FrameContext, f: (k: string[]) => boolean) =>
  (Object.entries(c.dayRel) as [string, string[]][]).filter(([, k]) => f(k)).map(([key, k]) => `일지–${KEY_LABEL[key]}지 ${k.join("·")}`);
const relKeys = (c: FrameContext, f: (k: string[]) => boolean) => (Object.entries(c.dayRel) as [PillarKey, string[]][]).filter(([, k]) => f(k)).map(([key]) => key);
const starLevel = (c: FrameContext) => (c.visible[c.star!] === 0 ? (c.anywhere[c.star!] > 0 ? "숨음" : "없음") : c.visible[c.star!] >= 3 ? "많음" : c.visible[c.star!] === 2 ? "둘" : "하나");
const unitName = (u: FrameUnit) => `${u.label}(천간 ${u.stemGod} · 지지 ${u.branchGod})`;
const starName = (c: FrameContext) => (c.gender === "female" ? "관성" : "재성");

export const LOVE_FRAMES: FrameDef[] = [
  {
    id: "L1", area: "love", kind: "structure", name: "자리 잡는 인연",
    question: "나는 어떤 모양의 인연을 만날까요? 오래 가는 관계는 어떤 모습일까요?",
    tradition: "배우자 자리(일지)가 다른 자리와 합을 이루고 배우자 별이 천간에 드러나 있으며 충 · 형이 없으면, 인연이 눈에 띄게 드러나고 자리를 잡는 구조로 봅니다.",
    meaning: ["인연이 드러남", "관계가 자리를 잡음", "약속과 책임"],
    faces: {
      bright: ["천천히 깊어지고 오래 가는 관계", "약속과 책임을 중요하게 다루는 태도", "관계를 맺으면 안정을 만들어 가는 힘"],
      hard: ["한 번 맺은 관계의 틀에서 벗어나기 어려움", "상대 기대에 맞추느라 내 표현이 줄어듦", "관계를 바꾸는 결정에 시간이 걸림"],
    },
    pastScenes: ["오래 이어질 인연을 기대하거나 만났을 가능성", "관계가 안정으로 자리 잡던 시기", "주변에서 인연 이야기를 자주 듣던 시기"],
    present: ["가까워지면 책임을 먼저 떠올리는 모습", "정하기까지 신중하지만 정하면 오래 가는 모습"],
    future: ["배우자 별이 들어오는 시기에 관계가 구체화되는 주제", "일지 합이 겹치는 해의 약속 · 정리 주제"],
    hooks: [
      { axis: "anxiety", side: "high", mode: "differ", face: "hard", note: "구조는 안정인데 마음은 확인을 원함" },
      { axis: "avoidance", side: "low", mode: "match", face: "bright", note: "가까워지는 데 거리 부담이 적음" },
    ],
    needs: ["gender"],
    limits: ["실제 연애 여부 · 결혼 시기를 말하지 않는다", "합 상대가 월지이고 월주가 절기 경계에서 달라질 수 있으면 근거에서 뺀다", "일지 충 · 형이 있으면 이 프레임이 아니라 L3로 본다"],
    overlaps: ["L3와 함께 나오지 않는다(충 · 형이 있으면 L3)", "L6의 합 시기와 같은 이야기를 두 장에서 반복하지 않는다"],
    grade: "단순화",
    gradeNote: "배우자 자리(일지) 합 + 배우자 별 투출은 전통에서 흔히 읽는 구조이고, 충·형이 없는 경우만 이 프레임으로 줄였다.",
    condition: ["배우자 별(남 재성 · 여 관성)이 천간에 1자리 이상 드러남", "일지가 다른 기둥의 지지와 육합 또는 반합을 이룸", "일지가 어느 기둥과도 충 · 형을 이루지 않음"],
    data: ["gender", "star-stem", "day-rel", "uncertain"],
    check: (c) => {
      if (!c.star || !c.starOnStem.length) return null;
      const he = relPairs(c, isHe);
      if (!he.length) return null;
      if (relPairs(c, isChungHyung).length) return null;
      const uses: PillarKey[] = ["day", ...relKeys(c, isHe)];
      return { facts: [`배우자 별(${starName(c)})이 천간에 드러남: ${c.starOnStem.join(", ")}`, `배우자 자리(일지)가 합을 이룸: ${he.join(", ")}`, "일지 충 · 형 없음"], uses };
    },
  },
  {
    id: "L2", area: "love", kind: "structure", name: "겉으로 드러나지 않는 인연",
    question: "나는 마음을 잘 표현하는 편일까요? 인연이 드러나는 방식은 어떤 모양일까요?",
    tradition: "배우자 별이 천간에는 없고 지지 안에만 있으면 인연이 겉으로 드러나지 않다가 운에서 천간으로 드러날 때 눈에 띄는 구조로 봅니다.",
    meaning: ["인연이 속에 있음", "드러나는 데 시간이 걸림", "신뢰 뒤에 깊어짐"],
    faces: {
      bright: ["겉모습보다 속을 보는 인연", "신뢰가 쌓인 뒤 깊어지는 관계", "마음을 열면 깊이 연결되는 모습"],
      hard: ["마음 표현이 늦어 상대가 알아채기 어려움", "인연이 곁에 있어도 늦게 알아봄", "먼저 다가가기보다 기다리는 쪽에 서기 쉬움"],
    },
    pastScenes: ["좋아하는 마음을 오래 품고만 있던 시기", "친구에서 가까운 사이로 천천히 바뀌었을 가능성", "인연을 놓쳤다고 느낀 순간이 있었을 가능성"],
    present: ["가까워질수록 천천히 마음을 보여 주는 모습"],
    future: ["배우자 별이 천간으로 드러나는 시기에 인연이 눈에 띄는 주제", "가까운 사이에서 시작되는 흐름"],
    hooks: [
      { axis: "avoidance", side: "high", mode: "match", face: "hard", note: "마음을 늦게 꺼냄" },
      { axis: "anxiety", side: "high", mode: "complement", face: "hard", note: "표현은 늦어도 확인 욕구는 큼" },
    ],
    needs: ["gender"],
    limits: ["지지 안의 별은 드러나지 않는다고 읽는 단순화이며 사건을 말하지 않는다", "일지 정기가 배우자 별이면 숨은 인연이 아니라 배우자 자리의 성질이라 이 프레임이 아니다"],
    overlaps: ["L1 · L4와 함께 나오지 않는다(천간에 별이 있으면 L1 · L4 쪽)", "L6에서 배우자 별이 드러나는 시기와 연결해 한 번만 쓴다"],
    grade: "단순화",
    gradeNote: "배우자 별이 천간에 투출되지 않고 지지·지장간에만 있는 구조를 '늦게 드러나는 인연'으로 읽는 전통 서술을 한 조건으로 줄였다.",
    condition: ["배우자 별이 천간에 없음", "배우자 별이 지지 본기 또는 지장간에 있음", "일지 정기(본기)가 배우자 별이 아님"],
    data: ["gender", "star-stem", "star-branch", "uncertain"],
    check: (c) => {
      if (!c.star || c.starOnStem.length) return null;
      if (!c.starInHidden.length && !c.starOnBranch.length) return null;
      if (c.pillars.day?.branchGroup === c.star) return null;
      return {
        facts: ["배우자 별이 천간에 없음", `배우자 별이 지지에 있음: ${[...c.starOnBranch, ...c.starInHidden].join(", ")}`, `일지 정기는 ${c.pillars.day?.branchGroup}(배우자 별이 아님)`],
        uses: presentKeys(c),
      };
    },
  },
  {
    id: "L3", area: "love", kind: "structure", name: "변화 · 거리 구조",
    question: "나는 왜 가까워지다가도 거리를 두게 될까요? 관계에서 반복되기 쉬운 장면은 뭘까요?",
    tradition: "배우자 자리(일지)가 다른 자리와 충이나 형을 이루고 배우자 별이 하나 이하이면 관계에 움직임이 크고 거리 조절이 주제가 되는 구조로 봅니다. 합이 함께 있으면 밀고 당기는 모양으로 읽습니다.",
    meaning: ["관계에 움직임", "거리 조절", "환경과 함께 바뀜"],
    faces: {
      bright: ["변화 속에서 새 사람에게 열려 있는 매력", "답답한 관계를 못 견디는 자립적인 모습", "환경이 바뀌어도 관계를 새로 만드는 힘"],
      hard: ["가까워지다 거리를 두는 흐름이 반복되기 쉬움", "일 · 이동 · 환경 때문에 떨어지는 시기가 생기기 쉬움", "감정의 오르내림이 관계에 영향을 줌"],
    },
    pastScenes: ["관계의 시작과 끝이 환경 변화와 겹쳤을 가능성", "거리를 두고 싶었던 시기", "새 환경에서 새 인연이 생긴 시기"],
    present: ["가까워지면 숨 쉴 공간을 먼저 찾는 모습"],
    future: ["일지와 합이 되는 시기에 관계가 안정으로 모이는 주제", "환경이 안정되는 시기에 거리 문제가 줄어드는 흐름"],
    hooks: [
      { axis: "avoidance", side: "high", mode: "match", face: "hard", note: "가까워지다 거리를 둠" },
      { axis: "sensitivity", side: "high", mode: "complement", face: "hard", note: "변화가 마음에 오래 남음" },
    ],
    needs: ["gender"],
    limits: ["실제 이별 · 거리 두기가 있었다고 말하지 않는다", "충 · 형 상대 기둥이 절기 경계로 흔들리면 그 근거는 뺀다", "합이 함께 있으면 어느 한쪽으로 단정하지 않는다"],
    overlaps: ["L1과 함께 나오지 않는다", "L6의 충 · 형 시기와 같은 이야기를 두 번 쓰지 않는다"],
    grade: "단순화",
    gradeNote: "배우자 자리의 충·형을 변동·거리 조절로 읽는 것은 전통 서술이다. 사건(이별)이 아니라 주제로만 읽도록 줄였다.",
    condition: ["일지가 다른 기둥의 지지와 충 또는 형을 이룸", "배우자 별이 드러난 자리가 1자리 이하(숨음 · 없음 포함)", "(합이 함께 있으면 '밀고 당기는 모양' 사실을 덧붙임 — 조건이 아니라 표시)"],
    data: ["gender", "star-stem", "group-count", "day-rel", "uncertain"],
    check: (c) => {
      if (!c.star) return null;
      const ch = relPairs(c, isChungHyung);
      if (!ch.length) return null;
      if (c.visible[c.star] > 1) return null;
      const he = relPairs(c, isHe);
      return {
        facts: [`배우자 자리(일지)가 충 · 형을 이룸: ${ch.join(", ")}`, `배우자 별 ${c.visible[c.star]}자리(1 이하)`, ...(he.length ? [`합도 함께 있음(밀고 당기는 모양): ${he.join(", ")}`] : [])],
        uses: ["day", ...relKeys(c, (k) => isChungHyung(k) || isHe(k))],
      };
    },
  },
  {
    id: "L4", area: "love", kind: "structure", name: "선택폭이 넓은 인연",
    question: "나는 끌리는 사람이 여러 유형일까요? 정하기까지 오래 걸리는 이유는 뭘까요?",
    tradition: "배우자 별이 둘 이상이고 정 · 편이 함께 있으면(여성 정관 + 편관, 남성 정재 + 편재) 끌림이 한 갈래가 아니고 선택폭이 넓은 구조로 봅니다.",
    meaning: ["끌림이 여러 갈래", "선택폭", "기준 찾기"],
    faces: {
      bright: ["다양한 사람과 어울리는 폭", "끌리는 유형이 한 가지가 아님", "관계를 넓게 경험하며 기준을 찾는 힘"],
      hard: ["마음이 여러 갈래로 갈려 정하기 어려움", "기준이 흔들려 오래 비교함", "누구에게 마음을 쓸지 고민이 길어짐"],
    },
    pastScenes: ["비슷한 시기에 여러 갈래의 끌림 · 선택 고민이 있었을 가능성", "관계의 기준을 바꾼 시기"],
    present: ["정하기 전에 오래 살피는 모습"],
    future: ["배우자 별이 더해지는 시기에 선택 주제가 다시 올라오는 흐름"],
    hooks: [
      { axis: "caution", side: "high", mode: "differ", face: "bright", note: "끌림은 여러 갈래인데 정하기는 신중" },
      { axis: "ei", side: "high", mode: "match", face: "bright", note: "사람 폭이 넓음" },
    ],
    needs: ["gender"],
    limits: ["여러 사람을 만났다고 말하지 않는다", "선택폭은 가능성의 폭이며 관계 수를 뜻하지 않는다"],
    overlaps: ["L2와 함께 나오지 않는다", "L5와 겹치면 L5의 어려운 면을 더 앞세우지 않는다"],
    grade: "통설",
    gradeNote: "정관+편관(관살혼잡), 정재+편재가 함께 있는 구조를 끌림이 여러 갈래인 모양으로 읽는 이름 있는 구조다.",
    condition: ["배우자 별이 드러난 자리가 2 이상", "정 · 편이 함께 있음(여성 정관 + 편관 / 남성 정재 + 편재)"],
    data: ["gender", "group-count", "god-count", "uncertain"],
    check: (c) => {
      if (!c.star || c.visible[c.star] < 2) return null;
      const [a, b] = c.gender === "female" ? ["정관", "편관"] : ["정재", "편재"];
      if (!((c.godCount[a] ?? 0) > 0 && (c.godCount[b] ?? 0) > 0)) return null;
      return { facts: [`배우자 별 ${c.visible[c.star]}자리`, `${a} ${c.godCount[a]} · ${b} ${c.godCount[b]}가 함께 있음`], uses: presentKeys(c) };
    },
  },
  {
    id: "L5", area: "love", kind: "structure", name: "표현 · 기대가 부딪히는 구조",
    question: "나는 관계에서 왜 숨이 막히거나 부딪히는 순간이 있을까요?",
    tradition: "여성은 식상(표현 · 자유)이 많고 상관과 관성(상대 · 규범의 기대)이 함께 있으면(상관견관), 남성은 비겁(친구 · 경쟁)이 많고 겁재와 재성(연인 자리)이 함께 있으면 연인 관계에 표현의 충돌이나 주변 영향이 겹치는 구조로 봅니다.",
    meaning: ["표현과 기대의 부딪힘", "대등한 관계 욕구", "주변 영향"],
    faces: {
      bright: ["솔직하고 대등한 관계를 원하는 태도", "틀에 갇히지 않는 매력"],
      hard: ["상대의 기대나 규칙에 숨이 막힘", "참다가 한 번에 표현이 거세짐"],
    },
    facesBy: {
      female: {
        bright: ["솔직하고 대등한 관계를 원하는 태도", "하고 싶은 말을 분명히 하는 힘", "틀에 갇히지 않는 매력"],
        hard: ["상대의 기대나 규칙에 숨이 막힘", "참다가 한 번에 표현이 거세짐", "자유와 약속 사이의 긴장"],
      },
      male: {
        bright: ["의리와 동료애가 두터움", "연인을 친구처럼 편하게 대하는 모습", "함께하는 사람이 많아 든든함"],
        hard: ["친구 · 가족과 연인 사이 시간 배분 고민", "연인과 가까운 사람들이 함께 얽히는 상황", "관계에서 내 몫을 지키는 문제"],
      },
    },
    pastScenes: ["하고 싶은 말을 삼키던 관계의 시기", "주변 사람들이 관계에 영향을 주던 시기", "대등한 관계를 처음 요구하게 된 시기"],
    present: ["관계에서 내 방식과 상대 기대를 가늠하는 모습"],
    future: ["배우자 별이 들어오는 시기에 관계의 규칙을 다시 정하는 주제"],
    hooks: [
      { axis: "sensitivity", side: "high", mode: "complement", face: "hard", note: "상대 기대에 예민" },
      { axis: "jp", side: "high", mode: "differ", face: "hard", note: "정해진 틀을 좋아하는데 표현 욕구가 충돌" },
    ],
    needs: ["gender"],
    limits: ["성별에 따라 다른 전통 규칙이므로 성별이 없으면 발동하지 않는다", "상대의 성격 · 속마음을 말하지 않는다", "가족 · 친구와의 갈등이 있었다고 말하지 않는다"],
    overlaps: ["L4와 겹치면 선택폭 쪽 이야기를 한 번만 쓴다"],
    grade: "단순화",
    gradeNote: "여성 상관견관, 남성 군겁쟁재(비겁이 많고 겁재가 재성을 다툼)는 이름 있는 구조다. 인접 여부 같은 세부 조건은 줄였다.",
    condition: ["여성: 상관 1자리 이상 · 관성 1자리 이상 · 식상 합계 2 이상", "남성: 겁재 1자리 이상 · 비겁 합계 3 이상 · 재성 1자리 이상", "성별이 없으면 발동하지 않음"],
    data: ["gender", "group-count", "god-count", "uncertain"],
    check: (c) => {
      if (!c.star) return null;
      if (c.gender === "female") {
        const sg = c.godCount["상관"] ?? 0;
        if (sg >= 1 && c.visible.관성 >= 1 && c.visible.식상 >= 2) return { facts: [`상관 ${sg}자리`, `관성 ${c.visible.관성}자리(상관과 같은 원국에 있음)`, `식상 합계 ${c.visible.식상}자리(2 이상)`], uses: presentKeys(c) };
        return null;
      }
      const gj = c.godCount["겁재"] ?? 0;
      if (gj >= 1 && c.visible.비겁 >= 3 && c.visible.재성 >= 1) return { facts: [`겁재 ${gj}자리`, `비겁 합계 ${c.visible.비겁}자리(3 이상)`, `재성 ${c.visible.재성}자리(연인 자리와 같은 원국에 있음)`], uses: presentKeys(c) };
      return null;
    },
  },
  {
    id: "L6", area: "love", kind: "timing", name: "인연 주제가 움직이는 시기", minAge: 16,
    question: "연애 · 인연이 움직이는 시기는 언제일까요? 지나온 인연의 변화는 어땠을까요?",
    tradition: "대운이나 세운에 배우자 별이 들어오고 그 지지가 배우자 자리(일지)와 합이나 충 · 형을 이루면 인연 주제가 움직이는 시기로 봅니다. 합은 맺고 자리 잡는 쪽, 충 · 형은 흔들리고 전환되는 쪽으로 읽습니다.",
    meaning: ["인연 주제가 움직임", "맺음 또는 전환", "나이대 창"],
    faces: {
      bright: ["관계가 맺어지고 가까워지는 주제", "새 인연이 열리는 주제"],
      hard: ["관계가 흔들리고 전환되는 주제", "정리 · 거리두기 · 새 출발 주제"],
    },
    pastScenes: ["그 나이대에 인연이나 관계에서 의미 있는 변화가 있었을 가능성", "관계를 새로 정의하게 된 시기"],
    present: ["그 시기를 지나며 관계를 바라보는 기준이 달라진 모습"],
    future: ["앞으로 인연 주제가 두드러지는 시기", "관계를 정리하거나 맺기 좋은 때를 가늠하는 흐름"],
    hooks: [
      { axis: "avoidance", side: "high", mode: "match", face: "hard", note: "충 · 형 시기에 거리를 둠" },
      { axis: "anxiety", side: "high", mode: "complement", face: "hard", note: "흔들림에 확인 욕구가 커짐" },
    ],
    needs: ["gender", "luck"],
    limits: ["정확한 연도 · 사건을 말하지 않고 나이대 창과 가능성으로만 쓴다", "만 16세 이전 시기는 과거 회고로 쓰지 않는다", "일지가 절기 경계(야자시 관법)로 달라질 수 있으면 근거에서 뺀다", "시각을 모르면 대운 전환은 연 단위 무렵으로만 말한다"],
    overlaps: ["L1 · L3와 같은 이야기를 반복하지 않는다(구조는 3장, 시기는 시기로)", "과거 회고(6장)와 같은 시기를 두 번 쓰지 않는다 — 쓴 시기는 한 곳에서만"],
    grade: "단순화",
    gradeNote: "운에서 배우자 별이 들어오고 그 지지가 배우자 자리와 합·충·형을 이루는 시기를 인연 주제가 움직이는 때로 읽는 전통 서술을 한 조건으로 줄였다.",
    condition: ["대운 또는 세운의 천간이나 지지 본기가 배우자 별 그룹", "그 지지가 일지와 육합 · 반합 또는 충 · 형을 이룸", "과거 시기는 만 16세 이후만(현재 나이로 자름)", "일지가 절기 경계 · 야자시 관법으로 흔들리면 그 시기를 뺌"],
    data: ["gender", "luck-current", "luck-past", "year-current", "year-past", "luck-rel", "luck-god", "day-rel", "uncertain", "age"],
    check: (c) => {
      if (!c.star) return null;
      const lvl = starLevel(c);
      const out: FrameInstance[] = [];
      for (const u of [...c.luck, ...c.years]) {
        if (u.position === "past" && u.ageTo < 16) continue;
        if (u.stemGroup !== c.star && u.branchGroup !== c.star) continue;
        const r = u.rel.day;
        const he = isHe(r), ch = isChungHyung(r);
        if (!he && !ch) continue;
        const angles = [
          he ? "관계가 맺어지고 자리 잡는 주제" : "관계가 흔들리고 전환되는 주제",
          lvl === "숨음" ? "마음이 겉으로 드러나는 시기" : lvl === "없음" || lvl === "하나" ? "인연 주제가 새로 열리는 시기" : "선택과 정리의 주제",
        ];
        out.push({
          id: `L6:${u.kind}:${u.label}`, unit: u, ageFrom: Math.max(u.ageFrom, 16), ageTo: u.ageTo, strand: "love", tone: he ? "positive" : "hard", angles,
          why: `${unitName(u)}에 배우자 별이 있고 지지가 일지와 ${(r ?? []).join("·")} · 원국 배우자 별 ${lvl}`, uses: ["day"],
        });
      }
      return out.length ? { facts: [`시기 지지 × 일지 관계 + 배우자 별(${starName(c)}) 동시 해당 ${out.length}곳`, `원국 배우자 별 ${lvl}`], uses: ["day"], instances: out } : null;
    },
  },
];
