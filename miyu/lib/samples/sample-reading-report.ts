// 리포트 예시(개인 통합 리포트 · 읽기 구조) — 가상 인물 서윤.
// 실제 검사 · 실제 AI 출력이 아니라, 미유가 목표로 하는 리포트 형식을 사람이 쓴 예시다. 운영 데이터와 섞지 않는다.
// 서윤의 원국은 만세력 엔진 계산, 응답은 개발용 예시 문항에 가상으로 답한 값(sample-report.ts)이며, 결론은 그 근거 문구가 말하는 범위 안에서만 썼다.
// 본문에는 사주 용어 · 응답 점수를 쓰지 않고 근거는 접어 둔 "분석 근거"(basis)에 둔다.
// 실제 AI 생성과 같은 기준이다 — 이 예시는 실제 생성기가 쓰는 검사(reading/validate.ts)를 그대로 통과해야 하고(sample-reading-report.test.ts),
// 고정 문구(안내 · 이름표)는 reading/plan.ts의 것을 그대로 쓰며, 생성기가 받는 근거 목록(사주 · 응답 행동 경향 · 입력한 MBTI)에 없는 내용은 쓰지 않았다.
// 기본 화면은 결론 한 줄 + 요약 2문장 + 예시 1개이고, 나머지는 눌러서 보는 "자세한 풀이"에 둔다. 같은 말을 제목 · 요약 · 본문에서 되풀이하지 않는다.
// "지금 지나는 시기" 타임라인은 글로 쓰지 않고 서윤의 사주 계산 결과(luckTimeline)에서 만든다.
import { BLOCK_CAVEAT, CARD_LABEL, comfortNote, FLOW_CAVEAT, RULE_DRAFT_NOTE, SCENARIO_NOTE, SCORE_NOTE, STATISTICS_NOTE } from "../report/reading/plan.ts";
import type { IntegratedReadingReport, ReadingBlockId, ReadingDraftV1 } from "../report/reading/types.ts";
import { luckTimeline } from "../saju/interpret/rules.ts";
import { SAMPLE_CHART } from "./sample-report.ts";

/** 큰 흐름 카드에 쓰는 기준 월 — 이 달에 지나는 구간을 현재로 본다 */
export const TIMELINE_REFERENCE = { year: 2026, month: 10 };

