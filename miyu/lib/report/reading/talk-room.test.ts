import assert from "node:assert/strict";
import test from "node:test";
import { QUESTION_PACK_PRICE_KRW, REPORT_BASIS } from "../../config/product.ts";
import { SAMPLE_CHART } from "../../samples/sample-report.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { dayReading } from "../../saju/interpret/day-plain.ts";
import { askFor, buildTalkModel, QUESTION_MAX, TALK_COPY, type TalkChat, type TalkModel } from "./talk.ts";
import {
  applyAction,
  availableRooms,
  parseRoomSave,
  replayRoom,
  replyOptions,
  roomAvailable,
  roomSaveKey,
  roomTopics,
  ROOM_COPY,
  ROOM_ORDER,
  ROOM_SAVE_VERSION,
  ROOMS,
  startRoom,
  TALK_MOODS,
  type RoomAction,
  type RoomId,
  type TalkLine,
} from "./talk-room.ts";

const R = sampleReadingReport;
const TODAY = { year: 2026, month: 10, day: 15 };
const model = (chat: TalkChat = { state: "pending" }): TalkModel => buildTalkModel(R, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: TODAY, chat });
const miyuText = (lines: TalkLine[]) => lines.flatMap((l) => (l.from === "miyu" && l.say.kind === "text" ? [l.say.text] : []));
const kinds = (lines: TalkLine[]) => lines.map((l) => (l.from === "miyu" ? l.say.kind : "me"));

/** 리포트 · 코드가 계산한 풀이 안의 모든 문자열 */
function allStrings(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === "string") out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

const flat = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "function" ? [String((v as (n: string) => string)("서윤"))] : v && typeof v === "object" ? Object.values(v).flatMap(flat) : []);
/** 이 파일의 고정 문구 전부 (방 정의 · 대화 문구) */
const fixedCopy = (): string[] =>
  [
    ...flat(TALK_COPY),
    ...flat(ROOM_COPY),
    ...ROOM_ORDER.flatMap((id) => {
      const r = ROOMS[id];
      return [r.label, r.mode, r.blurb, r.connect ?? "", r.connectNote ?? "", r.greeting("서윤"), ...(r.intake ? [r.intake.question, ...r.intake.options.flatMap((o) => [o.label, o.lead]), ...(r.intake.legacySkip ? [r.intake.legacySkip.label, r.intake.legacySkip.lead] : [])] : [])];
    }),
  ].filter(Boolean);

test("방 정의: 여덟 곳이고 이름은 운영자가 정한 대로이며, 모드 방은 '○○ 상담을 시작할게요'로 들어가고 먼저 묻는 질문이 있다", () => {
  assert.deepEqual([...ROOM_ORDER], ["main", "daily", "year", "love", "marriage", "career", "money", "concern"]);
  assert.deepEqual(
    ROOM_ORDER.map((id) => ROOMS[id].mode),
    ["미유", "원데이 미유", "흐름박사 미유", "연애박사 미유", "결혼박사 미유", "진로박사 미유", "재무박사 미유", "고민해결소 미유"],
  );
  assert.deepEqual(
    ROOM_ORDER.map((id) => ROOMS[id].label),
    ["나를 알아보기", "오늘의 운세", "올해의 흐름", "연애", "결혼", "일 · 진로", "돈 · 재무", "고민 상담"],
  );
  assert.equal(ROOMS.main.connect, null);
  const START_NOTICE: Record<string, string> = { daily: "오늘의 운세를 시작할게요", year: "올해의 흐름 이야기를 시작할게요", love: "연애 상담을 시작할게요", marriage: "결혼 상담을 시작할게요", career: "일 · 진로 상담을 시작할게요", money: "돈 · 재무 상담을 시작할게요", concern: "고민 상담을 시작할게요" };
  for (const id of ROOM_ORDER.filter((r) => r !== "main")) {
    const r = ROOMS[id];
    assert.equal(r.connect, START_NOTICE[id], `${id}: 시작 알림`);
    assert.ok(r.intake && r.intake.options.length >= 3, `${id}: 먼저 묻는 질문`);
    assert.equal(new Set(r.intake!.options.map((o) => o.id)).size, r.intake!.options.length, `${id}: 답 번호가 겹치지 않는다`);
    for (const o of [...r.intake!.options, ...(r.intake!.legacySkip ? [r.intake!.legacySkip] : [])]) assert.ok(TALK_MOODS.includes(o.mood), `${id}/${o.id}: 알 수 없는 표정`);
  }
  assert.deepEqual(ROOMS.love.intake!.options.map((o) => o.label), ["솔로예요", "짝사랑하는 사람이 있어요", "썸 타는 중이에요", "연애 중이에요", "헤어진 지 얼마 안 됐어요", "결혼 준비 중이에요", "결혼했어요"]);
  // 운영자 2026-10-16: "말하고 싶지 않아요" 건너뛰기 버튼은 없다 — 어느 방에서도 이 이름의 답을 고를 수 없고, 답을 꼭 골라야 풀이로 간다
  for (const id of ROOM_ORDER) {
    const labels = ROOMS[id].intake?.options.map((o) => o.label) ?? [];
    assert.ok(!labels.includes("말하고 싶지 않아요"), `${id}: 건너뛰기 버튼이 없다`);
  }
  assert.equal(ROOMS.love.intake!.options.find((o) => o.id === "breakup")!.mood, "worried", "헤어진 직후에는 걱정하는 표정");
  assert.equal(ROOMS.concern.chatOnly, true);
  // 궁합 비교는 아직 없으므로 연애 · 결혼 방은 준비 중이라고 밝힌다
  assert.match(ROOMS.love.connectNote ?? "", /궁합 비교는 준비 중/);
  assert.match(ROOMS.marriage.connectNote ?? "", /궁합 비교는 준비 중/);
});

