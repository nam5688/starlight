import assert from "node:assert/strict";
import test from "node:test";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { askFor, buildTalkModel, TALK_COPY, type TalkModel } from "./talk.ts";
import {
  applyAction,
  parseRoomSave,
  replayRoom,
  replyOptions,
  roomAvailable,
  roomTopics,
  ROOM_COPY,
  ROOM_ORDER,
  ROOM_SAVE_VERSION,
  ROOMS,
  startRoom,
  TALK_MOODS,
  type RoomAction,
  type TalkLine,
} from "./talk-room.ts";

const R = sampleReadingReport;
const model = (): TalkModel => buildTalkModel(R, { tendencyName: "확인추구형" });
const miyuText = (lines: TalkLine[]) => lines.flatMap((l) => (l.from === "miyu" && l.say.kind === "text" ? [l.say.text] : []));

/** 리포트 안의 모든 문자열 */
function allStrings(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === "string") out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

const flat = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "function" ? [String((v as (n: string) => string)("서윤"))] : v && typeof v === "object" ? Object.values(v).flatMap(flat) : []);
/** 이 파일의 고정 문구 전부 (방 정의 · 대화 문구) */
const fixedCopy = (): string[] => [
  ...flat(TALK_COPY),
  ...flat(ROOM_COPY),
  ...ROOM_ORDER.flatMap((id) => {
    const r = ROOMS[id];
    return [r.label, r.mode, r.blurb, r.connect ?? "", r.connectNote ?? "", r.greeting("서윤"), ...(r.intake ? [r.intake.question, ...r.intake.options.flatMap((o) => [o.label, o.lead]), r.intake.skip.label, r.intake.skip.lead] : [])];
  }),
].filter(Boolean);

test("방 정의: 기본 · 연애 · 일 · 돈 네 곳이고, 모드 방은 '○○ 미유 모드로 접속합니다'로 들어가며 먼저 묻는 질문이 있다", () => {
  assert.deepEqual([...ROOM_ORDER], ["main", "love", "work", "money"]);
  assert.equal(ROOMS.main.connect, null);
  assert.equal(ROOMS.main.mode, "미유");
  assert.equal(ROOMS.love.mode, "연애박사 미유");
  assert.equal(ROOMS.love.connect, "연애박사 미유 모드로 접속합니다");
  for (const id of ["love", "work", "money"] as const) {
    const r = ROOMS[id];
    assert.equal(r.connect, `${r.mode} 모드로 접속합니다`);
    assert.ok(r.intake && r.intake.options.length >= 4, `${id}: 먼저 묻는 질문`);
    assert.equal(new Set(r.intake!.options.map((o) => o.id)).size, r.intake!.options.length, `${id}: 답 번호가 겹치지 않는다`);
    assert.ok(!r.intake!.options.some((o) => o.id === "skip"), "skip은 따로");
    for (const o of [...r.intake!.options, r.intake!.skip]) assert.ok(TALK_MOODS.includes(o.mood), `${id}/${o.id}: 알 수 없는 표정`);
  }
  // 연애 방의 첫 질문 — 운영자가 정한 일곱 가지 상황
  assert.deepEqual(ROOMS.love.intake!.options.map((o) => o.label), ["솔로예요", "짝사랑하는 사람이 있어요", "썸 타는 중이에요", "연애 중이에요", "헤어진 지 얼마 안 됐어요", "결혼 준비 중이에요", "결혼했어요"]);
  assert.equal(ROOMS.love.intake!.skip.label, "말하고 싶지 않아요", "답하지 않을 수 있다");
  assert.equal(ROOMS.love.intake!.options.find((o) => o.id === "breakup")!.mood, "worried", "헤어진 직후에는 걱정하는 표정");
});

test("방 열기: 예시 리포트는 네 방이 모두 열리고, 풀이가 없는 리포트에서는 그 방이 열리지 않는다", () => {
  const m = model();
  for (const id of ROOM_ORDER) assert.ok(roomAvailable(m, id), id);
  assert.deepEqual(roomTopics(m, "love").map((t) => t.id), ["love"]);
  assert.deepEqual(roomTopics(m, "work").map((t) => t.id), ["work-money"]);
  const noLove: TalkModel = { ...m, topics: m.topics.filter((t) => t.id !== "love") };
  assert.equal(roomAvailable(noLove, "love"), false);
  assert.equal(roomAvailable(noLove, "main"), true);
});

