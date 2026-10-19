// 무료 맛보기 대화 — 무료 분석(검사)을 마친 사람에게 "내 이야기를 읽었다"는 경험은 주고, 이어지는 깊은 내용은 리포트(유료)로 이어 주는 대화 모델.
// 운영자 방향(2026-10-15): 겉핥기로만 알려 주되 "오, 맞다" 하고 공감할 요소는 풀어 주고, 중간 내용은 유료 결제로 본다.
//
// 이 파일이 만드는 모델에는 "잠긴 내용"이 들어 있지 않다 — 무료 미리보기(FreePreview, 서버에서 공개할 것만 고른 값)가 이미 공개하는 문장과,
// 사주 계산에서 고른 고정 문구(코드 계산)만 쓴다. 잠긴 자리에는 문장이 아니라 "리포트가 답하는 질문"만 둔다.
// 새 글을 쓰지 않는다(AI 호출 없음). 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다).
import { formatKrw, PERSONAL_REPORT } from "../../config/product.ts";
import type { SajuResult } from "../../saju/engine.ts";
import { periodLine, periodPlain } from "../../saju/interpret/period-plain.ts";
import { softenMonths } from "./hour-text.ts";
import { partnerReading } from "../../saju/interpret/partner.ts";
import { luckTimeline } from "../../saju/interpret/rules.ts";
import { dayMasterShort } from "../../saju/plain.ts";
import { dayKey } from "../../saju/interpret/day-plain.ts";
import type { FreePreview } from "../preview.ts";
import type { TypeTitle } from "../type-title.ts";
import type { TasteReport } from "../taste/types.ts";
import { cardTypeFields, groupsOf, type TalkChat, type TalkModel, type TalkPiece, type TalkTopic } from "./talk.ts";
import { codeTopicsFor } from "./talk-code.ts";

export type FreeTalkInput = {
  name: string;
  preview: FreePreview;
  saju: SajuResult;
  /** 오늘(한국 날짜) */
  today: { year: number; month: number; day: number };
  /** 잠긴 내용으로 이어지는 주소 — 구매 화면 또는(이미 구매했다면) 내 리포트 */
  href: string;
  /** 이미 구매한 회원(리포트를 준비 중이거나 이전 형식) — 버튼이 "내 리포트 보기"가 된다 */
  owned: boolean;
  chat: TalkChat;
  /**
   * 맛보기 리포트(무료 · 한 계정당 1번 · AI가 사주와 응답을 엮어 쓴 글) — 받았다면 "나는 어떤 사람?" · "가까운 관계" · "일과 돈" 풀이가 코드 문장 대신 이 글을 쓴다.
   * 글 자체가 유료 핵심(실제 연애의 진행 · 어울리는 사람 · 시기 · 해 볼 것)을 담지 않도록 검사를 통과한 것뿐이다.
   */
  taste?: TasteReport | null;
  /** 나의 유형(개인 유형 10개 + 혼합 경향) — 호출하는 쪽이 이 사람의 사주 + 응답으로 계산해 넘긴다. 없으면 카드에 유형을 보이지 않는다 */
  typeTitle?: TypeTitle | null;
};

const para = (text: string, label?: string): TalkPiece => ({ kind: "para", text, ...(label ? { label } : {}) });

/** 리포트가 답하는 질문 — 미리보기의 "구매하면 답을 주는 질문"(answers)에서 고른다 (이미 공개된 질문들이다) */
function hooksOf(preview: FreePreview, ids: string[], extra: string[] = []): string[] {
  const byId = new Map(preview.answers.map((a) => [a.id, a.question]));
  return [...ids.map((id) => byId.get(id)).filter((q): q is string => Boolean(q)), ...extra];
}