test("방 열기: 예시 리포트는 여덟 방이 모두 열리고, 풀이 자료가 없으면 그 방이 열리지 않는다 (이야기만 하는 방은 늘 열린다)", () => {
  const m = model();
  for (const id of ROOM_ORDER) assert.ok(roomAvailable(m, id), id);
  assert.deepEqual(availableRooms(m), [...ROOM_ORDER]);
  assert.deepEqual(roomTopics(m, "love").map((t) => t.id), ["love", "partner"]);
  assert.deepEqual(roomTopics(m, "marriage").map((t) => t.id), ["marriage", "partner"]);
  assert.deepEqual(roomTopics(m, "career").map((t) => t.id), ["work-money"]);
  assert.deepEqual(roomTopics(m, "money").map((t) => t.id), ["work-money"]);
  assert.deepEqual(roomTopics(m, "year").map((t) => t.id), ["flow"]);
  assert.deepEqual(roomTopics(m, "daily").map((t) => t.id), ["daily"]);
  const noLove: TalkModel = { ...m, topics: m.topics.filter((t) => t.id !== "love") };
  assert.deepEqual(roomTopics(noLove, "love").map((t) => t.id), ["partner"], "리포트 주제가 없어도 계산한 풀이는 열린다");
  // 사주 계산 결과가 없으면 계산한 풀이(오늘의 한 장 · 인연의 경향)가 없어 그 방들은 열리지 않는다
  const noSaju = buildTalkModel(R, { tendencyName: "확인추구형" });
  assert.equal(roomAvailable(noSaju, "daily"), false);
  assert.equal(roomAvailable(noSaju, "marriage"), false);
  assert.equal(roomAvailable(noSaju, "main"), true);
  assert.equal(roomAvailable(noSaju, "concern"), true);
});

test("기본 방: 인사 → 분석 카드 → 주제 질문으로 시작하고, 주제 버튼은 첫 화면에 2×2로 놓을 네 묶음이다", () => {
  const m = model();
  const s = startRoom(m, "main");
  assert.equal(s.phase, "pick");
  assert.deepEqual(kinds(s.lines), ["text", "card", "text"]);
  assert.equal(s.lines[1].from === "miyu" && s.lines[1].mood, "happy", "분석 카드는 웃는 얼굴");
  const r = replyOptions(m, "main", s);
  assert.equal(r.kind, "pick");
  if (r.kind === "pick") assert.deepEqual(r.groups.map((c) => c.label), ["내 성향", "연애 · 관계", "일 · 돈", "앞으로의 시기"]);
});

test("연애 방: 모드 접속 안내 → 인사 → 먼저 묻는 질문으로 시작하고, 상황을 고르면 한 줄 안내 뒤에 풀이가 도착한다 (새 방은 새 대화)", () => {
  const m = model();
  const s = startRoom(m, "love");
  assert.equal(s.phase, "intake");
  assert.deepEqual(kinds(s.lines), ["system", "text", "text"]);
  const sys = s.lines[0];
  assert.ok(sys.from === "miyu" && sys.say.kind === "system" && sys.say.text === "연애 상담을 시작할게요");
  assert.equal(miyuText(s.lines)[0], ROOMS.love.greeting("서윤"));
  assert.equal(miyuText(s.lines)[1], ROOMS.love.intake!.question);
  const r = replyOptions(m, "love", s);
  assert.equal(r.kind, "intake");
  if (r.kind === "intake") assert.equal(r.options.length, 7);

  const a = applyAction(m, "love", s, { t: "intake", option: "breakup" });
  assert.equal(a.state.phase, "chat");
  assert.equal(a.state.intake, "breakup");
  assert.equal(a.state.current, "love");
  assert.ok(a.state.opened.includes("love"));
  assert.deepEqual(a.added[0], { from: "me", text: "헤어진 지 얼마 안 됐어요" });
  const lead = a.added[1];
  assert.ok(lead.from === "miyu" && lead.mood === "worried" && lead.say.kind === "text" && /지금 마음을 돌보는 참고/.test(lead.say.text));
  assert.ok(a.added.some((l) => l.from === "miyu" && l.say.kind === "text" && l.say.muted && l.say.text === ROOM_COPY.intakeNote), "이 답은 풀이를 바꾸지 않는다고 알린다");
  const ans = a.added.find((l) => l.from === "miyu" && l.say.kind === "answer");
  assert.ok(ans && ans.from === "miyu" && ans.say.kind === "answer" && ans.say.number === 4);
  const after = replyOptions(m, "love", a.state);
  assert.equal(after.kind, "chat");
  if (after.kind === "chat") {
    assert.deepEqual(after.feel.map((c) => c.label), ["맞아요", "상황에 따라 달라요", "잘 모르겠어요"]);
    // [분석 이유]는 분석 근거 화면 노출 스위치(REPORT_BASIS)가 켜져 있을 때만 보조 버튼이 된다 — 꺼져 있으면 일상 예시 · 더 자세히 · 달력만
    assert.deepEqual(after.helpers.map((c) => c.key), ["example", "detail", "calendar-love", ...(REPORT_BASIS.visible ? ["basis"] : [])]);
    assert.equal(after.next?.label, "다음 풀이 · 끌리는 사람의 경향", "연애 방의 다음 풀이는 사주로 읽은 인연의 경향");
    assert.equal(after.buy, null, "리포트를 받은 분에게는 구매 버튼이 없다");
  }
  assert.equal(applyAction(m, "love", a.state, { t: "intake", option: "solo" }).added.length, 0);
  assert.equal(applyAction(m, "love", s, { t: "intake", option: "없는답" }).added.length, 0);
  assert.equal(startRoom(m, "career").phase, "intake");
  assert.equal(startRoom(m, "main").lines.length, 3);
});