export const sampleReadingReport: IntegratedReadingReport = {
  kind: "integrated-reading",
  source: "sample",
  personName: "서윤",
  headline: "다듬어서 내놓고, 가까운 사이에선 반응을 살피는 편이에요.",
  summary: [
    { kind: "strength", label: CARD_LABEL.strength, keyword: "다듬어서 내놓는 힘", note: "배운 걸 정리해서 말이나 글, 결과물로 내놓을 때 힘이 나요." },
    { kind: "caution", label: CARD_LABEL.caution, keyword: "반응이 궁금해지는 마음", note: "관계가 불확실해 보이면 상대의 반응이 유난히 신경 쓰여요." },
    { kind: "flow", label: CARD_LABEL.flow, keyword: "성과와 표현이 주제인 10년", note: "2024.08부터 2034.07까지, 지금은 그 앞부분을 지나고 있어요." },
  ],
  inputs: [
    { name: "사주", status: "used", note: "만세력 엔진으로 계산한 원국 · 대운 · 세운입니다. 해석 규칙은 전문가 검토 전 초안입니다.", usedIn: ["생각과 행동 방식", "장점과 단점이 될 수 있는 부분", "중요하게 여기는 것", "가까운 관계", "일과 돈", "앞으로의 시기"] },
    { name: "MBTI", status: "used", note: "본인이 입력한 INFJ입니다. 참고값으로만 봤으며 공식 MBTI 검사 결과가 아닙니다.", usedIn: ["생각과 행동 방식"] },
    { name: "기질 · 성격", status: "dev", note: "개발용 예시 문항 응답입니다. 미유의 새 성향 질문은 아직 적용하지 않았습니다.", usedIn: ["생각과 행동 방식", "장점과 단점이 될 수 있는 부분", "중요하게 여기는 것", "가까운 관계", "일과 돈", "앞으로의 시기"] },
    { name: "가까운 관계에서의 반응(애착 경향)", status: "dev", note: "개발용 예시 문항 응답입니다. 미유의 새 성향 질문은 아직 적용하지 않았습니다.", usedIn: ["장점과 단점이 될 수 있는 부분", "중요하게 여기는 것", "가까운 관계", "앞으로의 시기"] },
    { name: "알려 준 고민 · 상황", status: "none", note: "입력하지 않았습니다. 특정 고민 없이 쓴 종합 해석입니다.", usedIn: [] },
    { name: "상대 자료", status: "none", note: "없습니다. 관계 부분은 서윤 님의 사주와 응답만으로 읽었습니다.", usedIn: [] },
    { name: "연구 통계", status: "none", note: "사용하지 않았습니다.", usedIn: [] },
  ],
  blocks: [
    {
      id: "tendency",
      group: "me",
      topic: "생각과 행동 방식",
      headline: "알아보고, 다듬고, 그다음에 움직여요",
      summary: "새로운 일 앞에서는 바로 뛰어들기보다, 위험은 없는지 변수는 뭔지 먼저 살펴보는 편이에요. 충분히 알아본 다음에 움직이고, 익숙한 방식이 편한 편이에요.",
      example: "새 앱을 하나 깔 때도 후기부터 읽어 본 적 있죠? 사용법까지 훑어본 다음에 설치하고, 한번 익숙해지면 그 방식을 오래 쓰게 될 수 있어요.",
      details: [
        "사주에서는 한곳에 오래 집중하는 힘도 같이 읽어요. 그래서 하나를 깊이 다듬는 일에서 이 힘이 드러날 수 있어요.",
        "입력하신 MBTI는 INFJ예요. 직접 넣은 참고값이라서, 위 이야기는 사주와 이번 응답을 중심으로 읽었어요. MBTI랑 맞는 부분과 다른 부분은 직접 떠올려 보면서 확인해 보세요.",
      ],
      watch: "‘나는 원래 신중한 사람’이라고 딱 정해 두기보다 이렇게 적어 보세요. 어떤 일에서는 오래 알아보고, 어떤 일에서는 바로 시작하는지요.",
      basis: {
        computed: [
          "일간(日干, 태어난 날의 위 글자이며 ‘나 자신’을 나타냅니다) 정화(丁火), 음의 화",
          "인성(印星, 나를 돕는 기운) 3자리 — 정인(正印, 차근차근 배우고 이해한 뒤에 움직이는 힘) 3개",
          "원국(사주 여덟 글자) 중 토(土, 흙) 3개, 목(木, 나무) 3개",
        ],
        tradition: [
          "일간 정화는 등불 · 촛불에 비유해 한곳을 오래 비추는 집중력과 섬세한 온기로 봅니다.",
          "인성이 많으면 충분히 생각한 뒤 움직이는 편으로 봅니다.",
          "토 기운은 안정 · 중재 · 지키려는 힘으로 봅니다.",
        ],
        answers: [
          "새로움 추구: 익숙하고 예측 가능한 방식을 선호하는 쪽 (34)",
          "신중함: 시작 전에 위험과 변수를 먼저 살피는 쪽 (71)",
          "MBTI: 본인이 입력한 INFJ (자기 인식 참고값)",
          SCORE_NOTE,
        ],
        unknown: [
          "미유의 새 성향 질문은 적용하지 않았습니다.",
          "MBTI는 본인이 입력한 값이며 참고로만 봤습니다. 공식 MBTI 검사 결과가 아닙니다.",
          RULE_DRAFT_NOTE,
        ],
      },
      evidence: ["saju.daymaster", "saju.tengod.인성.many", "saju.element.토.many", "survey.novelty.low", "survey.caution.high", "self.mbti"],
    },
    {
      id: "strength-burden",
      group: "me",
      topic: "장점과 단점이 될 수 있는 부분",
      headline: "같은 모습이 힘이 될 때도, 버거울 때도 있어요",
      summary: "서윤 님의 특징 세 가지를 장점과 단점이 될 수 있는 부분으로 나눠 봤어요. 단점이 될 수 있다는 건 특징이 나쁘다는 뜻이 아니라, 환경과 조건이 안 맞을 때 생기는 일이에요.",
      traits: [
        {
          name: "꼼꼼하게 다듬기",
          shinesShort: "마무리가 중요한 일",
          burdenShort: "빨리 시작해야 하는 일",
          shines: "발표 자료나 글처럼 마무리가 중요한 일에서는 이 꼼꼼함이 큰 힘이 될 수 있어요.",
          burden: "기한이 짧을 때나 일단 내놓고 고쳐 가야 하는 일에서는 시작이 늦어질 수 있어요.",
          example: "발표 자료를 거의 다 될 때까지 혼자 다듬다가, 정작 의견 들을 시간이 모자라질 수 있어요.",
        },
        {
          name: "상대 반응 살피기",
          shinesShort: "분위기를 읽을 때",
          burdenShort: "반응이 흐릿할 때",
          shines: "상대의 입장이나 분위기를 세심하게 살피는 데 도움이 될 수 있어요.",
          burden: "상대 반응이 분명하지 않을 때는 확인하고 싶은 마음이 커져서 신경이 쓰일 수 있어요.",
          example: "상대의 답이 평소보다 늦으면 걱정이 앞서서, 먼저 여러 번 연락하게 될 수도 있어요.",
        },
        {
          name: "가까운 사람에게 기대기",
          shinesShort: "도움을 주고받을 때",
          burdenShort: "서로 필요한 거리가 다를 때",
          shines: "마음을 열고 도움을 청할 수 있어서 관계가 가까워지기 쉬울 수 있어요.",
          burden: "상대가 혼자만의 시간이 필요한 사람이면 같은 행동을 서로 다르게 받아들일 수 있어요.",
          example: "마음이 지친 날 먼저 이야기를 꺼내 기대고 싶은데, 상대는 그날 혼자 쉬고 싶은 날일 수 있어요.",
        },
      ],
      details: [],
      watch: "특징을 없애려 하기보다 ‘어떤 조건에서 버거워지는지’를 알아 두는 게 도움이 돼요.",
      caveat: BLOCK_CAVEAT["strength-burden"]!("서윤"),
      basis: {
        computed: ["식상(食傷, 내가 만들어 내는 기운) 3자리 — 상관(傷官) 3개", "인성 3자리"],
        tradition: [
          "상관은 기존 틀을 그대로 따르기보다 고치려 하고 생각을 말로 꺼내는 힘으로 봅니다. 인성이 이를 다듬는 구조는 말과 글 · 전문성을 다루는 일과 연결해 읽습니다.",
        ],
        answers: [
          "신중함, 새로움 추구: 위와 같습니다 (71, 34)",
          "타인 반응 민감도: 다른 사람의 반응과 인정에 크게 영향을 받는 쪽 (66)",
          "관계 불안: 관계가 불확실하면 상대의 반응을 확인하고 싶어지는 쪽 (72)",
          "거리 두기: 가까워지고 기대는 것이 비교적 편한 쪽 (28)",
          SCORE_NOTE,
        ],
        unknown: [
          "상대가 실제로 어떻게 느끼는지는 상대의 응답이 없어 알 수 없습니다.",
          "실제 업무 · 관계 환경에 따라 같은 특징이 다르게 나타날 수 있습니다.",
        ],
      },
      evidence: ["saju.tengod.식상.many", "saju.tengod.인성.many", "saju.combo.sanggwan-paein", "survey.caution.high", "survey.novelty.low", "survey.sensitivity.high", "survey.anxiety.high", "survey.avoidance.low"],
    },
    {
      id: "values",
      group: "me",
      topic: "중요하게 여기는 것",
      headline: "잘 다듬어졌는지, 마음이 확인되는지가 중요해요",
      summary: "중요하게 여기는 건 두 가지로 읽혀요. 내놓는 결과가 충분히 다듬어졌는지, 그리고 가까운 사람과 서로 마음이 확인되는지예요.",
      example: "이직이나 이사처럼 큰 결정을 앞두면, 정보를 충분히 모은 다음에 움직일 수 있어요. 정한 뒤에는 가까운 사람에게 이유를 말하고 반응을 들어 보고 싶어질 수 있어요.",
      details: [
        "그런데 이 두 가지는 서로 부딪힐 수 있어요. 다른 사람의 반응이 의욕에 영향을 주는 편인데, 충분히 다듬은 다음에야 내놓는 편이기도 해서 반응을 받는 시점이 늦어질 수 있어요.",
        "그래서 큰 선택 앞에서는 ‘어느 쪽이 더 좋아 보이는가’보다 다른 두 가지를 기준으로 살펴볼 만해요. 하나는 ‘충분히 알아봤는가’, 다른 하나는 ‘고른 뒤에 서로 확인할 수 있는 구조가 있는가’예요. 이 기준이 정말 내 것인지는 최근에 한 선택을 떠올리면서 확인해 볼 수 있어요.",
      ],
      watch: "중간 단계의 결과를 믿는 사람 한 명에게 먼저 보여 주세요. 어떤 반응이 오는지 보면, ‘잘 다듬기’와 ‘반응 받기’ 두 마음을 같이 챙길 수 있어요.",
      caveat: BLOCK_CAVEAT.values!("서윤"),
      basis: {
        computed: ["인성 3자리, 식상 3자리, 배우자 자리(일지) 편재: 위에서 설명한 결과와 같습니다."],
        tradition: [
          "상관과 인성이 함께 있으면 표현을 검토가 다듬는 구조로 봅니다.",
          "일지가 편재이면 가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 자리로 봅니다.",
        ],
        answers: ["타인 반응 민감도, 신중함, 관계 불안: 위와 같습니다 (66, 71, 72)", SCORE_NOTE],
        unknown: [
          "본인이 실제로 중요하게 여기는 것과 다를 수 있습니다.",
          "가치관을 직접 묻는 문항은 이번 응답에 없습니다.",
        ],
      },
      evidence: ["saju.tengod.인성.many", "saju.tengod.식상.many", "saju.combo.sanggwan-paein", "saju.spouse-palace", "survey.sensitivity.high", "survey.caution.high", "survey.anxiety.high"],
    },
    {
      id: "love",
      group: "relation",
      topic: "가까운 관계",
      headline: "기대는 건 편한데, 확인하고 싶어져요",
      summary: "가까운 사람에게 마음을 보이고 기대는 건 편한 편이에요. 관계가 불확실해 보이면 상대의 반응이 궁금해지고, 그 반응이 내 마음에도 영향을 주는 편이에요.",
      reactionFlow: {
        when: "상대의 답이 평소보다 늦어질 때",
        steps: [
          { label: "상황", text: "답이 평소보다 늦어져요" },
          { label: "마음", text: "이유를 여러 가지로 떠올려요" },
          { label: "행동", text: "추측이 늘거나 연락이 잦아질 수 있어요" },
          { label: "도움이 되는 것", text: "상대의 한마디, 또는 내가 한 가지만 묻기" },
        ],
        helpful: "상대가 ‘오늘은 늦게 답할 것 같아’ 한마디만 해 둬도 마음이 훨씬 편해질 수 있어요. 서윤 님이 확인하고 싶은 걸 한 가지만 짧게 물어보는 것도 방법이에요.",
      },
      comfort: {
        comfortable: ["연락과 약속의 흐름이 비교적 예측 가능한 사람", "마음이 어떤지 말로 알려 주는 사람", "일정이 바뀔 때 미리 알려 주는 사람"],
        clash: ["이유를 말하지 않고 답이 오래 걸리는 방식", "계획이 자주 바뀌는데 설명이 없는 방식", "마음을 가늠하기 어려운 모호한 표현이 이어지는 관계"],
        note: comfortNote("서윤"),
      },
      details: [
        "사주에서는 가까운 관계를 보는 자리에 ‘관계를 현실적으로 꾸려 가려는 기대’가 큰 것으로 읽혀요. 응답과 겹쳐 보면 이런 모습이 가능해요. 말로 하는 애정 표현뿐 아니라 연락 주기나 약속 같은 구체적인 모습으로도 관계를 확인하고 싶어 할 수 있어요.",
        "다만 상대가 일부러 거리를 두는 건지는 알 수 없어요. 바쁘거나 혼자 정리할 시간이 필요한 걸 수도 있어요.",
      ],
      watch: "확인하고 싶은 마음이 들 때는 추측을 늘리기보다 한 가지를 짧게 묻는 쪽이 도움이 될 수 있어요. 상대가 실제로 어떻게 느끼는지는 직접 물어봐야 알 수 있어요.",
      caveat: BLOCK_CAVEAT.love!("서윤"),
      basis: {
        computed: [
          "배우자 자리(일지 日支, 태어난 날의 아래 글자) 유(酉) — 편재",
          "배우자 별(여성 원국에서는 관성 官星, 규칙 · 책임 · 평판의 기운) 0자리",
        ],
        tradition: [
          "일지가 편재이면 가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 자리로 봅니다.",
          "배우자 별의 개수만으로 관계의 좋고 나쁨이나 시기를 단정하지 않습니다.",
        ],
        answers: [
          "관계 불안: 관계가 불확실하면 상대의 반응을 확인하고 싶어지는 쪽 (72)",
          "거리 두기: 가까워지고 기대는 것이 비교적 편한 쪽 (28)",
          "타인 반응 민감도: 위와 같습니다 (66)",
          SCORE_NOTE,
        ],
        unknown: [
          "상대의 성향 · 평소 행동 · 마음은 알 수 없습니다.",
          "‘연락 주기나 약속으로 확인하고 싶어 할 수 있다’는 부분은 사주와 응답을 겹쳐 읽은 추정입니다. 실제 관계 경험과 다를 수 있습니다.",
        ],
      },
      evidence: ["saju.spouse-palace", "saju.spouse-star", "survey.anxiety.high", "survey.avoidance.low", "survey.sensitivity.high"],
    },
    {
      id: "work-money",
      group: "work",
      topic: "일과 돈",
      headline: "다듬어서 내놓는 일에서 힘이 나요",
      summary: "배운 걸 정리해서 결과물로 내놓는 일에서 힘이 나요. 다른 사람의 반응이 의욕에 영향을 주는 편이라서, 결과를 보여 주고 반응을 받을 자리가 있으면 더 힘이 날 수 있어요.",
      example: "새 프로젝트를 맡으면, 처음 며칠은 자료를 읽고 정리하느라 조용할 수 있어요. 구조가 잡히면 빠르게 결과물을 내놓을 수 있고요. 그 사이 아무 반응이 없으면 ‘잘하고 있나?’ 싶어질 수 있어요.",
      details: [
        "말과 글, 정리된 자료처럼 ‘배운 걸 다듬어 내놓는’ 일과 이어서 읽어요. 새 일을 맡으면 익숙한 방식이 편하고, 시작하기 전에 위험과 변수를 먼저 살피는 쪽으로 답하셨어요. 반대로 반응이 거의 없는 환경에서는 의욕이 떨어질 수 있어요.",
        "돈에 관해서는 이번에 받은 응답이 없어서, 사주에서 읽는 시기 해석만 참고했어요. 지금 지나는 10년 단위의 시기는 현실적인 성과 · 수입 · 관리가 주제가 되는 시기로 읽혀요. 실제로 수입이 늘거나 준다는 뜻은 아니에요.",
      ],
      watch: "일을 시작할 때 두 가지를 미리 정해 두면 좋아요. ‘어디까지 알아보면 시작할지’와 ‘중간 결과를 누구에게 보여 줄지’예요. 준비가 길어지거나 반응을 기다리는 시간이 줄 수 있어요.",
      caveat: BLOCK_CAVEAT["work-money"]!("서윤"),
      basis: {
        computed: [
          "식상 3자리, 재성(財星, 내가 다스리는 기운) 1자리, 인성 3자리",
          "현재 대운(大運) 신미(辛未) 2024년 8월~2034년 7월 — 천간(위 글자) 편재(偏財, 넓게 움직이며 기회를 잡는 재물 감각), 지지(아래 글자) 식신(食神, 즐기면서 꾸준히 만들어 내는 힘)",
        ],
        tradition: [
          "식상이 재성으로 이어지면 만들어 낸 결과물이 성과 · 수입으로 이어지는 흐름으로 봅니다.",
          "대운의 천간이 재성이면 현실적인 성과 · 수입 · 관리가, 지지가 식상이면 표현 · 생산 · 새로운 시도가 늘어나는 시기로 봅니다.",
        ],
        answers: [
          "새로움 추구, 신중함: 위와 같습니다 (34, 71)",
          "타인 반응 민감도: 다른 사람의 반응과 인정에 크게 영향을 받는 쪽 (66)",
          SCORE_NOTE,
        ],
        unknown: ["돈 · 소비에 대한 응답 자료가 없습니다.", "실제 직업 · 업무 환경 · 수입은 알지 못합니다."],
      },
      evidence: ["saju.combo.sanggwan-paein", "saju.combo.siksang-saengjae", "saju.daeun.current", "survey.novelty.low", "survey.caution.high", "survey.sensitivity.high"],
    },
  ],
  flow: {
    id: "flow",
    topic: "앞으로의 시기",
    headline: "2026~2028년, 내 방식에서 결과물로",
    summary: "2026~2028년은 두 가지 주제가 차례로 두드러지는 시기로 읽혀요. ‘내 방식대로 해 보는 일’과 ‘표현해서 결과물을 내는 일’이에요.",
    caveat: FLOW_CAVEAT,
    cardText: "지금은 현실적인 성과 · 수입 · 관리와, 표현하고 새로 시도하는 일이 주제가 되는 시기 안에 있어요. 결과물을 만드는 일과, 그걸 정리하고 관리하는 일을 같이 챙기면 좋은 시기로 볼 수 있어요.",
    years: [
      { year: "2026", theme: "내 방식을 지키는 일과 함께하는 일의 균형" },
      { year: "2027", theme: "내 방식으로 해 본 걸 결과물로 남기는 해" },
      { year: "2028", theme: "결과물이 성과로 이어지는지 살피는 해" },
    ],
    periods: [
      {
        period: "지금 지나는 시기",
        theme: "현실적인 성과 · 수입 · 관리가 주제로 떠오르고, 표현하고 새로 시도하는 일이 늘어나는 시기로 읽어요.",
        watch: "하고 있는 일 가운데 결과물로 이어지는 것과 정리가 필요한 것을 나눠 살펴볼 수 있어요.",
      },
      {
        period: "2026년",
        theme: "자기 주도 · 독립 · 경쟁과 협업이 두드러지는 해로 읽어요. 사주에 이 기운이 없어서 평소보다 크게 느껴질 수 있다고 봐요.",
        watch: "누구와 함께하고 어디까지 내 방식을 지킬지 생각할 일이 생길 수 있어요.",
      },
      {
        period: "2027년",
        theme: "자기 주도 주제가 이어지면서 표현 · 생산 · 새로운 시도가 늘어나는 해로 읽어요.",
        watch: "내 방식으로 해 본 걸 결과물로 남기는 데 힘이 실릴 수 있어요.",
      },
      {
        period: "2028년",
        theme: "표현 · 생산 · 새로운 시도와 현실적인 성과 · 수입 · 관리가 함께 주제가 되는 해로 읽어요.",
        watch: "결과물이 성과로 이어지는지 살펴보는 해로 볼 수 있어요.",
      },
    ],
    scenarios: [
      { when: "관계가 불확실해 보일 때 이유를 혼자 추측하며 기다리는 모습이 이어지면", then: "상대는 별일 없다고 느끼는데 서윤 님 혼자 지칠 수 있어요." },
      { when: "확인하고 싶은 것 한 가지를 짧게 묻는 방식으로 바꾸면", then: "추측하는 시간이 줄고, 상대도 어떤 답을 해야 하는지 알기 쉬워질 수 있어요." },
      { when: "충분히 다듬은 뒤에만 결과를 보여 주는 방식이 이어지면", then: "반응을 받는 시점이 늦어져서 방향을 고치기 어려워질 수 있어요. 중간 결과를 먼저 나누면 더 일찍 고칠 수 있어요." },
    ],
    scenarioNote: SCENARIO_NOTE,
    statistics: STATISTICS_NOTE,
    basis: {
      computed: [
        "이전 대운 임신(壬申) 2014년 8월~2024년 7월, 현재 대운 신미(辛未) 2024년 8월~2034년 7월, 다음 대운 경오(庚午) 2034년 8월~2044년 7월 (시작 · 끝은 절기를 기준으로 한 대략적인 시점)",
        "세운(歲運, 해마다의 흐름) 2026년 병오(丙午) — 천간 겁재(劫財, 경쟁심과 밀어붙이는 힘), 지지 비견(比肩, 동료와 자기 기준) / 2027년 정미(丁未) — 천간 비견, 지지 식신 / 2028년 무신(戊申) — 천간 상관, 지지 정재(正財, 꾸준히 모으고 관리하는 재물 감각)",
      ],
      tradition: [
        "대운 · 세운의 천간 · 지지가 어느 기운에 해당하는지로 주제를 읽습니다. 비겁(比劫, 나와 같은 기운)은 자기 주도 · 독립 · 경쟁과 협업, 식상은 표현 · 생산 · 새로운 시도, 재성은 현실적인 성과 · 수입 · 관리, 관성은 책임 · 조직 · 평판, 인성은 배움 · 준비 · 도움 받기로 봅니다.",
        "원국에 없는 기운은 그 기운이 들어오는 시기에 주제가 상대적으로 크게 느껴질 수 있다고 봅니다. 이것은 검증된 사실이 아니라 전통 해석 규칙입니다.",
      ],
      answers: ["관계 불안, 신중함, 타인 반응 민감도: 위와 같습니다 (72, 71, 66)", SCORE_NOTE],
      unknown: [
        "시기 해석은 실제 사건을 알려 주지 않습니다.",
        "대운이 시작되는 시점은 출생 시각 · 지역 보정 기준에 따라 달라질 수 있습니다.",
      ],
    },
    evidence: ["saju.daeun.current", "saju.daeun.next", "saju.seun.2026", "saju.seun.2027", "saju.seun.2028", "saju.tengod.비겁.none", "survey.anxiety.high", "survey.caution.high", "survey.sensitivity.high"],
  },
  timeline: luckTimeline(SAMPLE_CHART, TIMELINE_REFERENCE),
  timelineReference: TIMELINE_REFERENCE,
  actions: [
    { title: "상대의 답이 늦다고 느낀 다음 번에", detail: "떠오른 이유를 세 가지까지 적어 보고, 그중 직접 확인할 수 있는 것 하나를 짧은 문장으로 물어봐요." },
    { title: "일을 시작할 때", detail: "‘어디까지 알아보면 시작할지’를 한 줄로 적고, 중간 결과를 보여 줄 사람을 정해 둬요." },
    { title: "큰 선택을 앞두었을 때", detail: "정보를 얼마나 모았는지, 정한 뒤에 서로 확인할 구조가 있는지를 각각 적어 봐요. 최근에 한 선택에도 같은 질문을 해 보면 이 기준이 맞는지 알 수 있어요." },
    { title: "맞지 않는다고 느낀 부분이 있다면", detail: "그 문장을 표시해 두고, 어떤 상황에서 달랐는지 적어 두세요. 해석을 다시 살펴볼 때 기준이 돼요." },
  ],
};