test("기본 방: 인사 → 분석 카드 → 주제 질문으로 시작하고, 주제 버튼은 첫 화면에 2×2로 놓을 네 묶음이다", () => {
  const m = model();
  const s = startRoom(m, "main");
  assert.equal(s.phase, "pick");
  assert.deepEqual(s.lines.map((l) => (l.from === "miyu" ? l.say.kind : "me")), ["text", "card", "text"]);
  assert.equal(s.lines[1].from === "miyu" && s.lines[1].mood, "happy", "분석 카드는 웃는 얼굴");
  const r = replyOptions(m, "main", s);
  assert.equal(r.kind, "pick");
  if (r.kind === "pick") assert.deepEqual(r.groups.map((c) => c.label), ["내 성향", "연애 · 관계", "일 · 돈", "앞으로의 시기"]);
});

test("연애 방: 모드 접속 안내 → 인사 → 먼저 묻는 질문으로 시작하고, 상황을 고르면 한 줄 안내 뒤에 풀이가 도착한다 (새 방은 새 대화)", () => {
  const m = model();
  const s = startRoom(m, "love");
  assert.equal(s.phase, "intake");
  assert.deepEqual(s.lines.map((l) => (l.from === "miyu" ? l.say.kind : "me")), ["system", "text", "text"]);
  const sys = s.lines[0];
  assert.ok(sys.from === "miyu" && sys.say.kind === "system" && sys.say.text === "연애박사 미유 모드로 접속합니다");
  assert.equal(miyuText(s.lines)[1], ROOMS.love.intake!.question);
  const r = replyOptions(m, "love", s);
  assert.equal(r.kind, "intake");
  if (r.kind === "intake") assert.equal(r.options.length, 7);

  const a = applyAction(m, "love", s, { t: "intake", option: "breakup" });
  assert.equal(a.state.phase, "chat");
  assert.equal(a.state.intake, "breakup");
  assert.equal(a.state.current, "love");
  assert.ok(a.state.opened.includes("love"));
  assert.equal(a.added[0].from, "me");
  assert.deepEqual(a.added[0], { from: "me", text: "헤어진 지 얼마 안 됐어요" });
  const lead = a.added[1];
  assert.ok(lead.from === "miyu" && lead.mood === "worried" && lead.say.kind === "text" && /지금 마음을 돌보는 참고/.test(lead.say.text));
  assert.ok(a.added.some((l) => l.from === "miyu" && l.say.kind === "text" && l.say.muted && l.say.text === ROOM_COPY.intakeNote), "이 답은 풀이를 바꾸지 않고 이 기기에만 남는다고 알린다");
  const ans = a.added.find((l) => l.from === "miyu" && l.say.kind === "answer");
  assert.ok(ans && ans.from === "miyu" && ans.say.kind === "answer" && ans.say.number === 4);
  // 풀이를 읽은 뒤: 내 경험 답장 3개 + 보조 버튼(연애 방에서는 가까운 관계 달력만, 재물 달력은 없다)
  const after = replyOptions(m, "love", a.state);
  assert.equal(after.kind, "chat");
  if (after.kind === "chat") {
    assert.deepEqual(after.feel.map((c) => c.label), ["맞아요", "상황에 따라 달라요", "잘 모르겠어요"]);
    const helperKeys = after.helpers.map((c) => c.key);
    assert.deepEqual(helperKeys, ["example", "detail", "calendar-love", "basis"]);
    assert.equal(after.next, null, "연애 방에는 다음 풀이가 없다");
  }
  // 같은 질문에 다시 답하거나 모르는 답은 아무것도 바꾸지 않는다
  assert.equal(applyAction(m, "love", a.state, { t: "intake", option: "solo" }).added.length, 0);
  assert.equal(applyAction(m, "love", s, { t: "intake", option: "없는답" }).added.length, 0);
  // 방마다 따로 시작한다
  assert.equal(startRoom(m, "work").phase, "intake");
  assert.equal(startRoom(m, "main").lines.length, 3);
});