test("먼저 묻는 질문에는 건너뛰는 버튼이 없다: 답 버튼만 나오고, 답을 고르면 풀이로 간다 — 딱히 없어요 · 잘 모르겠어요 · 그 밖의 고민이에요는 건너뛰기가 아니라 실제 답이다", () => {
  const m = model();
  for (const id of ROOM_ORDER.filter((r) => r !== "main")) {
    const r = replyOptions(m, id, startRoom(m, id));
    assert.ok(r.kind === "intake", `${id}: 먼저 묻는 질문`);
    if (r.kind !== "intake") continue;
    assert.ok(!("skip" in r), `${id}: 건너뛰기 버튼이 없다`);
    assert.equal(r.options.length, ROOMS[id].intake!.options.length, `${id}: 답 버튼 수`);
    assert.ok(!r.options.some((c) => c.label === "말하고 싶지 않아요"), `${id}: 말하고 싶지 않아요 버튼이 없다`);
  }
  // 그 밖의 답은 풀이 앞의 한 줄로 이어 준다
  for (const [id, label] of [["daily", "딱히 없어요"], ["year", "잘 모르겠어요"], ["marriage", "잘 모르겠어요"], ["concern", "그 밖의 고민이에요"]] as const) {
    const opt = ROOMS[id].intake!.options.find((o) => o.label === label);
    assert.ok(opt && opt.id === "skip", `${id}: ${label}`);
    const a = applyAction(m, id, startRoom(m, id), { t: "intake", option: opt.id });
    assert.equal(a.state.intake, "skip");
    assert.ok(miyuText(a.added).some((t) => t === opt.lead));
  }
  // 연애 방은 답을 골라야 풀이가 열린다 (연애 상태를 고른 뒤에야 읽는다)
  const a = applyAction(m, "love", startRoom(m, "love"), { t: "intake", option: "solo" });
  assert.equal(a.state.intake, "solo");
  assert.ok(a.added.some((l) => l.from === "miyu" && l.say.kind === "answer"));
});

test("예전에 저장된 대화는 그대로 되살아난다: 연애 · 진로 · 재무 방에 남은 '말하고 싶지 않아요'(skip) 답은 읽히고 풀이로 이어지지만, 새 대화에서는 고를 수 없다", () => {
  const m = model();
  for (const id of ["love", "career", "money"] as const) {
    const legacy = ROOMS[id].intake!.legacySkip!;
    assert.equal(legacy.label, "말하고 싶지 않아요");
    assert.ok(!ROOMS[id].intake!.options.some((o) => o.id === "skip"), `${id}: 화면 답에는 skip이 없다`);
    const saved = { v: ROOM_SAVE_VERSION, actions: [{ t: "intake", option: "skip" }] };
    const parsed = parseRoomSave(saved, m, id);
    assert.deepEqual(parsed, [{ t: "intake", option: "skip" }], `${id}: 예전 저장본을 읽는다`);
    const state = replayRoom(m, id, parsed);
    assert.equal(state.intake, "skip");
    assert.ok(miyuText(state.lines).some((t) => t === legacy.lead), `${id}: 예전 답의 한 줄이 되살아난다`);
    assert.ok(state.lines.some((l) => l.from === "miyu" && l.say.kind === "answer"), `${id}: 풀이로 이어진다`);
  }
  // 건너뛰기가 없던 방(daily)에서 지어낸 번호는 버린다
  assert.deepEqual(parseRoomSave({ v: ROOM_SAVE_VERSION, actions: [{ t: "intake", option: "nope" }] }, m, "love"), []);
});

test("내 경험 답장: 맞아요는 예시를 보여 주고, 상황에 따라 달라요는 자유 질문 상태에 따라 이어 가거나 준비 중 · 잠금을 밝히고, 어느 답도 풀이에 반영하지 않는다고 알린다", () => {
  const m = model();
  const base = applyAction(m, "love", startRoom(m, "love"), { t: "intake", option: "solo" }).state;
  const yes = applyAction(m, "love", base, { t: "feel", topic: "love", kind: "yes" });
  assert.deepEqual(yes.added[0], { from: "me", text: "맞아요" });
  assert.equal(yes.added[1].from === "miyu" && yes.added[1].mood, "aha");
  assert.ok(yes.added.some((l) => l.from === "miyu" && l.say.kind === "flow"), "연애 풀이의 반응 단계 예시가 이어진다");
  assert.ok(miyuText(yes.added).includes(TALK_COPY.feel.note));
  const afterYes = replyOptions(m, "love", yes.state);
  if (afterYes.kind === "chat") {
    assert.equal(afterYes.feel.length, 0, "한 번 답하면 내 경험 답장은 접힌다");
    assert.ok(!afterYes.helpers.some((c) => c.key === "example"), "예시를 이미 보여 줬다");
  }
  // 준비 중: 고민 기록소로 안내
  const mixed = applyAction(m, "love", base, { t: "feel", topic: "love", kind: "mixed" }, { contextHref: "/results/x/context" });
  assert.ok(mixed.added.some((l) => l.from === "miyu" && l.say.kind === "link" && l.say.href === "/results/x/context" && /준비 중/.test(l.say.text)));
  assert.equal(mixed.state.asking, null);
  // 열림: 어떤 상황에서 달랐는지 묻고, 다음 자유 질문이 이 풀이에 이어진다
  const mr = model({ state: "ready" });
  const baseReady = applyAction(mr, "love", startRoom(mr, "love"), { t: "intake", option: "solo" }).state;
  const open = applyAction(mr, "love", baseReady, { t: "feel", topic: "love", kind: "mixed" });
  assert.ok(miyuText(open.added).includes(ROOM_COPY.mixedAsk));
  assert.deepEqual(open.state.asking, { topic: "love" });
  const ask = replyOptions(mr, "love", open.state);
  assert.ok(ask.kind === "chat" && ask.asking);
  // 잠금(무료 맛보기)
  const ml = model({ state: "locked" });
  const lock = applyAction(ml, "love", applyAction(ml, "love", startRoom(ml, "love"), { t: "intake", option: "solo" }).state, { t: "feel", topic: "love", kind: "mixed" });
  assert.ok(miyuText(lock.added).includes(TALK_COPY.feel.mixed.locked));
  const unsure = applyAction(m, "love", base, { t: "feel", topic: "love", kind: "unsure" });
  assert.ok(miyuText(unsure.added).includes(TALK_COPY.feel.unsure.lead));
  assert.equal(applyAction(m, "love", base, { t: "feel", topic: "없는주제", kind: "yes" }).added.length, 0);
});

