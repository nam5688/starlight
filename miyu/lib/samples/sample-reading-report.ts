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
import { MONTH_RULE_VERSION, monthCalendars } from "../saju/interpret/months.ts";
import { luckTimeline } from "../saju/interpret/rules.ts";
import { SAMPLE_CHART } from "./sample-report.ts";

/** 큰 흐름 카드에 쓰는 기준 월 — 이 달에 지나는 구간을 현재로 본다 */
export const TIMELINE_REFERENCE = { year: 2026, month: 10 };

export const sampleReadingReport: IntegratedReadingReport = {
  kind: "integrated-reading",
  source: "sample",
  personName: "서윤",
  headline: "잘 다듬어서 내놓고, 반응을 기다리는 사람이에요.",
  summary: [
    { kind: "strength", label: CARD_LABEL.strength, keyword: "다듬어서 내놓는 힘", note: "배운 걸 정리해서 말이나 글로 내놓을 때 힘이 나는 편이에요." },
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
      headline: "일단 알아보고, 그다음에 움직여요",
      summary: "새로운 일 앞에서는 바로 뛰어들기보다 위험은 없는지, 변수는 뭔지부터 살펴보는 편이에요. 익숙한 방식이 편한 편이라, 충분히 알아본 다음에 움직이는 쪽이에요.",
      example: "새 앱 하나 깔 때도 후기부터 읽어 본 적 있죠? 사용법까지 훑어본 다음에 설치하고, 한번 손에 익으면 그 방식을 오래 쓰게 될 수 있어요. 그래서 ‘일단 해 보자’보다 ‘이게 어떻게 돌아가는 건데?’를 먼저 듣고 싶을 수 있어요.",
      details: [
        "사주에서는 촛불처럼 한곳을 오래 비추는 집중력을 봐요. 배우고 검토하는 기운도 많아서, 충분히 생각한 뒤 움직이는 쪽으로 같이 읽혀요. 그래서 하나를 정하면 깊이 파고드는 일에서 이 힘이 드러날 수 있어요.",
        "입력하신 MBTI는 INFJ예요. 직접 넣은 참고값이라서, 위 이야기는 사주와 이번 응답을 중심으로 읽었어요. MBTI랑 맞는 부분과 다른 부분은 직접 떠올려 보면서 확인해 보세요.",
        "전통 해석에서는 물처럼 ‘생각을 풀어 주고 쉬어 가게 하는 힘’이 사주 여덟 글자에 없으면, 쉬는 시간을 일부러 만들어 두라고 권하는 경우가 많아요. 없다고 문제가 있다는 뜻은 아니에요. 알아보고 다듬느라 머리가 바쁜 날에는, 아무것도 안 하는 시간을 미리 일정에 넣어 두는 것도 방법이에요.",
      ],
      watch: "‘나는 원래 신중한 사람’이라고 딱 정해 두기보다 이렇게 적어 보세요. 어떤 일에서는 오래 알아보고, 어떤 일에서는 바로 시작하는지 나눠 보는 거예요.",
      basis: {
        computed: [
          "일간(日干, 태어난 날의 위 글자이며 ‘나 자신’을 나타냅니다) 정화(丁火), 음의 화",
          "인성(印星, 나를 돕는 기운) 3자리 — 정인(正印, 차근차근 배우고 이해한 뒤에 움직이는 힘) 3개",
          "원국(사주 여덟 글자) 중 토(土, 흙) 3개, 목(木, 나무) 3개, 수(水, 물) 0개",
        ],
        tradition: [
          "일간 정화는 등불 · 촛불에 비유해 한곳을 오래 비추는 집중력과 섬세한 온기로 봅니다.",
          "인성이 많으면 충분히 생각한 뒤 움직이는 편으로 봅니다.",
          "토 기운은 안정 · 중재 · 지키려는 힘으로 봅니다.",
          "수 기운(생각 · 유연함 · 쉬어 가는 힘)이 원국에 없으면 생활에서 의식적으로 채우는 쪽을 권하는 경우가 많습니다. 없다는 것이 결함이라는 뜻은 아닙니다.",
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
      evidence: ["saju.daymaster", "saju.tengod.인성.many", "saju.element.토.many", "saju.element.수.none", "survey.novelty.low", "survey.caution.high", "self.mbti"],
    },
    {
      id: "strength-burden",
      group: "me",
      topic: "장점과 단점이 될 수 있는 부분",
      headline: "같은 모습이 힘이 될 때도, 버거울 때도 있어요",
      summary: "서윤 님의 특징 세 가지를 장점과 단점이 될 수 있는 부분으로 나눠 봤어요. 같은 특징도 환경과 조건이 맞으면 힘이 되고, 안 맞으면 버거워질 수 있어요.",
      traits: [
        {
          name: "꼼꼼하게 다듬기",
          shinesShort: "마무리가 중요한 일",
          burdenShort: "빨리 시작해야 하는 일",
          shines: "발표 자료나 글처럼 마무리가 중요한 일에서는 이 꼼꼼함이 큰 힘이 될 수 있어요.",
          burden: "기한이 짧거나 일단 내놓고 고쳐 가야 할 때는 시작이 늦어질 수 있어요.",
          example: "발표 자료를 거의 다 될 때까지 혼자 다듬다가, 정작 의견 들을 시간이 모자라질 수 있어요.",
        },
        {
          name: "상대 반응 살피기",
          shinesShort: "분위기를 읽을 때",
          burdenShort: "반응이 흐릿할 때",
          shines: "상대의 입장이나 분위기를 세심하게 살피는 데 도움이 될 수 있어요.",
          burden: "상대 반응이 분명하지 않을 때는 확인하고 싶은 마음이 커져서 신경이 쓰일 수 있어요.",
          example: "단톡방에 올린 내 의견에 아무도 답이 없으면, 말투가 이상했나 싶어서 다시 읽어 볼 수 있어요.",
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
      headline: "잘 다듬었는지, 마음이 닿았는지를 살필 수 있어요",
      summary: "중요하게 여기는 건 두 가지로 읽혀요. 내놓는 결과가 충분히 다듬어졌는지, 그리고 가까운 사람과 서로 마음이 확인되는지예요.",
      example: "이직이나 이사처럼 큰 결정을 할 때는 정보를 충분히 모은 다음에 움직일 수 있어요. 정한 뒤에는 가까운 사람에게 이유를 말하고 반응을 들어 보고 싶어질 수 있어요.",
      details: [
        "그런데 이 두 가지는 서로 부딪힐 수 있어요. 다른 사람의 반응이 의욕에 영향을 주는 편인데, 충분히 다듬은 다음에야 내놓는 편이기도 해서 반응을 받는 시점이 늦어질 수 있어요.",
        "그래서 큰 선택 앞에서는 ‘어느 쪽이 더 좋아 보이는가’보다 다른 두 가지를 기준으로 살펴볼 만해요. 하나는 ‘충분히 알아봤는가’, 다른 하나는 ‘고른 뒤에 서로 확인할 수 있는 구조가 있는가’예요. 이 기준이 정말 내 것인지는 최근에 한 선택을 떠올리면서 확인해 볼 수 있어요.",
      ],
      watch: "큰 선택을 앞두면 ‘지금 어느 마음이 더 큰가’를 한 줄로 적어 보세요. 잘 다듬는 쪽인지, 반응을 받는 쪽인지 알면 선택이 덜 흔들릴 수 있어요.",
      caveat: BLOCK_CAVEAT.values!("서윤"),
      basis: {
        computed: ["인성 3자리, 식상 3자리, 배우자 자리(일지) 편재"],
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
      summary: "가까운 사람에게 마음을 보이고 기대는 건 편한 편이에요. 다만 상대의 반응이 흐릿한 날에는, 그 반응이 내 마음에도 영향을 주는 편이에요.",
      reactionFlow: {
        when: "상대의 답이 평소보다 늦어질 때",
        steps: [
          { label: "상황", text: "답이 평소보다 늦어져요" },
          { label: "마음", text: "이유를 여러 가지로 떠올려요" },
          { label: "행동", text: "추측이 늘거나 연락이 잦아질 수 있어요" },
          { label: "도움이 되는 것", text: "상대의 한마디, 또는 내가 한 가지만 묻기" },
        ],
        helpful: "상대가 ‘오늘은 늦게 답할 것 같아’ 한마디만 해 둬도 마음이 훨씬 편해질 수 있어요. 미리 그렇게 말해 달라고 부탁해 두는 것도 방법이에요.",
      },
      comfort: {
        comfortable: ["연락과 약속이 비교적 예측 가능한 사람", "마음이 어떤지 말로 알려 주는 사람", "일정이 바뀔 때 미리 알려 주는 사람"],
        clash: ["이유를 말하지 않고 답이 오래 걸리는 방식", "계획이 자주 바뀌는데 설명이 없는 방식", "마음을 가늠하기 어려운 모호한 표현이 이어지는 관계"],
        note: comfortNote("서윤"),
      },
      details: [],
      sections: [
        {
          title: "말보다 행동에서 마음을 읽는 편이에요",
          body: "가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 편이라, 다정한 말만큼 연락 주기나 약속 같은 행동이 마음에 오래 남을 수 있어요. 말은 따뜻한데 행동이 따로 놀면 마음이 불편해지고, 말수가 적어도 약속을 꼬박꼬박 지키는 사람이면 믿음이 빨리 쌓일 수 있어요. 다만 이건 사주와 응답을 겹쳐 읽은 추정이라 실제 경험과 다르면 다른 대로 봐 주세요.",
          tryIt: "마음이 움직였던 순간을 떠올려, 말과 행동 중 어느 쪽이 남았는지 한 줄로 적어 보세요.",
        },
        {
          title: "마음이 앞서면 속도부터 늦춰요",
          body: "알아가는 동안에는 상대의 반응이 좋으면 마음이 빨리 열리고, 반응이 흐릿하면 내가 뭘 놓쳤나 되짚느라 생각이 길어질 수 있어요. 반응을 기다리는 동안 궁금한 게 늘어나서 질문이 한꺼번에 몰리기 쉬워요. 사주에는 나와 앞으로의 방향이 서로 끌어당기는 모양도 있어서, 맞춰 가려는 힘이 함께 읽힐 수도 있어요.",
          tryIt: "확인하고 싶은 게 여럿이면 한 가지만 골라 묻고, 나머지는 메모해 두었다가 다음에 물어보세요.",
        },
        {
          title: "서운함은 짧게 말할 때 풀리기 쉬워요",
          body: "서운한 걸 그날 바로 ‘이런 점이 걸렸어’ 하고 한 가지만 말하면, 오해가 커지기 전에 풀릴 수 있어요. 혼자 정리하려고 미루면 확인하고 싶은 마음이 쌓여서 연락이 잦아지거나 말투가 날카로워질 수도 있어요. 상대가 일부러 그랬는지 사정이 있었는지는 알 수 없으니, 그 부분은 직접 묻는 쪽이 정확해요.",
          tryIt: "서운한 날에는 ‘사실 하나와 바라는 것 하나’로 문장을 만들어 말해 보세요. 예를 들어 ‘어제 답이 없어서 걱정됐어, 늦을 땐 한마디만 해 줘’처럼요.",
        },
      ],
      caveat: BLOCK_CAVEAT.love!("서윤"),
      basis: {
        computed: [
          "배우자 자리(일지 日支, 태어난 날의 아래 글자) 유(酉) — 편재",
          "배우자 별(여성 원국에서는 관성 官星, 규칙 · 책임 · 평판의 기운) 0자리",
          "일주(나 자신 · 가까운 관계)와 시주(앞으로의 방향 · 결과)의 유진(酉辰) 육합(六合) (금 기운)",
        ],
        tradition: [
          "일지가 편재이면 가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 자리로 봅니다.",
          "배우자 별의 개수만으로 관계의 좋고 나쁨이나 시기를 단정하지 않습니다.",
          "두 자리가 서로 끌어당기는 관계로, 맞춰 가려는 힘이 생긴다고 봅니다. (약한 근거)",
        ],
        answers: [
          "관계 불안: 관계가 불확실하면 상대의 반응을 확인하고 싶어지는 쪽 (72)",
          "거리 두기: 가까워지고 기대는 것이 비교적 편한 쪽 (28)",
          "타인 반응 민감도: 위와 같습니다 (66)",
          SCORE_NOTE,
        ],
        unknown: [
          "상대의 성향 · 평소 행동 · 마음은 알 수 없습니다.",
          "‘행동에서 마음을 읽을 수 있다’는 부분은 사주와 응답을 겹쳐 읽은 추정입니다. 실제 관계 경험과 다를 수 있습니다.",
        ],
      },
      evidence: ["saju.spouse-palace", "saju.spouse-star", "saju.relation.day-hour.육합", "survey.anxiety.high", "survey.avoidance.low", "survey.sensitivity.high"],
    },
    {
      id: "work-money",
      group: "work",
      topic: "일과 돈",
      headline: "중간에 보여 줄 사람이 있을 때 힘이 나요",
      summary: "혼자 끝까지 다듬는 것보다, 중간에 한 번 보여 주고 반응을 받을 수 있는 환경에서 힘이 나요. 말과 글, 정리된 자료로 내놓는 일과 이어질 수 있어요.",
      example: "새 프로젝트를 맡으면, 처음 며칠은 자료를 읽고 정리하느라 조용할 수 있어요. 구조가 잡힌 뒤에 한번 봐 줄 사람이 있으면 속도가 붙을 수 있고요. 그 사이 아무 반응이 없으면 ‘잘하고 있나?’ 싶어질 수 있어요.",
      details: [
        "회의나 작업 중에 ‘이건 왜 이렇게 하지?’ 싶은 게 눈에 잘 들어오는 편일 수 있어요. 그래도 바로 말하기보다 근거를 모아 정리한 다음에 꺼내는 편일 수 있어요. 이럴 때 ‘이렇게 정리해 봤는데 어때요?’ 하고 묻는 말로 꺼내면, 반응도 받고 부딪힐 일도 줄어들 수 있어요.",
      ],
      sections: [
        {
          title: "내놓은 결과물이 수입으로 이어지는 모양이에요",
          body: "만들어 낸 결과물이 성과나 수입으로 이어지는 모양으로 읽혀요. 정리한 자료나 글처럼 눈에 보이는 결과로 내놓을 때는 그 힘이 드러나기 쉽고, 혼자 쥐고 다듬기만 하면 이어지는 길이 막힐 수 있어요. 다만 수입이 실제로 늘거나 준다는 뜻은 아니에요.",
          tryIt: "다듬고 있는 것 중 하나를 골라, 보여 줄 사람과 보여 줄 모양을 한 줄로 정해 보세요.",
        },
        {
          title: "지금은 성과를 챙기는 시기로 읽혀요",
          body: "지금 시기에는 성과와 수입을 꾸리고 챙기는 일이 주제로 올라오고, 새로운 시도도 함께 늘어나는 때로 봐요. 새로 시도하는 일이 늘어날 때는 들어오는 것과 나가는 것을 눈으로 확인할 수 있게 해 두면 마음이 편해질 수 있어요. 시기를 읽은 것이라 실제로 어떤 일이 생긴다는 뜻은 아니에요.",
          tryIt: "들어온 것과 나간 것을 한 줄씩 적어 두는 자리를 하나 정해 보세요.",
        },
        {
          title: "일을 고를 땐 세 가지를 물어봐요",
          body: "일을 고를 때는 업종 이름보다 ‘순서와 기준이 미리 보이나, 결과가 눈에 보이는 형태로 남나, 막힐 때 물어볼 사람이 있나’를 먼저 따져 보면 좋아요. 익숙하고 예측 가능한 방식이 편한 편이라, 세 가지가 맞으면 낯선 일이어도 힘이 붙을 수 있어요. 반대로 기준이 매번 바뀌고 물어볼 곳도 없다면 지치기 쉬워요.",
          tryIt: "관심 있는 일 하나를 정해, 위 세 질문에 ‘예 · 아니오’로 답을 적어 보세요.",
        },
      ],
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
    summary: "2026~2028년은 주제가 ‘내 방식대로 해 보는 일’에서 ‘표현해서 결과물을 내는 일’로 옮겨 가는 시기로 읽혀요. 일을 정할 때는 ‘어디까지 내 방식으로 할까’를 자주 따져 보게 될 수 있어요.",
    caveat: FLOW_CAVEAT,
    cardText: "지금 지나는 10년 단위의 시기는 현실적인 성과 · 수입 · 관리와, 표현하고 새로 시도하는 일이 주제로 읽혀요. 결과물을 만드는 일과 그걸 정리하고 관리하는 일을 같이 챙기면 좋은 때로 볼 수 있어요.",
    years: [
      { year: "2026", theme: "내 방식을 지키는 일과 함께하는 일의 균형" },
      { year: "2027", theme: "내 방식으로 해 본 걸 결과물로 남기는 해" },
      { year: "2028", theme: "결과물을 성과로 이어 가는 해" },
    ],
    periods: [
      {
        period: "지금 지나는 시기",
        theme: "시기의 앞부분이라, 새로 시도한 것을 결과물로 정리해 두는 일이 주제로 읽혀요.",
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
        watch: "새로 시도한 것 가운데 이어 갈 것과 접을 것을 나눠 볼 만한 해예요.",
      },
      {
        period: "2028년",
        theme: "표현 · 생산 · 새로운 시도와 현실적인 성과 · 수입 · 관리가 함께 주제가 되는 해로 읽어요.",
        watch: "만든 것을 정리하고 관리하는 방식도 같이 살펴볼 수 있어요.",
      },
    ],
    scenarios: [
      { when: "혼자 알아보고 정리하는 시간이 계속 길어지면", then: "시작이 늦어져서, 같이 하는 사람이 기다리다 지칠 수 있어요." },
      { when: "중간 단계에서 믿는 사람에게 먼저 보여 주는 방식으로 바꿔 보면", then: "반응을 일찍 받아서 방향을 고치기 쉽고, 기다리는 마음도 줄어들 수 있어요." },
      { when: "익숙한 방식만 계속 쓰게 되면", then: "더 맞는 방법이 생겨도 알아차리기 늦어질 수 있어요. 작은 일 하나만 새 방식으로 해 봐도 달라질 수 있어요." },
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
      answers: ["관계 불안, 신중함, 타인 반응 민감도, 새로움 추구: 위와 같습니다 (72, 71, 66, 34)", SCORE_NOTE],
      unknown: [
        "시기 해석은 실제 사건을 알려 주지 않습니다.",
        "대운이 시작되는 시점은 출생 시각 · 지역 보정 기준에 따라 달라질 수 있습니다.",
      ],
    },
    evidence: ["saju.daeun.current", "saju.daeun.next", "saju.seun.2026", "saju.seun.2027", "saju.seun.2028", "saju.tengod.비겁.none", "survey.anxiety.high", "survey.caution.high", "survey.sensitivity.high", "survey.novelty.low"],
  },
  timeline: luckTimeline(SAMPLE_CHART, TIMELINE_REFERENCE),
  timelineReference: TIMELINE_REFERENCE,
  calendars: { ruleVersion: MONTH_RULE_VERSION, items: monthCalendars(SAMPLE_CHART, TIMELINE_REFERENCE) },
  actions: [
    { title: "상대의 답이 늦다고 느낀 다음번에", detail: "떠오른 이유를 세 가지까지 적어 보고, 그중 직접 확인할 수 있는 것 하나를 짧은 문장으로 물어봐요." },
    { title: "일을 시작할 때", detail: "‘어디까지 알아보면 시작할지’를 한 줄로 적고, 중간 결과를 보여 줄 사람을 정해 둬요." },
    { title: "큰 선택을 앞두었을 때", detail: "최근에 한 선택 하나를 떠올려, 위의 두 가지 질문에 어떻게 답했을지 적어 봐요. 이 기준이 정말 내 것인지 확인해 볼 수 있어요." },
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
      ...(b.watch ? { watch: b.watch } : {}),
      ...(b.sections ? { sections: b.sections } : {}),
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