/**
 * 이 예시를 AI가 돌려주는 초안 형식(ReadingDraftV1)으로 되돌린 것 — 실제 생성기와 같은 형식 검사 · 내용 검사에 넣어 보고(sample-reading-report.test.ts),
 * 가짜 모델이 이 초안을 돌려줬을 때 생성기가 예시와 같은 구조의 리포트를 만드는지 확인하는 데(reading.test.ts) 쓴다. 화면에는 쓰지 않는다.
 * 실천 제안의 근거 ID는 예시 데이터에 따로 없어 공통 근거 둘을 단다.
 */
export function sampleReadingAsDraft(): ReadingDraftV1 {
  const R = sampleReadingReport;
  const refOf = (period: string) => (period === "지금 지나는 시기" ? "current" : period === "다음 시기" ? "next" : `y${period.replace("년", "")}`);
  const common = ["saju.spouse-palace", "survey.anxiety.high"];
  return {
    headline: R.headline,
    cards: {
      strength: { keyword: R.summary[0].keyword, note: R.summary[0].note },
      caution: { keyword: R.summary[1].keyword, note: R.summary[1].note },
      flow: { keyword: R.summary[2].keyword },
    },
    blocks: R.blocks.map((b) => ({
      id: b.id as ReadingBlockId,
      headline: b.headline,
      summary: b.summary,
      ...(b.example ? { example: b.example } : {}),
      details: b.details,
      watch: b.watch ?? "",
      ...(b.traits ? { traits: b.traits } : {}),
      ...(b.comfort ? { comfort: { comfortable: b.comfort.comfortable, clash: b.comfort.clash } } : {}),
      ...(b.reactionFlow ? { reactionFlow: b.reactionFlow } : {}),
      evidence: b.evidence,
    })),
    flow: {
      headline: R.flow.headline,
      summary: R.flow.summary,
      cardText: R.flow.cardText,
      years: R.flow.years,
      periods: R.flow.periods.map((p) => ({ ref: refOf(p.period), theme: p.theme, watch: p.watch })),
      scenarios: R.flow.scenarios,
      evidence: R.flow.evidence,
    },
    actions: R.actions.map((a) => ({ title: a.title, detail: a.detail, evidence: common })),
  };
}