test("보조 버튼: 일상 예시 · 더 자세히 · 분석 이유(안경) · 달력(놀람)이 저장된 글로 답하고, 같은 버튼은 한 번만 보인다", () => {
  const m = model();
  let st = applyAction(m, "money", startRoom(m, "money"), { t: "intake", option: "impulse" }).state;
  const r0 = replyOptions(m, "money", st);
  assert.ok(r0.kind === "chat" && r0.helpers.map((c) => c.key).includes("calendar-money") && !r0.helpers.map((c) => c.key).includes("calendar-love"), "돈 방에는 재물 달력만");
  const cal = applyAction(m, "money", st, { t: "extra", topic: "work-money", which: "calendar-money" });
  assert.ok(cal.added.length >= 3 && cal.added.every((l) => l.from === "me" || l.mood === "surprised"));
  st = cal.state;
  const basis = applyAction(m, "money", st, { t: "extra", topic: "work-money", which: "basis" });
  assert.ok(basis.added.some((l) => l.from === "miyu" && l.say.kind === "basis" && l.mood === "glasses"), "분석 이유는 안경을 쓴 표정");
  const r1 = replyOptions(m, "money", cal.state);
  assert.ok(r1.kind === "chat" && !r1.helpers.some((c) => c.key === "calendar-money"), "한 번 연 버튼은 다시 보이지 않는다");
  const career = applyAction(m, "career", startRoom(m, "career"), { t: "intake", option: "way" }).state;
  const rw = replyOptions(m, "career", career);
  assert.ok(rw.kind === "chat" && !rw.helpers.some((c) => c.key.startsWith("calendar")));
});

test("기본 방 흐름: 묶음 고르기 → 풀이 → 다음 풀이로 이어지고, 모두 보면 전체 리포트 버튼이 나온다", () => {
  const m = model();
  let st = startRoom(m, "main");
  const g = applyAction(m, "main", st, { t: "group", id: "me" });
  assert.deepEqual(g.added[0], { from: "me", text: "내 성향" });
  st = g.state;
  assert.equal(st.current, "tendency");
  const r = replyOptions(m, "main", st);
  assert.ok(r.kind === "chat" && r.next && r.next.label.startsWith("다음 풀이 · ") && !r.report);
  for (const t of m.topics) st = applyAction(m, "main", st, { t: "topic", id: t.id }).state;
  const done = replyOptions(m, "main", st);
  assert.ok(done.kind === "chat" && done.report && done.next === null);
  const flow = applyAction(m, "main", startRoom(m, "main"), { t: "topic", id: "flow" }).state;
  const rf = replyOptions(m, "main", flow);
  assert.ok(rf.kind === "chat" && rf.helpers.some((c) => c.key === "calendar-love") && rf.helpers.some((c) => c.key === "calendar-money"));
});

test("오늘의 한 장(원데이 미유): 고른 영역의 한 줄 팁이 풀이 뒤에 붙고 한 번으로 끝나며, 내 경험 답장은 없고 맺음말로 끝난다", () => {
  const m = model();
  const d = dayReading(SAMPLE_CHART, TODAY);
  const s = startRoom(m, "daily");
  assert.equal(s.phase, "intake");
  const a = applyAction(m, "daily", s, { t: "intake", option: "people" });
  const answer = a.added.find((l) => l.from === "miyu" && l.say.kind === "answer");
  assert.ok(answer && answer.from === "miyu" && answer.say.kind === "answer" && answer.say.headline === `오늘은 ${d.title}이에요` && answer.say.number === 0);
  const tip = a.added.find((l) => l.from === "miyu" && l.say.kind === "text" && l.say.label === "사람 · 연애");
  assert.ok(tip && tip.from === "miyu" && tip.say.kind === "text" && tip.say.text === d.tips.people);
  assert.ok(!miyuText(a.added).includes(d.tips.work), "고르지 않은 영역의 팁은 보내지 않는다 (하루 한 번의 무료 한 장)");
  assert.equal(miyuText(a.added).at(-1), "오늘의 무료 운세는 여기까지예요. 내일 새로운 한 장으로 다시 만나요.");
  const r = replyOptions(m, "daily", a.state);
  assert.ok(r.kind === "chat" && r.feel.length === 0 && r.next === null, "내 경험 답장 · 다음 풀이가 없다");
  assert.ok(r.kind === "chat" && r.helpers.map((c) => c.key).join() === (REPORT_BASIS.visible ? "basis" : ""), REPORT_BASIS.visible ? "분석 이유만 열 수 있다" : "분석 근거를 숨기는 동안에는 보조 버튼이 없다");
  // "딱히 없어요"를 고르면 영역 팁 없이 오늘의 분위기만
  const skip = applyAction(m, "daily", s, { t: "intake", option: "skip" });
  assert.ok(!miyuText(skip.added).some((t) => Object.values(d.tips).includes(t)));
  // 이어 보기는 날짜별로 나뉜다 — 내일은 새 한 장
  assert.equal(roomSaveKey(m, "daily"), "daily:2026-10-15");
  assert.equal(roomSaveKey(m, "love"), "love");
});

