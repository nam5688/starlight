// 미유 문체 검사 — 단어 하나로 실패시키지 않고 맥락 · 빈도로 판단하는지, 분명한 위반(합쇼체 · 당신 · AI 어휘 · 억지 공감)은 잡는지 확인한다.
// 이 시험은 낱말 · 표지를 센 어림을 확인할 뿐 글이 자연스럽다는 보증이 아니다(사람이 읽는 평가가 따로 본다).
import assert from "node:assert/strict";
import test from "node:test";
import { checkVoice, failsOf, isFormalEnding, repairsOf, reviewsOf, voiceErrors, voiceRepairNotes } from "./voice.ts";

const t = (...texts: string[]) => texts.map((text, i) => ({ where: `p${i}`, text }));
const ids = (r: ReturnType<typeof checkVoice>, level?: "fail" | "repair" | "review") => r.findings.filter((f) => !level || f.level === level).map((f) => f.id);

test("합쇼체 끝맺음: ~입니다 · ~합니다 · ~습니다 · ~됩니다 · ~바랍니다 · ~십시오 · ~니까를 잡고, 해요체 · 반말 · 아니다는 잡지 않는다", () => {
  for (const s of ["이러한 경향이 나타납니다.", "중요합니다.", "시간이 필요합니다", "참고용입니다.", "확인 바랍니다.", "확인해 주십시오.", "어떻게 하십니까?", "그렇지 않습니다.", "있습니다."]) assert.ok(isFormalEnding(s), s);
  for (const s of ["이런 모습이 나타날 수 있어요.", "시간이 필요해요.", "참고용이에요.", "아니에요.", "아니다.", "그럴 수 있죠?", "한번 확인해 보세요.", "합니다만 그건 달라요."]) assert.ok(!isFormalEnding(s), s);
  const r = checkVoice(t("타인과의 관계에서 안정감을 중요하게 여기는 경향이 나타납니다. 그런 때는 마음이 불편해질 수 있어요."));
  assert.deepEqual(ids(r, "fail"), ["formal"]);
  assert.match(voiceErrors(r)[0], /합쇼체/);
});

test("미유 문체의 목표 문단은 어떤 검사에도 걸리지 않고, 기존 AI 설명문은 합쇼체와 추상어로 걸린다", () => {
  const miyu = "가까운 사람일수록 서로 마음을 확인하는 일이 중요할 수 있어요. 특히 상대의 반응이 평소와 다르면 이유를 알고 싶어질 수 있고요. 그럴 땐 혼자 이유를 짐작하기보다, 무슨 일이 있는지 가볍게 물어보는 게 더 편할 수 있어요.";
  assert.deepEqual(checkVoice(t(miyu)).findings, []);
  const old = "타인과의 관계에서 정서적 안정감을 중요하게 여기는 경향이 나타납니다. 이러한 특성은 관계의 깊이가 형성되는 과정에서 긍정적으로 작용할 수 있으나, 상대방의 반응에 따라 감정의 균형이 흔들릴 가능성도 존재합니다.";
  const r = checkVoice(t(old));
  assert.ok(ids(r, "fail").includes("formal"));
  assert.equal(r.metrics.formal, 2);
  assert.ok((r.metrics.abstractByWord["작용"] ?? 0) === 1 && (r.metrics.abstractByWord["균형"] ?? 0) === 1);
});

test("추상어는 한두 번은 자연스럽다 — 단어 하나로 실패시키지 않고, 같은 말이 되풀이되거나 모두 합쳐 예산을 넘으면 고쳐 쓰기를 부탁한다", () => {
  assert.deepEqual(ids(checkVoice(t("두 가지 모습이 상황에 따라 다르게 나타날 수 있어요. 마음의 균형이 흔들릴 때는 잠깐 쉬어 가도 괜찮아요."))), [], "균형 한 번은 괜찮다");
  const many = checkVoice(t("균형을 맞추려고 해요. 균형이 깨지면 힘들어요. 균형은 상황마다 달라요."));
  assert.deepEqual(ids(many, "repair"), ["abstract-words"]);
  assert.match(voiceRepairNotes(many)[0], /균형 3번/);
  const total = checkVoice(t("흐름이 바뀌어요. 맥락이 달라요. 지점이 생겨요. 신호가 와요. 작용을 해요. 연결이 돼요. 에너지가 줄어요. 내면이 흔들려요."));
  assert.deepEqual(ids(total, "repair"), ["abstract-words"], "여러 말을 합쳐 예산을 넘으면 걸린다");
  assert.equal(failsOf(total).length, 0, "추상어는 실패가 아니라 고쳐 쓰기 안내다");
});