test("건너뛰기: 말하고 싶지 않아요를 고르면 괜찮다고 하고 풀이로 간다 (연애 상태를 억지로 묻지 않는다)", () => {
  const m = model();
  const a = applyAction(m, "love", startRoom(m, "love"), { t: "intake", option: "skip" });
  assert.equal(a.state.intake, "skip");
  assert.ok(miyuText(a.added).some((t) => t === ROOMS.love.intake!.skip.lead));
  assert.ok(a.added.some((l) => l.from === "miyu" && l.say.kind === "answer"));
});

test("내 경험 답장: 맞아요는 예시를 보여 주고, 상황에 따라 달라요는 준비 중인 기능을 밝히며 고민 기록소로 안내하고, 어느 답도 풀이에 반영하지 않는다고 알린다", () => {
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
  const mixed = applyAction(m, "love", base, { t: "feel", topic: "love", kind: "mixed" }, { contextHref: "/results/x/context" });
  assert.ok(mixed.added.some((l) => l.from === "miyu" && l.say.kind === "link" && l.say.href === "/results/x/context" && /준비 중/.test(l.say.text)), "준비 중이라고 밝히고 고민 기록소로 안내");
  assert.ok(mixed.added.every((l) => l.from === "me" || l.mood !== "happy"));
  const unsure = applyAction(m, "love", base, { t: "feel", topic: "love", kind: "unsure" });
  assert.ok(miyuText(unsure.added).includes(TALK_COPY.feel.unsure.lead));
  // 답장은 풀이 글을 새로 쓰지 않는다 — 알 수 없는 주제는 무시
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
  // 일 방에는 달력 버튼이 없다
  const work = applyAction(m, "work", startRoom(m, "work"), { t: "intake", option: "way" }).state;
  const rw = replyOptions(m, "work", work);
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
  // 앞으로의 시기에서는 두 달력 버튼이 모두 있다
  const flow = applyAction(m, "main", startRoom(m, "main"), { t: "topic", id: "flow" }).state;
  const rf = replyOptions(m, "main", flow);
  assert.ok(rf.kind === "chat" && rf.helpers.some((c) => c.key === "calendar-love") && rf.helpers.some((c) => c.key === "calendar-money"));
});

test("이어 보기: 행동 목록을 처음부터 다시 적용하면 같은 대화가 되살아나고, 저장은 행동 목록뿐이라 리포트 글 · 이름이 들어 있지 않다", () => {
  const m = model();
  const actions: RoomAction[] = [{ t: "intake", option: "some" }, { t: "feel", topic: "love", kind: "yes" }, { t: "extra", topic: "love", which: "detail" }, { t: "extra", topic: "love", which: "calendar-love" }, { t: "concern" }];
  let st = startRoom(m, "love");
  for (const a of actions) st = applyAction(m, "love", st, a).state;
  assert.deepEqual(replayRoom(m, "love", actions), st);
  const saved = JSON.stringify({ v: ROOM_SAVE_VERSION, actions });
  assert.ok(saved.length < 400, "행동 목록은 아주 작다");
  assert.ok(!saved.includes(R.headline) && !saved.includes(R.personName), "리포트 글 · 이름이 저장에 없다");
  assert.deepEqual(parseRoomSave(JSON.parse(saved), m, "love"), actions);
  // 깨졌거나 없는 것을 가리키는 행동은 그 행동만 버린다
  assert.deepEqual(parseRoomSave(null, m, "love"), []);
  assert.deepEqual(parseRoomSave({ v: 99, actions }, m, "love"), []);
  assert.deepEqual(parseRoomSave({ v: ROOM_SAVE_VERSION, actions: [{ t: "topic", id: "없음" }, { t: "intake", option: "왜" }, { t: "x" }, null, { t: "concern" }] }, m, "love"), [{ t: "concern" }]);
  // 방마다 따로 되살아난다
  assert.notDeepEqual(replayRoom(m, "work", [{ t: "intake", option: "way" }]).lines, replayRoom(m, "love", actions).lines);
  // 연애 방의 답 번호는 다른 방에서 쓸 수 없다
  assert.deepEqual(parseRoomSave({ v: ROOM_SAVE_VERSION, actions: [{ t: "intake", option: "solo" }] }, m, "money"), []);
});