test("올해의 흐름(흐름박사 미유): 고른 쪽의 월별 달력이 시기 풀이 바로 뒤에 붙고, 전체 분위기를 고르면 달력 없이 풀이만 온다", () => {
  const m = model();
  const money = applyAction(m, "year", startRoom(m, "year"), { t: "intake", option: "money" });
  const texts = miyuText(money.added);
  const flow = m.topics.find((t) => t.id === "flow")!;
  const moneyBubbles = flow.picks!.money.flatMap((b) => (b.kind === "text" ? [b.text] : []));
  assert.ok(moneyBubbles.length >= 2);
  for (const t of moneyBubbles) assert.ok(texts.includes(t), "재물 달력의 말이 풀이 뒤에 온다");
  const love = applyAction(m, "year", startRoom(m, "year"), { t: "intake", option: "love" });
  assert.ok(miyuText(love.added).some((t) => /가까운 관계|인연|성별/.test(t)));
  const all = applyAction(m, "year", startRoom(m, "year"), { t: "intake", option: "all" });
  assert.ok(!moneyBubbles.some((t) => miyuText(all.added).includes(t)));
  const r = replyOptions(m, "year", money.state);
  assert.ok(r.kind === "chat" && r.helpers.map((c) => c.key).includes("calendar-love"));
});

test("결혼박사 미유: 오래 가는 관계 풀이로 시작해 인연의 경향으로 이어지고, 결혼 여부 · 시기를 정하지 않고 궁합 비교는 준비 중이라고 밝힌다", () => {
  const m = model();
  const a = applyAction(m, "marriage", startRoom(m, "marriage"), { t: "intake", option: "thinking" });
  assert.equal(a.state.current, "marriage");
  const text = miyuText(a.added).join("\n");
  assert.match(text, /결혼 여부나 시기를 사주로 정하지/);
  assert.match(text, /궁합은 준비 중이에요/);
  assert.match(text, /100% 정확하거나 검증된 사실이 아니에요/);
  const r = replyOptions(m, "marriage", a.state);
  assert.ok(r.kind === "chat" && r.next?.action.t === "topic" && r.next.action.id === "partner");
  const partner = applyAction(m, "marriage", a.state, { t: "topic", id: "partner" });
  const answer = partner.added.find((l) => l.from === "miyu" && l.say.kind === "answer");
  assert.ok(answer && answer.from === "miyu" && answer.say.kind === "answer" && /에게 마음이 편해지기 쉬워요$/.test(answer.say.headline));
  assert.ok(answer.say.paragraphs.length === 2 && /큰 방향만 본 거예요/.test(answer.say.paragraphs[1]), "나이 차는 큰 방향까지만");
  const detail = applyAction(m, "marriage", partner.state, { t: "extra", topic: "partner", which: "detail" });
  assert.ok(miyuText(detail.added).some((t) => /정확한 나이 · 직업 · 마음, 만나는 날짜는 말하지 않고/.test(t)));
  const months = replyOptions(m, "marriage", partner.state);
  assert.ok(months.kind === "chat" && months.helpers.some((c) => c.key === "calendar-love" && c.label === "연애운이 강해지는 달은?"));
});

test("고민해결소 미유: 먼저 묻는 질문 뒤 자유 질문 상태에 따라 이어 간다 — 준비 중이면 고민 기록소로, 잠겨 있으면 리포트 안내로, 열려 있으면 입력창으로", () => {
  const pend = model({ state: "pending" });
  const a = applyAction(pend, "concern", startRoom(pend, "concern"), { t: "intake", option: "love" }, { contextHref: "/x/context" });
  assert.equal(a.state.phase, "chat");
  assert.ok(a.added.some((l) => l.from === "miyu" && l.say.kind === "link" && l.say.href === "/x/context" && /준비 중/.test(l.say.text)));
  const locked = model({ state: "locked" });
  const b = applyAction(locked, "concern", startRoom(locked, "concern"), { t: "intake", option: "work" });
  const lock = b.added.find((l) => l.from === "miyu" && l.say.kind === "lock");
  assert.ok(lock && lock.from === "miyu" && lock.say.kind === "lock" && lock.say.hooks.length === 3 && lock.say.hooks.every((h) => h.endsWith("?")));
  const rl = replyOptions({ ...locked, tier: "free", buy: { href: "/results/x#r-purchase", label: "리포트로 이어 보기 · 9,900원", owned: false } }, "concern", b.state);
  assert.ok(rl.kind === "chat" && rl.buy?.href === "/results/x#r-purchase", "이야기만 하는 방의 잠금에도 구매로 이어지는 버튼이 있다");
  const ready = model({ state: "ready" });
  const c = applyAction(ready, "concern", startRoom(ready, "concern"), { t: "intake", option: "money" });
  assert.ok(miyuText(c.added).includes(ROOM_COPY.chatReady));
  assert.equal(c.state.current, null);
});