export function buildFreeTalkModel(input: FreeTalkInput): TalkModel {
  const { preview, saju, today } = input;
  const ok = saju.status === "ok" ? saju : null;
  const dm = ok ? dayMasterShort(ok.dayMaster.stem) : null;
  const dmSentence = dm ? `${dm.image}처럼 ${dm.short} 사람이에요` : null;
  const luck = ok ? luckTimeline(ok, { year: today.year, month: today.month }) : [];
  const current = luck.find((s) => s.role === "current");
  const period = current ? periodPlain(current.stemGroup, current.branchGroup) : null;
  const partner = ok ? partnerReading(ok) : null;
  const insight = preview.lead.kind === "insight" ? preview.lead : null;
  const relationInsight = insight && insight.module === "relationship" ? insight : null;
  const tendencyInsight = insight && insight.module === "temperament" ? insight : null;
  const work = preview.situations[0];
  const sajuRelation = preview.saju.status === "ok" ? preview.saju.relation : null;
  const tasteOf = (id: "self" | "love" | "work") => input.taste?.sections.find((x) => x.id === id) ?? null;
  const tasteSelf = tasteOf("self");
  const tasteLove = tasteOf("love");
  const tasteWork = tasteOf("work");

  const topics: TalkTopic[] = [];

  // ① 나는 어떤 사람? — 응답이 뒷받침하는 문단(있을 때만)과 내가 편한 환경 · 자주 반복되는 반응
  topics.push({
    id: "tendency",
    number: 1,
    chip: "나는 어떤 사람?",
    title: "나는 어떤 사람?",
    headline: tasteSelf ? tasteSelf.title : tendencyInsight ? "이런 순간이 있다면, 맞을 수 있어요" : (dmSentence ?? "내 모습을 가볍게 살펴봤어요"),
    summary: tasteSelf ? [tasteSelf.body] : tendencyInsight ? [tendencyInsight.text] : [dm ? `${dm.image}처럼 ${dm.short} 사람으로 읽혀요.` : "응답으로 읽은 내 모습은 리포트에서 풀어 드려요."],
    example: preview.core.shown.map((r) => para(r.text, r.label)),
    detail: [],
    basis: null,
    ...(tendencyInsight && !tasteSelf ? { caveat: tendencyInsight.basisNote } : {}),
    grounded: Boolean(tasteSelf || tendencyInsight || dmSentence),
    locked: { hooks: [...preview.core.locked.map((c) => c.question), "새로운 일 앞에서 나는 먼저 해 보는 편일까, 따져 보는 편일까?"] },
  });

  // ② 가까운 관계 — 응답(관계 영역)이 뒷받침하면 그 문단 + 사주에서 가장 두드러진 기운의 관계 풀이 한 줄(운영자 2026-10-16: 사주로 읽은 연애 이야기를 조금).
  //    둘 다 없으면 사주로 읽은 편한 분위기. 인연의 경향(분위기)은 "끌리는 사람의 경향" 풀이(코드 계산)가 따로 보여 주므로 여기서는 되풀이하지 않는다.
  const relationLine = sajuRelation ? `${sajuRelation.lead} — ${sajuRelation.text}` : null;
  const loveSummary = [...(relationInsight ? [relationInsight.text] : []), ...(relationLine ? [relationLine] : [])];
  topics.push({
    id: "love",
    number: 2,
    chip: "연애 · 관계",
    title: "가까운 관계",
    headline: tasteLove ? tasteLove.title : relationInsight ? "가까운 관계에서 이런 순간이 있을 수 있어요" : relationLine ? "가까운 관계에서는 이런 모습일 수 있어요" : partner ? "가까운 관계에서는 이런 쪽이 편해요" : "가까운 관계 이야기를 가볍게 살펴봤어요",
    summary: tasteLove ? [tasteLove.body] : loveSummary.length > 0 ? loveSummary : [partner ? partner.mood.line : "가까운 관계는 사주와 응답을 함께 봐야 풀리는 이야기라 리포트에서 이어서 풀어 드려요."],
    example: [],
    detail: [],
    basis: null,
    grounded: Boolean(tasteLove || relationInsight || relationLine || partner),
    locked: { hooks: hooksOf(preview, ["close", "partner", "repeat", "years"]) },
  });

  // ③ 일과 돈 — 첫 상황(일하고 공부할 때)의 잘 쓰일 때 · 힘들 때 라벨과 일상 한 줄
  topics.push({
    id: "work-money",
    number: 3,
    chip: "일 · 돈",
    title: "일과 돈",
    headline: tasteWork ? tasteWork.title : "일할 때는 이런 모습일 수 있어요",
    summary: [tasteWork ? tasteWork.body : work?.strengthLabel && work?.cautionLabel ? "일하고 공부할 때의 내 모습을 짧게 살펴봤어요." : "일하는 방식은 응답에 따라 달라서 리포트에서 풀어 드려요."],
    ...(work?.strengthLabel && work?.cautionLabel ? { traits: [{ name: work.title, shinesShort: work.strengthLabel, burdenShort: work.cautionLabel }] } : {}),
    example: preview.saju.status === "ok" && preview.saju.everyday.shown ? [para(preview.saju.everyday.shown, "내 원국에서 읽히는 한 줄")] : [],
    detail: [],
    basis: null,
    grounded: Boolean(tasteWork || (work?.strengthLabel && work?.cautionLabel) || (preview.saju.status === "ok" && preview.saju.everyday.shown)),
    locked: { hooks: hooksOf(preview, ["work", "stress"], ["돈을 쓰고 모을 때 내가 반복하는 습관은?"]) },
  });

  // ④ 앞으로의 시기 — 지금 지나는 시기의 쉬운 제목과 뜻 (이전 · 다음 시기와 월별 달력은 리포트에서)
  if (period && current) {
    topics.push({
      id: "flow",
      number: 4,
      chip: "앞으로의 시기",
      title: "앞으로의 시기",
      headline: `지금은 ${period.title}로 읽혀요`,
      summary: [period.meaning],
      periodExample: period.example,
      example: [],
      detail: [],
      basis: null,
      grounded: true,
      locked: { hooks: ["다음 시기는 어떤 분위기일까?", ...hooksOf(preview, ["years"]), "움직임이 큰 달은 언제일까?"] },
    });
  }

  // 자유 질문의 AI에게 건네는 "이미 공개된" 사주 · 응답 문구 — 방의 풀이 한 줄만 받으면 선택한 답을 풀어 쓴 답이 되므로 근거 종류별로 함께 준다.
  // 무료 미리보기 · 이 대화가 이미 보여 주는 글뿐이다(잠긴 요약 · 점수 · 상세 · 풀이 본문은 없다). 숫자(개수)는 싣지 않는다.
  const sajuOk = preview.saju.status === "ok" ? preview.saju : null;
  const elementLines = sajuOk
    ? sajuOk.elements.filter((e) => e.level === "many" || e.level === "none").map((e) => `${e.image} 기운이 ${e.level === "many" ? "많은" : "없는"} 구성이에요 — ${e.image} 기운은 ${e.force}이에요`)
    : [];
  const tasteProfile = {
    saju: [dmSentence, sajuOk?.dayMaster.trait, ...elementLines, sajuOk?.everyday.shown, relationLine, partner?.mood.line].filter((t): t is string => Boolean(t)),
    response: [tendencyInsight?.text, relationInsight?.text, ...preview.core.shown.map((r) => `${r.label}: ${r.text}`)].filter((t): t is string => Boolean(t)),
  };

  const priceLabel = `리포트로 이어 보기 · ${formatKrw(PERSONAL_REPORT.priceKrw)}`;
  return {
    name: input.name,
    card: {
      headline: dmSentence ?? (preview.lead.kind === "oneLiner" ? preview.lead.shown : "내 분석을 한 장으로 맛봤어요"),
      ...cardTypeFields(input.typeTitle ?? null),
      strength: { label: "내가 강한 포인트", keyword: work?.strengthLabel || "리포트에서 이어서 볼 수 있어요", note: "" },
      caution: { label: "내가 힘들 수 있는 포인트", keyword: work?.cautionLabel || "리포트에서 이어서 볼 수 있어요", note: "" },
      flow: {
        label: "지금 나의 시기",
        keyword: period ? period.title : "리포트에서 이어서 볼 수 있어요",
        note: "",
        // 출생 시각을 모르면 대운이 바뀌는 달이 달라질 수 있어 연도 무렵으로만 보인다(내부 계산값은 그대로)
        ...(current ? { foot: input.saju.status === "ok" && input.saju.hourPillarOmitted ? softenMonths(periodLine(current.from, current.to)) : periodLine(current.from, current.to) } : {}),
      },
      inputs: ["사주 원국", `성향 응답 ${preview.basis.temperamentItems + preview.basis.relationshipItems + preview.basis.mbtiItems}문항 (개발용 문항)`],
    },
    topics,
    groups: groupsOf(topics),
    codeTopics: codeTopicsFor({ saju, today, calendar: undefined, tier: "free", personality: { strength: work?.strengthLabel || null, caution: work?.cautionLabel || null } }),
    tier: "free",
    tasteProfile,
    buy: { href: input.href, label: input.owned ? "내 리포트 보기" : priceLabel, owned: input.owned },
    dayKey: dayKey(today),
    chat: input.chat,
  };
}