test("미유의 모든 말은 저장된 리포트의 글이거나 이 파일의 고정 문구다 — 새로 쓴 글이 없다 (AI 호출 없음)", () => {
  const m = model();
  const pool = [...allStrings(R)].map(norm);
  const fixed = new Set(fixedCopy().map(norm));
  const derived = (t: string) => m.topics.some((x) => x.periodExample && norm(x.periodExample) === t) || m.topics.some((x) => norm(askFor(x.id, m.name)) === t);
  for (const room of ROOM_ORDER) {
    const intake = ROOMS[room].intake;
    const script: RoomAction[][] = [
      ...(intake ? [...intake.options, intake.skip].map((o) => [{ t: "intake", option: o.id } as RoomAction]) : [[{ t: "group", id: "me" } as RoomAction], [{ t: "topic", id: "flow" } as RoomAction]]),
    ];
    for (const actions of script) {
      let st = startRoom(m, room);
      const seen: TalkLine[] = [...st.lines];
      for (const a of [...actions, ...["yes", "mixed", "unsure"].map((kind) => ({ t: "feel", topic: st.current ?? roomTopics(m, room)[0].id, kind }) as RoomAction)]) {
        const r = applyAction(m, room, st, a, { contextHref: "/x" });
        st = r.state;
        seen.push(...r.added);
      }
      for (const l of seen) {
        if (l.from === "me") continue;
        const say = l.say;
        const texts = say.kind === "text" ? [say.text] : say.kind === "link" ? [say.text] : say.kind === "system" ? [say.text, say.sub ?? ""] : say.kind === "answer" ? [say.headline, ...say.paragraphs] : [];
        for (const raw of texts.filter(Boolean)) {
          const t = norm(raw.replace(/ ?지금은 ‘나의 고민 기록소’에 적어 둘 수 있어요\.$/, ""));
          assert.ok(pool.some((p) => p.includes(t)) || fixed.has(t) || derived(t) || [...fixed].some((f) => norm(raw).startsWith(f) || f.includes(t)), `${room}: 출처를 알 수 없는 말 — ${raw.slice(0, 40)}`);
        }
      }
    }
  }
});

test("고정 문구: 해요체이고, 사건 예언 · 단정 · 점수 · 투자 권유가 없고, 돈 방은 투자 · 대출 결정을 사주로 정하지 않는다고 밝힌다", () => {
  const copy = fixedCopy();
  assert.ok(copy.length > 40);
  // 모드 접속 안내("○○ 미유 모드로 접속합니다")는 운영자가 정한 문구라 합쇼체 그대로 둔다 — 나머지는 모두 해요체
  const connects = new Set(ROOM_ORDER.map((id) => ROOMS[id].connect).filter(Boolean));
  for (const t of copy) {
    if (!connects.has(t)) assert.doesNotMatch(t, /습니다|합니다|됩니다/, `합쇼체: ${t}`);
    assert.doesNotMatch(t, /반드시|틀림없이|\d+\s*%|\d+점|결혼하게 될|헤어지게 될|만나게 될|생기게 될/, `단정 · 예언: ${t}`);
    assert.doesNotMatch(t, /투자하세요|사세요|주식|코인|대출을 받/, `투자 · 대출 권유: ${t}`);
    assert.doesNotMatch(t, /비겁|식상|재성|관성|인성|대운|세운|십신/, `사주 용어: ${t}`);
  }
  assert.match(ROOMS.money.connectNote ?? "", /투자 · 대출 결정은 사주로 정하지 않아요/);
  assert.match(ROOMS.money.intake!.options.find((o) => o.id === "big")!.lead, /투자나 대출 결정에는 쓰지 말고/);
  // 상대의 속마음 · 나이 · 직업을 정해서 말하지 않는다
  assert.match(ROOMS.love.intake!.options.find((o) => o.id === "crush")!.lead, /속마음을 단정하지는 않아요/);
  assert.match(ROOMS.love.intake!.options.find((o) => o.id === "wedding")!.lead, /결혼 여부나 시기를 사주로 정하지 않고/);
  // 모드 안내는 보장하지 않는다고 밝힌다
  assert.match(ROOMS.love.connectNote ?? "", /보장하는 상담은 아니에요/);
});