test("자유 질문과 답: 내 질문과 미유의 답이 대화에 놓이고, 이어 가기 상태가 풀리며, 같은 행동 목록에서 같은 대화가 되살아난다", () => {
  const m = model({ state: "ready" });
  const act: RoomAction = { t: "free", q: "요즘 연락이 뜸한 사람이 있어요. 제가 뭘 잘못한 걸까요?", a: ["잘못했다고 정해서 말할 수는 없어요.", "대신 연락이 뜸할 때 내가 어떻게 반응하는지 같이 살펴볼 수 있어요."] };
  let st = applyAction(m, "love", startRoom(m, "love"), { t: "intake", option: "some" }).state;
  st = applyAction(m, "love", st, { t: "feel", topic: "love", kind: "mixed" }).state;
  assert.ok(st.asking);
  const r = applyAction(m, "love", st, act);
  assert.deepEqual(r.added[0], { from: "me", text: act.q });
  assert.deepEqual(miyuText(r.added), act.a);
  assert.equal(r.state.asking, null);
  const actions: RoomAction[] = [{ t: "intake", option: "some" }, { t: "feel", topic: "love", kind: "mixed" }, act];
  assert.deepEqual(replayRoom(m, "love", actions), r.state);
  assert.deepEqual(parseRoomSave(JSON.parse(JSON.stringify({ v: ROOM_SAVE_VERSION, actions })), m, "love"), actions);
  // 빈 질문 · 빈 답은 무시하고, 너무 긴 글은 저장에서 버린다
  assert.equal(applyAction(m, "love", st, { t: "free", q: " ", a: ["x"] }).added.length, 0);
  assert.equal(applyAction(m, "love", st, { t: "free", q: "질문", a: [] }).added.length, 0);
  assert.deepEqual(parseRoomSave({ v: ROOM_SAVE_VERSION, actions: [{ t: "free", q: "가".repeat(QUESTION_MAX.paid + 1), a: ["x"] }, { t: "free", q: "질문", a: ["가".repeat(601)] }] }, m, "love"), []);
});

test("이어 보기: 행동 목록을 처음부터 다시 적용하면 같은 대화가 되살아나고, 저장에는 리포트 글 · 이름이 들어 있지 않다", () => {
  const m = model();
  const actions: RoomAction[] = [{ t: "intake", option: "some" }, { t: "feel", topic: "love", kind: "yes" }, { t: "extra", topic: "love", which: "detail" }, { t: "extra", topic: "love", which: "calendar-love" }, { t: "topic", id: "partner" }];
  let st = startRoom(m, "love");
  for (const a of actions) st = applyAction(m, "love", st, a).state;
  assert.deepEqual(replayRoom(m, "love", actions), st);
  const saved = JSON.stringify({ v: ROOM_SAVE_VERSION, actions });
  assert.ok(saved.length < 400, "행동 목록은 아주 작다");
  assert.ok(!saved.includes(R.headline) && !saved.includes(R.personName), "리포트 글 · 이름이 저장에 없다");
  assert.deepEqual(parseRoomSave(JSON.parse(saved), m, "love"), actions);
  assert.deepEqual(parseRoomSave(null, m, "love"), []);
  assert.deepEqual(parseRoomSave({ v: 1, actions }, m, "love"), [], "옛 저장 형식은 새 대화로 시작한다");
  assert.deepEqual(parseRoomSave({ v: ROOM_SAVE_VERSION, actions: [{ t: "topic", id: "없음" }, { t: "intake", option: "왜" }, { t: "x" }, null, { t: "concern" }] }, m, "love"), []);
  assert.notDeepEqual(replayRoom(m, "career", [{ t: "intake", option: "way" }]).lines, replayRoom(m, "love", actions).lines);
  assert.deepEqual(parseRoomSave({ v: ROOM_SAVE_VERSION, actions: [{ t: "intake", option: "solo" }] }, m, "money"), []);
});

test("미유의 모든 말은 저장된 리포트의 글 · 사주 계산에서 고른 고정 문구 · 이 파일의 고정 문구다 — 새로 쓴 글이 없다 (AI 호출 없음)", () => {
  const states: TalkChat["state"][] = ["pending", "locked", "ready"];
  for (const state of states) {
    const m = model({ state });
    const pool = [...allStrings(R), ...allStrings(m.codeTopics), ...allStrings(m.topics.map((t) => t.picks))].map(norm);
    const fixed = new Set(fixedCopy().map(norm));
    const derived = (t: string) => [...m.topics, ...m.codeTopics].some((x) => (x.periodExample && norm(x.periodExample) === t) || norm(askFor(x.id, m.name)) === t || (x.askText && norm(x.askText) === t));
    for (const room of ROOM_ORDER) {
      const intake = ROOMS[room].intake;
      const script: RoomAction[][] = intake ? [...intake.options, ...(intake.legacySkip ? [intake.legacySkip] : [])].map((o) => [{ t: "intake", option: o.id } as RoomAction]) : [[{ t: "group", id: "me" } as RoomAction], [{ t: "topic", id: "flow" } as RoomAction]];
      for (const actions of script) {
        let st = startRoom(m, room);
        const seen: TalkLine[] = [...st.lines];
        const topic = () => st.current ?? roomTopics(m, room)[0]?.id;
        for (const a of [...actions, ...["yes", "mixed", "unsure"].map((kind) => ({ t: "feel", topic: topic() ?? "tendency", kind }) as RoomAction)]) {
          const r = applyAction(m, room, st, a, { contextHref: "/x" });
          st = r.state;
          seen.push(...r.added);
        }
        for (const l of seen) {
          if (l.from === "me") continue;
          const say = l.say;
          const texts = say.kind === "text" ? [say.text] : say.kind === "link" ? [say.text] : say.kind === "system" ? [say.text, say.sub ?? ""] : say.kind === "answer" ? [say.headline, ...say.paragraphs] : say.kind === "lock" ? [say.title, ...say.hooks] : [];
          for (const raw of texts.filter(Boolean)) {
            const t = norm(raw.replace(/ ?지금은 ‘나의 고민 기록소’에 적어 둘 수 있어요\.$/, ""));
            assert.ok(pool.some((p) => p.includes(t)) || fixed.has(t) || derived(t) || [...fixed].some((f) => norm(raw).startsWith(f) || f.includes(t)) || /^오늘은 .+이에요$/.test(t), `${state}/${room}: 출처를 알 수 없는 말 — ${raw.slice(0, 40)}`);
          }
        }
      }
    }
  }
});