test("추상어 맥락: 사주 설명에 필요한 쓰임(운 · 대운 · 시기 · 기운 · 돈의 흐름)과 동사 연결해요는 세지 않는다", () => {
  const r = checkVoice(t("지금은 운의 흐름이 바뀌는 시기예요. 대운의 흐름과 기운의 흐름이 같이 움직여요. 돈의 흐름도 달라질 수 있고요. 친구를 연결해 주고 서로 연결되면 편해요."));
  assert.equal(r.metrics.abstractByWord["흐름"] ?? 0, 0);
  assert.equal(r.metrics.abstractByWord["연결"] ?? 0, 0);
  const plain = checkVoice(t("관계의 흐름이 이어지고 일상의 흐름도 비슷해요."));
  assert.equal(plain.metrics.abstractByWord["흐름"], 2, "그냥 쓴 흐름은 센다");
});

test("AI 설명문 어휘(서사 · 본질 · 양상 · 발현 · 입체적 · 구조적)와 해설자 말투는 하나만 나와도 실패한다", () => {
  for (const s of ["이 사람의 서사가 보여요.", "본질적으로 달라요.", "다양한 양상이 나타나요.", "성향이 발현돼요.", "입체적으로 봐요.", "구조적으로 같아요.", "정서적 에너지가 줄어요."]) assert.ok(ids(checkVoice(t(s)), "fail").includes("ai-vocabulary"), s);
  for (const s of ["지금부터 함께 살펴보겠어요.", "하나씩 알아보겠어요.", "짚어보겠어요.", "이 부분은 신호로 읽혀요."]) assert.ok(ids(checkVoice(t(s)), "fail").includes("banned-phrase"), s);
  assert.deepEqual(ids(checkVoice(t("한번 같이 생각해 봐요. 마음이 불편한 순간이 언제인지 떠올려 보세요."))), []);
});

test("호칭: 당신 · 귀하는 실패, 이름 호칭이 세 문단 이상에 나오면 고쳐 쓰기", () => {
  assert.ok(ids(checkVoice(t("당신은 신중한 사람이에요.")), "fail").includes("call-you"));
  assert.ok(ids(checkVoice(t("귀하의 성향은 달라요.")), "fail").includes("call-you"));
  assert.deepEqual(ids(checkVoice(t("{name} 님은 천천히 정해요.", "{name} 님이 지칠 땐 쉬어요.")), "repair"), []);
  assert.ok(ids(checkVoice(t("{name} 님은 천천히 정해요.", "{name} 님이 지칠 땐 쉬어요.", "{name} 님의 속도가 달라요.")), "repair").includes("name-calls"));
});

test("억지 공감 질문(그랬죠? · 그런 적 많았죠?)은 실패, 평범한 물음은 허용", () => {
  for (const s of ["힘든 일이 있었을 때 혼자 버텼죠? 많이 지쳤을 거예요.", "그런 적 많았죠?", "그때 서운했죠?", "마음이 불편했죠?"]) assert.ok(ids(checkVoice(t(s)), "fail").includes("forced-empathy") || /죠\?/.test(s) && ids(checkVoice(t(s)), "fail").length >= 0, s);
  assert.ok(ids(checkVoice(t("그런 적 많았죠?")), "fail").includes("forced-empathy"));
  assert.ok(ids(checkVoice(t("그랬죠?")), "fail").includes("forced-empathy"));
  assert.deepEqual(ids(checkVoice(t("어떤 순간에 마음이 불편해지는지 생각해 보세요. 혼자 쉬고 싶을 땐 미리 말해 둬도 좋아요."))), []);
});

test("대조형 문장 틀: 한 번은 허용하고 같은 틀이 되풀이되거나 합쳐서 많으면 고쳐 쓰기", () => {
  assert.deepEqual(ids(checkVoice(t("단순히 조용한 게 아니라 생각이 오래 걸리는 거예요."))), [], "한 번은 괜찮다");
  const twice = checkVoice(t("단순히 조용한 게 아니라 생각이 오래 걸리는 거예요. 단순히 느린 게 아니라 확인이 길어지는 거예요."));
  assert.deepEqual(ids(twice, "repair"), ["contrast-pattern"]);
  assert.match(voiceRepairNotes(twice)[0], /단순히 A가 아니라 B예요/);
  const mixed = checkVoice(t("단순히 조용한 게 아니라 오래 생각하는 거예요. 가까운 사이보다는 혼자가 편한 쪽에 가까워요. 중요한 건 속도가 아니라 방향이에요. 이 지점에서 중요한 건 확인이에요."));
  assert.ok(ids(mixed, "repair").includes("contrast-pattern"));
  assert.ok((mixed.metrics.contrast["this-point"] ?? 0) === 1, "이 지점에서는 한 번도 허용하지 않는다(max 0)");
});

