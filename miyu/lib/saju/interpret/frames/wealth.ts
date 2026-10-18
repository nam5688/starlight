// 재물 프레임 8개 — 재성 × 식상 × 비겁 × 관성 × 월령 × 일간 방향 × 운(대운 · 세운).
// 한 십성의 개수만으로 돈복을 판정하지 않는다(재성 하나로 부자 · 가난을 말하지 않음). 서로 다른 사실 둘 이상이 겹칠 때만 발동한다.
// 전통 해석을 단순화한 초안이며 전문가 검토 전이다. 실제 수입 · 자산 · 소비 습관 · 투자를 확인 없이 말하지 않는다.
import { presentKeys } from "./context.ts";
import type { FrameDef, FrameInstance, FrameUnit } from "./types.ts";

const isHe = (k: string[] | undefined) => !!k?.some((x) => x === "육합" || x === "반합");
const isChungHyung = (k: string[] | undefined) => !!k?.some((x) => x === "충" || x === "형");
const unitName = (u: FrameUnit) => `${u.label}(천간 ${u.stemGod} · 지지 ${u.branchGod})`;

export const WEALTH_FRAMES: FrameDef[] = [
  {
    id: "W1", area: "wealth", kind: "structure", name: "만든 것이 돈으로 이어지는 구조",
    question: "내 재능이나 결과물이 돈이 되는 구조일까요? 돈은 어떤 길로 들어올까요?",
    tradition: "식상(표현 · 기술 · 결과물)이 재성(돈 · 현실의 결과)으로 이어지고 비겁의 나눔이 크지 않으며 월령이 식상 · 재성 쪽이거나 그 기운이 드러나 있으면, 만든 결과물이 수입으로 이어지는 구조로 봅니다.",
    meaning: ["결과물이 수입으로", "기술 · 표현의 쓰임", "일한 만큼 돌아옴"],
    faces: {
      bright: ["내가 만든 결과물이 수입으로 이어지는 흐름", "기술 · 표현 · 아이디어로 버는 길", "일하는 만큼 돌아오는 구조"],
      hard: ["벌 길이 많아 집중이 흩어짐", "결과물이 돈이 되기 전 버티는 시간", "수입이 성과에 크게 좌우됨"],
    },
    pastScenes: ["내가 만든 것이 인정받아 보상으로 이어진 시기", "새 수입 방법을 시도해 본 시기", "재능을 일로 바꿔 보려던 시기"],
    present: ["손과 머리를 쓰며 실속을 찾는 모습"],
    future: ["재성 · 식상이 들어오는 시기에 수입 구조를 넓히는 주제"],
    hooks: [
      { axis: "novelty", side: "high", mode: "match", face: "bright", note: "새 수입원을 시도" },
      { axis: "caution", side: "high", mode: "differ", face: "hard", note: "길은 있는데 시작과 지출에 신중" },
    ],
    needs: [],
    limits: ["실제 직업 · 수입 · 사업 여부를 말하지 않는다", "월령에 기대므로 월주가 절기 경계에서 달라질 수 있으면 근거에서 뺀다", "재성이 있다는 사실만으로 부자를 말하지 않는다"],
    overlaps: ["W5와 함께 나오지 않는다(재성이 1 이하이면 W5)", "W2와 겹치면 비겁이 3 이상이므로 W1은 나오지 않는다"],
    grade: "통설",
    gradeNote: "식상생재(만든 것이 재성으로 이어짐)는 이름 있는 구조다. 월령이 식상·재성 쪽인 조건은 미유가 더했다.",
    condition: ["식상 1자리 이상 · 재성 1자리 이상", "비겁 2자리 이하", "월령이 식상 · 재성이거나 월지 지장간이 천간에 투간해 식상 · 재성이 드러남"],
    data: ["group-count", "month-ling", "uncertain"],
    check: (c) => {
      if (c.visible.식상 < 1 || c.visible.재성 < 1 || c.visible.비겁 > 2) return null;
      if (!(c.monthGroup === "식상" || c.monthGroup === "재성" || c.monthExposed.includes("식상") || c.monthExposed.includes("재성"))) return null;
      return { facts: [`식상 ${c.visible.식상} · 재성 ${c.visible.재성}자리`, `비겁 ${c.visible.비겁}자리(2 이하)`, `월령 ${c.monthGroup}${c.monthExposed.length ? ` · 투간 ${c.monthExposed.join("·")}` : ""}(식상 · 재성 쪽)`], uses: ["month", ...presentKeys(c)] };
    },
  },
  {
    id: "W2", area: "wealth", kind: "structure", name: "나눔 · 경쟁으로 새기 쉬운 구조",
    question: "나는 돈이 사람 때문에 나가는 편일까요? 함께 벌 때 주의할 점은 뭘까요?",
    tradition: "비겁(같은 편 · 경쟁 · 나눔)이 많고 재성이 있으며 이를 눌러 줄 관성이 적으면(비겁탈재), 돈이 사람 · 경쟁 · 나눔으로 나뉘는 구조로 읽습니다.",
    meaning: ["사람과 나누는 몫", "경쟁", "동료의 영향"],
    faces: {
      bright: ["사람들과 나누고 함께 일하는 의리", "동료 · 친구를 통해 기회가 생기는 구조", "함께할 때 힘이 커지는 모습"],
      hard: ["지출이 사람 · 모임 · 체면으로 나가기 쉬움", "함께 벌 때 몫을 조율하는 문제", "경쟁이 심한 환경에서 기회가 나뉨"],
    },
    pastScenes: ["돈이나 일 때문에 사람과 이해관계를 조율했던 경험 가능성", "친구 · 동료와 몫을 나눈 시기", "경쟁 속에서 기회를 가늠한 시기"],
    present: ["사람을 챙기느라 내 몫을 뒤로 미루는 모습"],
    future: ["재성이 들어오는 시기에 나눔 · 경쟁을 조율하는 주제"],
    hooks: [
      { axis: "caution", side: "low", mode: "match", face: "hard", note: "지출이 쉬움" },
      { axis: "caution", side: "high", mode: "differ", face: "hard", note: "조심하는데 구조는 나눔이 큼" },
    ],
    needs: [],
    limits: ["실제 손실 · 동업 경험이 있었다고 말하지 않는다", "친구 · 가족과의 금전 문제를 사실처럼 쓰지 않는다"],
    overlaps: ["W1과 함께 나오지 않는다", "L5(남성)와 비겁 · 재성 이야기가 겹치면 재물 쪽은 W2에서 한 번만 쓴다"],
    grade: "통설",
    gradeNote: "비겁이 많고 재성이 있고 관성이 적은 비겁탈재(군겁쟁재)는 이름 있는 구조다.",
    condition: ["비겁 3자리 이상", "재성 1자리 이상", "관성 1자리 이하(비겁을 눌러 줄 자리가 적음)"],
    data: ["group-count"],
    check: (c) => {
      if (c.visible.비겁 < 3 || c.visible.재성 < 1 || c.visible.관성 > 1) return null;
      return { facts: [`비겁 ${c.visible.비겁}자리(3 이상)`, `재성 ${c.visible.재성}자리`, `관성 ${c.visible.관성}자리(1 이하 — 비겁을 눌러 줄 자리가 적음)`], uses: presentKeys(c) };
    },
  },
  {
    id: "W3", area: "wealth", kind: "structure", name: "책임이 따르는 수입 구조",
    question: "나는 조직 안에서 벌 때 더 안정적일까요? 책임과 수입은 어떻게 이어질까요?",
    tradition: "재성이 관성을 받쳐 주는 구조(재생관)이고 일간이 덜 받는 쪽이 아니면, 책임 있는 자리에서 안정적인 수입으로 이어지는 구조로 봅니다.",
    meaning: ["책임과 수입이 함께", "조직 안의 안정", "평가의 무게"],
    faces: {
      bright: ["책임을 맡을수록 안정적인 수입으로 이어짐", "조직 안에서 인정받아 보상이 커지는 구조"],
      hard: ["책임과 평가의 무게가 돈과 함께 따라옴", "틀 안의 수입에 묶이는 느낌"],
    },
    pastScenes: ["맡은 일이 늘며 보상도 늘던 시기", "평가와 책임이 커졌던 시기"],
    present: ["책임을 지는 만큼 안정을 찾는 모습"],
    future: ["재성 · 관성이 들어오는 시기에 역할과 보상이 함께 바뀌는 주제"],
    hooks: [
      { axis: "persistence", side: "high", mode: "match", face: "bright", note: "꾸준한 수입 · 책임" },
      { axis: "novelty", side: "high", mode: "differ", face: "hard", note: "틀을 벗어나고 싶은 마음" },
    ],
    needs: [],
    limits: ["직장인 · 공직 같은 직업을 말하지 않고 일하는 방식만 말한다", "일간 방향이 갈림이면 단정하지 않는다"],
    overlaps: ["W4와 함께 나오지 않는다(덜 받는 쪽이면 W4)"],
    grade: "통설",
    gradeNote: "재생관(재성이 관성을 받침)은 이름 있는 구조다. 일간 방향이 '덜 받는 쪽'이 아닐 때로 줄였다.",
    condition: ["재성 1자리 이상 · 관성 2자리 이상", "일간 방향이 '덜 받는 쪽'이 아님(받는 쪽 또는 갈림)"],
    data: ["group-count", "strength", "month-ling", "roots"],
    check: (c) => {
      if (c.visible.재성 < 1 || c.visible.관성 < 2 || c.strength === "덜 받는 쪽") return null;
      return { facts: [`재성 ${c.visible.재성} · 관성 ${c.visible.관성}자리`, `일간 방향 ${c.strength}(덜 받는 쪽 아님)`], uses: presentKeys(c) };
    },
  },
  {
    id: "W4", area: "wealth", kind: "structure", name: "돈의 길은 크나 받침이 약한 구조",
    question: "일과 돈이 커질 때 나는 감당할 수 있을까요? 지치지 않는 방법은 뭘까요?",
    tradition: "재성이 많고 일간이 덜 받는 쪽이며 일간을 돕는 자리(비겁 · 인성)가 적으면, 기회는 크지만 감당하는 힘이 부담이 되는 구조로 읽는 해석이 있습니다.",
    meaning: ["기회가 큼", "감당의 부담", "도움이 필요한 구조"],
    faces: {
      bright: ["기회와 일거리가 많이 몰리는 구조", "현실 감각이 뛰어남"],
      hard: ["일과 돈의 크기에 비해 몸과 마음이 지치기 쉬움", "혼자 감당하려는 습관이 부담이 됨"],
    },
    pastScenes: ["일이 한꺼번에 몰려 힘들었던 시기", "책임이 갑자기 커진 시기"],
    present: ["기회가 오면 일단 맡고 뒤에 힘들어하는 모습"],
    future: ["돕는 기운(비겁 · 인성)이 들어오는 시기에 짐이 가벼워지는 흐름"],
    hooks: [
      { axis: "sensitivity", side: "high", mode: "complement", face: "hard", note: "큰 책임에 마음이 지침" },
      { axis: "persistence", side: "high", mode: "match", face: "bright", note: "버티며 감당" },
    ],
    needs: [],
    limits: ["건강 · 질병을 말하지 않는다(지침은 마음의 부담 주제로만)", "일간이 약하다고 단정하지 않고 '덜 받는 쪽'이라는 방향만 쓴다"],
    overlaps: ["W3와 함께 나오지 않는다", "W7과 함께 나오지 않는다(인성이 3 이상이면 돕는 자리가 많음)"],
    grade: "통설",
    gradeNote: "재다신약(재성이 많고 일간이 덜 받는 쪽)은 이름 있는 구조다. 돕는 자리가 적은 조건으로 줄였다.",
    condition: ["재성 3자리 이상", "일간 방향이 '덜 받는 쪽'", "돕는 자리(비겁 + 인성) 2자리 이하"],
    data: ["group-count", "strength", "month-ling", "roots"],
    check: (c) => {
      if (c.visible.재성 < 3 || c.strength !== "덜 받는 쪽" || c.visible.비겁 + c.visible.인성 > 2) return null;
      return { facts: [`재성 ${c.visible.재성}자리(3 이상)`, "일간 방향 덜 받는 쪽", `돕는 자리(비겁 + 인성) ${c.visible.비겁 + c.visible.인성}자리(2 이하)`], uses: presentKeys(c) };
    },
  },
  {
    id: "W5", area: "wealth", kind: "structure", name: "길은 있고 모으는 틀이 약한 구조",
    question: "나는 돈을 잘 벌어도 왜 남기기 어려울까요? 모으는 기준은 어떻게 잡을까요?",
    tradition: "식상이 많고 재성이 적으며 비겁이 함께 있으면, 벌 길은 찾지만 나가는 몫(비겁)과 쓰는 힘(식상)이 커서 남기는 쪽 힘이 상대적으로 적게 읽히는 해석이 있습니다.",
    meaning: ["벌 길은 찾음", "쓰임과 나눔이 큼", "모으는 기준이 필요한 구조"],
    faces: {
      bright: ["아이디어 · 재능으로 벌 방법을 계속 찾는 힘", "쓰임이 많아 활동 폭이 넓음"],
      hard: ["들어온 돈이 쓰임 · 나눔으로 빠지기 쉬움", "모으는 기준을 따로 세워야 안정됨"],
    },
    pastScenes: ["벌 방법은 늘었는데 남는 게 적다고 느낀 시기", "관계와 활동에 쓰임이 컸던 시기"],
    present: ["벌 궁리와 쓰는 즐거움이 함께 있는 모습"],
    future: ["재성이 들어오는 시기에 모으는 틀을 만들기 좋은 흐름"],
    hooks: [
      { axis: "novelty", side: "high", mode: "match", face: "bright", note: "벌 방법을 계속 찾음" },
      { axis: "caution", side: "high", mode: "differ", face: "hard", note: "조심하는데 구조는 새기 쉬움" },
    ],
    needs: [],
    limits: ["재성이 적다는 사실을 돈 관리 능력의 부족으로 번역하지 않는다(식상 · 비겁과 겹친 구조의 해석으로만)", "실제 소비 습관을 말하지 않는다"],
    overlaps: ["W1과 함께 나오지 않는다", "W6과 함께 나올 수 있다(재성이 숨어 있는 경우)"],
    grade: "자체조합",
    gradeNote: "식상 많음 + 재성 적음 + 비겁 있음을 '모으는 틀이 약하다'로 읽는 전통 이름을 확인하지 못했다. 세 조건을 미유가 조합했고, 재성이 적다는 사실을 돈 모으는 힘의 부족으로 읽을 위험이 있어 쓰지 않는다.",
    condition: ["식상 2자리 이상", "재성 1자리 이하", "비겁 2자리 이상"],
    data: ["group-count"],
    check: (c) => {
      if (c.visible.식상 < 2 || c.visible.재성 > 1 || c.visible.비겁 < 2) return null;
      return { facts: [`식상 ${c.visible.식상}자리(2 이상)`, `재성 ${c.visible.재성}자리(1 이하)`, `비겁 ${c.visible.비겁}자리(2 이상)`], uses: presentKeys(c) };
    },
  },
  {
    id: "W6", area: "wealth", kind: "structure", name: "돈의 길이 숨은 구조",
    question: "나의 재물 기회는 언제 드러날까요? 겉으로 안 보이는 돈의 길도 있을까요?",
    tradition: "재성이 지지 속에만 있고 월령을 얻었거나 일간의 뿌리가 있으면, 돈의 길이 겉으로 드러나지 않다가 운에서 재성이 천간으로 드러날 때 눈에 띄는 구조로 봅니다.",
    meaning: ["겉으로 드러나지 않는 실속", "때가 되면 드러남", "받침이 있음"],
    faces: {
      bright: ["겉으로 드러나지 않는 실속", "때가 되면 드러나는 재물의 길"],
      hard: ["기회가 와도 늦게 알아봄", "앞에 나서지 않아 몫을 놓칠 수 있음"],
    },
    pastScenes: ["기회가 지나간 뒤에야 알아본 순간", "조용히 실속을 쌓던 시기"],
    present: ["앞에 나서기보다 실속을 챙기는 모습"],
    future: ["재성이 천간으로 드러나는 시기에 수입 구조가 눈에 띄는 주제"],
    hooks: [{ axis: "caution", side: "high", mode: "match", face: "hard", note: "앞서 나서지 않음" }],
    needs: [],
    limits: ["지지 속 재성은 드러나지 않는다고 읽는 단순화이며 실제 자산을 말하지 않는다", "월령에 기대므로 월주가 절기 경계에서 달라질 수 있으면 근거에서 뺀다"],
    overlaps: ["W5와 함께 나올 수 있다", "W8의 재성 시기와 연결해 한 번만 쓴다"],
    grade: "단순화",
    gradeNote: "재성이 천간에 투출되지 않고 지장간에만 있는 구조를 '때가 되면 드러나는 돈의 길'로 읽는 전통 서술(암장)을 줄였다.",
    condition: ["재성이 천간에 없음", "재성이 지장간에 1곳 이상 있음", "월령을 얻었거나 일간의 뿌리가 있음(둘 중 하나 이상)"],
    data: ["group-count", "month-ling", "roots", "uncertain"],
    check: (c) => {
      if (c.stems.재성 > 0 || c.anywhere.재성 === 0) return null;
      if (!(c.monthGot || c.rootStrong)) return null;
      return { facts: ["재성이 천간에 없음", `재성이 지장간에만 ${c.anywhere.재성}곳`, `받침: 월령 ${c.monthGot ? "얻음" : "못 얻음"} · 뿌리 ${c.rootStrong ? "있음" : "약함"}(하나 이상)`], uses: ["month", ...presentKeys(c)] };
    },
  },
  {
    id: "W7", area: "wealth", kind: "structure", name: "안정 · 보존 지향 구조",
    question: "나는 돈을 지키는 쪽일까요, 움직이는 쪽일까요?",
    tradition: "인성이 많고 재성 · 식상이 적으면 배움 · 안정 · 보호를 먼저 챙기고 돈을 움직이는 데 신중한 구조로 읽습니다.",
    meaning: ["안정 우선", "신중한 움직임", "보호 · 배움"],
    faces: {
      bright: ["지키고 쌓는 안정감", "확실한 것을 고르는 신중함"],
      hard: ["움직일 때를 놓치기 쉬움", "변화에 필요한 결단이 늦어짐"],
    },
    pastScenes: ["안정을 택해 기회를 지나친 순간", "준비와 배움에 오래 투자한 시기"],
    present: ["확신이 설 때까지 기다리는 모습"],
    future: ["재성 · 식상이 들어오는 시기에 움직임이 커지는 주제"],
    hooks: [
      { axis: "caution", side: "high", mode: "match", face: "bright", note: "지키는 쪽" },
      { axis: "novelty", side: "high", mode: "differ", face: "hard", note: "움직이고 싶은 마음" },
    ],
    needs: [],
    limits: ["저축 · 투자 성향을 사실처럼 쓰지 않는다", "투자 · 대출 권유 금지"],
    overlaps: ["W4와 함께 나오지 않는다"],
    grade: "단순화",
    gradeNote: "인성이 많고 재성·식상이 적은 구조를 안정·보존 지향으로 읽는 것은 인성 태과 계열의 서술이다. 세 조건으로 줄였다.",
    condition: ["인성 3자리 이상", "재성 1자리 이하", "식상 1자리 이하"],
    data: ["group-count"],
    check: (c) => {
      if (c.visible.인성 < 3 || c.visible.재성 > 1 || c.visible.식상 > 1) return null;
      return { facts: [`인성 ${c.visible.인성}자리(3 이상)`, `재성 ${c.visible.재성}자리(1 이하)`, `식상 ${c.visible.식상}자리(1 이하)`], uses: presentKeys(c) };
    },
  },
  {
    id: "W8", area: "wealth", kind: "timing", name: "수입 · 일의 환경이 움직이는 시기", minAge: 17,
    question: "돈과 일의 흐름이 바뀌는 시기는 언제일까요? 지나온 일 · 수입의 변화는 어땠을까요?",
    tradition: "대운이나 세운에 재성이 들어오고 그 지지가 월지(일 · 사회 환경 자리)와 합이나 충 · 형을 이루면 수입과 일의 환경이 움직이는 시기로 봅니다. 합은 맺고 자리 잡는 쪽, 충 · 형은 크게 바뀌는 쪽으로 읽습니다.",
    meaning: ["수입 · 일 환경이 움직임", "맺음 또는 전환", "나이대 창"],
    faces: {
      bright: ["수입 · 일의 환경이 자리 잡는 주제", "새 기회와 연결되는 주제"],
      hard: ["수입 · 일의 환경이 크게 바뀌는 주제", "이동 · 전환 · 정리의 주제"],
    },
    pastScenes: ["그 나이대에 일이나 수입의 환경이 바뀌었을 가능성", "일하는 방식이 달라진 시기"],
    present: ["그 시기를 지나며 돈과 일을 보는 기준이 달라진 모습"],
    future: ["앞으로 수입 · 일의 환경이 움직이는 시기", "만든 것을 수입으로 연결하기 좋은 때를 가늠하는 흐름"],
    hooks: [
      { axis: "caution", side: "high", mode: "differ", face: "hard", note: "변화에 신중" },
      { axis: "novelty", side: "high", mode: "match", face: "bright", note: "변화를 반김" },
    ],
    needs: ["luck"],
    limits: ["정확한 연도 · 금액 · 직장 이동 같은 사건을 말하지 않고 나이대 창과 가능성으로만 쓴다", "만 17세 이전 시기는 과거 회고로 쓰지 않는다", "월주가 절기 경계에서 달라질 수 있으면 월지에 기대는 근거를 뺀다"],
    overlaps: ["W1~W7의 구조 이야기를 반복하지 않는다(시기는 시기로)", "과거 회고(6장)와 같은 시기를 두 번 쓰지 않는다"],
    grade: "단순화",
    gradeNote: "운에서 재성이 들어오고 그 지지가 월지(일·사회 환경 자리)와 합·충·형을 이루는 시기를 수입·일 환경이 움직이는 때로 읽는 서술을 한 조건으로 줄였다.",
    condition: ["대운 또는 세운의 천간이나 지지 본기가 재성", "그 지지가 월지와 육합 · 반합 또는 충 · 형을 이룸", "과거 시기는 만 17세 이후만(현재 나이로 자름)", "월지(월주)가 절기 경계로 흔들리면 그 시기를 뺌"],
    data: ["luck-current", "luck-past", "year-current", "year-past", "luck-rel", "luck-god", "month-ling", "uncertain", "age"],
    check: (c) => {
      const tagBase =
        c.visible.비겁 >= 3 ? "원국 비겁이 많음(나눔 · 경쟁 조율)" : c.stems.재성 === 0 ? "원국 재성이 천간에 없음(재성이 드러나는 시기)" : c.visible.식상 >= 1 ? "원국 식상이 있음(만든 것의 수익 연결)" : "원국 재성 위주";
      const angleBase = c.visible.비겁 >= 3 ? "나눔 · 경쟁을 조율하는 주제" : c.stems.재성 === 0 ? "재성이 드러나 눈에 띄는 주제" : c.visible.식상 >= 1 ? "만든 것을 수입으로 잇는 주제" : "수입 구조를 가다듬는 주제";
      const out: FrameInstance[] = [];
      for (const u of [...c.luck, ...c.years]) {
        if (u.position === "past" && u.ageTo < 17) continue;
        if (u.stemGroup !== "재성" && u.branchGroup !== "재성") continue;
        const r = u.rel.month;
        const he = isHe(r), ch = isChungHyung(r);
        if (!he && !ch) continue;
        out.push({
          id: `W8:${u.kind}:${u.label}`, unit: u, ageFrom: Math.max(u.ageFrom, 17), ageTo: u.ageTo, strand: "work", tone: he ? "positive" : "hard",
          angles: [he ? "수입 · 일의 환경이 맺어지고 자리 잡는 주제" : "수입 · 일의 환경이 크게 바뀌는 주제", angleBase],
          why: `${unitName(u)}에 재성이 있고 지지가 월지(일 · 사회 환경 자리)와 ${(r ?? []).join("·")} · ${tagBase}`, uses: ["month"],
        });
      }
      return out.length ? { facts: [`시기 지지 × 월지 관계 + 재성 동시 해당 ${out.length}곳`, tagBase], uses: ["month"], instances: out } : null;
    },
  },
];