test("고정 문구: 해요체이고, 사건 예언 · 단정 · 점수 · 투자 권유가 없고, 돈 방은 투자 · 대출 결정을 사주로 정하지 않는다고 밝힌다", () => {
  const copy = fixedCopy();
  assert.ok(copy.length > 60);
  const connects = new Set(ROOM_ORDER.map((id) => ROOMS[id].connect).filter(Boolean));
  for (const t of copy) {
    if (!connects.has(t)) assert.doesNotMatch(t, /습니다|합니다|됩니다/, `합쇼체: ${t}`);
    assert.doesNotMatch(t, /반드시|틀림없이|\d+\s*%|\d+점|결혼하게 될|헤어지게 될|만나게 될|생기게 될/, `단정 · 예언: ${t}`);
    assert.doesNotMatch(t, /투자하세요|사세요|주식|코인|대출을 받/, `투자 · 대출 권유: ${t}`);
    assert.doesNotMatch(t, /비겁|식상|재성|관성|인성|대운|세운|십신/, `사주 용어: ${t}`);
  }
  assert.match(ROOMS.money.connectNote ?? "", /투자 · 대출 결정은 사주로 정하지 않아요/);
  assert.match(ROOMS.money.intake!.options.find((o) => o.id === "big")!.lead, /투자나 대출 결정에는 쓰지 말고/);
  assert.match(ROOMS.love.intake!.options.find((o) => o.id === "crush")!.lead, /속마음을 단정하지는 않아요/);
  assert.match(ROOMS.love.intake!.options.find((o) => o.id === "wedding")!.lead, /결혼 여부나 시기를 사주로 정하지 않고/);
  assert.match(ROOMS.love.connectNote ?? "", /보장하는 상담은 아니고/);
  assert.match(ROOMS.concern.connectNote ?? "", /상대의 속마음을 단정하지 않아요/);
  assert.match(ROOMS.year.connectNote ?? "", /예측은 아니에요/);
  assert.match(ROOMS.daily.connectNote ?? "", /무슨 일이 생긴다는 뜻은 아니에요/);
  // 방 이름 목록 자체도 하나씩 열 수 있어야 한다
  const rooms: RoomId[] = [...ROOM_ORDER];
  assert.equal(new Set(rooms).size, 8);
});

test("진로 방과 재무 방: 같은 저장된 일과 돈 풀이에서 보이는 소단락 · 질문 · 안내가 다르고, 저장된 글만 쓴다", () => {
  const m = model();
  const block = R.blocks.find((b) => b.id === "work-money")!;
  assert.equal(block.sections?.length, 3);
  const [s0, s1, s2] = block.sections!;
  const career = roomTopics(m, "career")[0];
  const money = roomTopics(m, "money")[0];
  const texts = (t: typeof career) => t.detail.flatMap((d) => (d.kind === "para" ? [d.text] : []));
  assert.ok(texts(career).includes(s0.body) && texts(career).includes(s2.body) && !texts(career).includes(s1.body), "진로: 일하는 방식 · 일을 고르는 기준");
  assert.ok(texts(money).includes(s0.body) && texts(money).includes(s1.body) && !texts(money).includes(s2.body), "재무: 성과와 수입으로 이어지는 방식 · 시기와 관리 습관");
  assert.equal(career.askText, ROOM_COPY.focus.career.ask);
  assert.equal(money.askText, ROOM_COPY.focus.money.ask);
  assert.notEqual(career.askText, money.askText);
  assert.match(money.caveat ?? "", /투자 · 대출 결정은 사주로 정하지 않아요/);
  // 다른 방(나를 알아보기)의 일과 돈 풀이는 소단락 세 개를 그대로 쓴다
  const main = roomTopics(m, "main").find((t) => t.id === "work-money")!;
  assert.equal(texts(main).filter((t) => [s0.body, s1.body, s2.body].includes(t)).length, 3);
  // 방에 들어가 풀이를 열면 방마다 다른 질문이 이어진다
  const open = (room: "career" | "money") => {
    let st = startRoom(m, room);
    st = applyAction(m, room, st, { t: "intake", option: "unsure" }).state;
    return st;
  };
  assert.ok(miyuText(open("career").lines).includes(ROOM_COPY.focus.career.ask));
  assert.ok(miyuText(open("money").lines).includes(ROOM_COPY.focus.money.ask));
  // 소단락이 없는 이전 리포트에서도 방마다 질문 · 안내는 다르다
  const old = buildTalkModel({ ...R, blocks: R.blocks.map((b) => (b.id === "work-money" ? { ...b, sections: undefined } : b)) }, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: TODAY, chat: { state: "pending" } });
  assert.notEqual(roomTopics(old, "career")[0].askText, roomTopics(old, "money")[0].askText);
});