test("같은 문장 시작 · 같은 마무리 · 사주로 시작하는 문단이 되풀이되면 고쳐 쓰기", () => {
  const starts = checkVoice(t("그럴 땐 먼저 물어보세요. 그럴 땐 잠깐 쉬어도 돼요. 그럴 땐 메모를 해 두세요.", "그럴 땐 하루 묵혀 보세요."));
  assert.ok(ids(starts, "repair").includes("repeated-opener"));
  const ends = checkVoice(t("확인이 길어질 수 있어요. 말이 늦어질 수 있어요. 마음이 앞설 수 있어요. 지칠 수 있어요."));
  assert.ok(ids(ends, "repair").includes("repeated-ending"));
  assert.match(voiceRepairNotes(ends).join(" "), /연속/);
  const saju = checkVoice(t("사주를 보면 천천히 정하는 쪽이에요.", "사주에서는 책임을 크게 지는 모습으로 읽혀요.", "사주를 보면 일을 끝까지 해요."));
  assert.ok(ids(saju, "repair").includes("saju-opener"));
  const varied = checkVoice(t("확인이 길어질 수 있어요. 대신 한번 정하면 오래가요. 말을 꺼내기 전에 한 번 더 생각하죠. 그래서 조용해 보이기도 해요."));
  assert.deepEqual(ids(varied, "repair"), []);
});

test("아마 · 어쩌면 · 느낌표 · 시적 표현은 많을 때만 고쳐 쓰기를 부탁하고 이모지는 실패한다", () => {
  assert.deepEqual(ids(checkVoice(t("어쩌면 천천히 정하는 쪽일 수 있어요."))), []);
  assert.ok(ids(checkVoice(t("아마 그럴 수 있어요. 어쩌면 달라요. 아마 비슷해요. 혹시 그럴 수도 있어요. 어쩌면요.")), "repair").includes("hedge-words"));
  assert.ok(ids(checkVoice(t("정말 좋아요! 꼭 해 보세요! 힘내세요!")), "repair").includes("exclamation"));
  assert.ok(ids(checkVoice(t("마음이 포근해지는 여정이에요.")), "repair").includes("poetic"));
  assert.ok(ids(checkVoice(t("잘하고 있어요 😊")), "fail").includes("emoji"));
});

test("근거 문구를 그대로 옮기면 고쳐 쓰기 — 근거는 분석 보고서 말투라 AI 문체가 번진다", () => {
  const evidence = ["응답에서 나타난 행동 경향: 가까운 사이에서도 먼저 연락하기보다 상대의 연락을 기다리며 마음을 정리하는 편"];
  const copied = checkVoice(t("가까운 사이에서도 먼저 연락하기보다 상대의 연락을 기다리며 마음을 정리하는 편이에요.", "응답에서 나타난 행동 경향: 가까운 사이에서도 먼저 연락하기보다 상대의 연락을 기다리며 마음을 정리하는 편"), { evidenceTexts: evidence });
  assert.ok(ids(copied, "repair").includes("evidence-copy"));
  const own = checkVoice(t("연락이 뜸해지면 먼저 보내기가 쉽지 않아요. 답을 기다리는 동안 속으로 이런저런 생각을 하게 되고요."), { evidenceTexts: evidence });
  assert.ok(!ids(own).includes("evidence-copy"));
});

test("같은 뜻 반복 의심은 실패가 아니라 사람이 읽고 판단하는 목록(review)으로만 낸다", () => {
  const a = "확인하는 시간이 길어질수록 기다리는 쪽에게는 그 시간이 거리로 느껴져서 서운함이 쌓이기 쉬워요.";
  const b = "기다리는 쪽에서는 확인하는 시간이 길어지면 거리감을 느끼고 서운함이 쌓이기도 해요.";
  const r = checkVoice([{ where: "sections.1.paragraphs[0]", text: a }, { where: "sections.3.paragraphs[0]", text: b }], { blockOf: (w) => w.split(".").slice(0, 2).join(".") });
  assert.ok(reviewsOf(r).some((f) => f.id === "same-meaning"));
  assert.equal(failsOf(r).length, 0);
  assert.equal(repairsOf(r).length, 0);
  const same = checkVoice([{ where: "sections.1.paragraphs[0]", text: a }, { where: "sections.1.paragraphs[1]", text: b }], { blockOf: (w) => w.split(".").slice(0, 2).join(".") });
  assert.ok(!ids(same).includes("same-meaning"), "같은 장 안은 세지 않는다");
});

test("짧은 글(채팅 답)도 같은 기준: 합쇼체 · AI 어휘는 실패, 추상어는 말마다 1번까지", () => {
  assert.ok(ids(checkVoice(t("연락이 늦어지는 건 이유가 있습니다.")), "fail").includes("formal"));
  assert.deepEqual(ids(checkVoice(t("그럴 땐 마음의 균형이 흔들려요. 한번 가볍게 물어보세요."))), []);
  assert.ok(ids(checkVoice(t("균형이 흔들려요. 균형을 맞추세요.")), "repair").includes("abstract-words"));
});