test("무료 질문을 모두 썼을 때의 안내창 문구: 다 썼다는 것 · 아래 '질문 3개 구매하기' 버튼을 누르면 바로 질문을 적을 수 있다는 것만 알리고(가격 · 글자 수 문장은 이 창에 없다), 해요체, 마감 타이머 · 불안 자극 없음, 값은 상수와 같다", () => {
  const c = TALK_COPY.recharge;
  assert.equal(c["free-used"].title, "무료 질문을 모두 썼어요");
  assert.equal(c["free-used"].body, '이어서 묻고 싶다면 아래 "질문 3개 구매하기" 버튼을 눌러 주세요. 구매하면 바로 질문을 적을 수 있어요.');
  assert.equal(c["paid-used"].body, '더 묻고 싶다면 아래 "질문 3개 구매하기" 버튼을 눌러 주세요. 구매하면 바로 질문을 적을 수 있어요.');
  for (const v of [c["free-used"], c["paid-used"]]) assert.ok(!/\d+원|\d+자|두 배|충전|캐시/.test(v.body), `안내창에는 가격 · 글자 수 · 선불 충전 말이 없다(질문 개수만 알린다): ${v.body}`);
  assert.deepEqual(QUESTION_MAX, { free: 300, paid: 500 });
  assert.equal(QUESTION_PACK_PRICE_KRW, 2500);
  assert.equal(c.payLabel, "구매 버튼으로 가기");
  const texts: string[] = [...[c["free-used"], c["paid-used"], c.deep].flatMap((v) => [v.title, v.body]), c.later, c.payLabel, c.open];
  for (const text of texts) {
    assert.ok(!/마감|서두르|지금\s*아니면|놓치면|곧\s*사라|할인|한정|충전|캐시/.test(text), `불안 · 압박 · 선불 표현 없음: ${text}`);
    assert.ok(!/(합니다|입니다|습니다)[.!]?$/.test(text), `해요체: ${text}`);
  }
  for (const text of [ROOM_COPY.chatTicketLead(2), ROOM_COPY.chatPayLead, ROOM_COPY.chatPayLow, TALK_COPY.freeQuestionTicket(2), TALK_COPY.buyLabel, TALK_COPY.payMoving, TALK_COPY.paySuccess, TALK_COPY.payNotDone, TALK_COPY.payHasTickets]) {
    assert.ok(!/마감|서두르|지금\s*아니면|놓치면|곧\s*사라|할인|한정|충전|캐시/.test(text), `불안 · 압박 · 선불 표현 없음: ${text}`);
    assert.ok(!/(합니다|입니다|습니다)[.!]?$/.test(text), `해요체: ${text}`);
  }
  assert.match(ROOM_COPY.chatPayLead, /"질문 3개 구매하기" 버튼/);
  assert.ok(!/질문을 적고|1회가 사용/.test(ROOM_COPY.chatPayLead), "구매하기 전에 질문을 적게 하지 않는다 — 구매하면 입력창이 열린다");
  assert.equal(TALK_COPY.freeQuestionTicket(2), "결제해 둔 질문 2개가 남아 있어요");
  assert.match(ROOM_COPY.chatTicketLead(1), /결제해 둔 질문이 1개 남아 있어요/);
});

test("질문 구매 버튼(운영자 2026-10-16): 이름은 '질문 3개 구매하기', 가격은 작고 연한 줄에 'VAT 포함'으로, 버튼 아래 설명 줄 · 낱개 결제 · 선불 표현은 없다", () => {
  assert.equal(TALK_COPY.buyLabel, "질문 3개 구매하기");
  assert.equal(TALK_COPY.buyVat(2500), "2,500원 (VAT 포함)");
  assert.equal(TALK_COPY.buyVat(QUESTION_PACK_PRICE_KRW), `${QUESTION_PACK_PRICE_KRW.toLocaleString("ko-KR")}원 (VAT 포함)`);
  // 예전의 설명 줄(구매 후 작성한 질문에 바로 답변 · 남은 회수 · 먼저 질문을 적어 주세요)은 더 이상 없다
  const keys = Object.keys(TALK_COPY);
  for (const gone of ["payButton", "payExplain", "payExplainRest", "freeQuestionPay"]) assert.ok(!keys.includes(gone), `${gone}는 없어졌다`);
  for (const gone of ["chatPayNote", "chatFreeNote"]) assert.ok(!Object.keys(ROOM_COPY).includes(gone), `${gone}는 없어졌다`);
});

test("채팅 하단 안내문(운영자 2026-10-16): 한 줄만 — '답변은 입력해 주신 정보를 기반으로 해석한 내용이에요. 정확한 예측이나 진단은 아니에요.' 가격 · 글자 수 · 남은 횟수 · AI가 쓴 글이라는 긴 설명은 붙이지 않는다", () => {
  assert.equal(ROOM_COPY.chatAiNote, "답변은 입력해 주신 정보를 기반으로 해석한 내용이에요. 정확한 예측이나 진단은 아니에요.");
  assert.ok(!/\d|원|자까지|남았|쓰이지|AI가/.test(ROOM_COPY.chatAiNote), "숫자 · 가격 · 횟수 · 긴 설명이 없다");
  assert.ok(ROOM_COPY.chatAiNote.length < 60, "한 줄이다");
});
