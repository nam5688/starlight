// 실행: npm test — MY 화면 정리(2026-10-19 운영자 요청)를 소스에서 확인한다: "결제해 둔 질문" 항목 제거(남은 질문권은 유지) · 결제내역 기본 접힘 · "미유 대화기록" 진입점 · 별도 "저장한 채팅 요약" 블록 제거
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSource } from "../lib/report/test-source.ts";

const read = (p: string) => readSource(new URL(`../${p}`, import.meta.url));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = code(read("app/my/page.tsx"));
const hubData = read("components/my/my-hub-data.tsx");
const ordersFold = read("components/my/orders-fold.tsx");
const chats = read("app/my/chats/page.tsx");

test("MY: '결제해 둔 질문' 항목은 화면에서 없어지고 '남은 질문권' 숫자(보상 질문권 + 결제해 둔 질문)는 그대로 남는다 · 질문권 원장 코드는 건드리지 않았다", () => {
  assert.doesNotMatch(page, /결제해 둔 질문|my-cash|채팅방으로 가기|talkHref/);
  // 남은 질문권 카드는 결제해 둔 질문 수를 합쳐 계속 보인다
  assert.match(hubData, /label: "남은 질문권"/);
  assert.match(hubData, /value: \(o \? o\.credits\.balance : 0\) \+ paidQuestions/);
  assert.match(page, /hubCards\(benefits, cash\.ready \? cash\.questions : 0\)/);
  // 원장 · 사용 서비스는 이 화면 정리와 무관하다
  assert.match(page, /getCashView\(repo, member\.userId, 1\)/);
});

test("MY: 결제내역은 기본으로 접혀 있고(open 없음) 눌러서 펼치는 <details>/<summary>다 — 건수는 접힌 채로도 보이고 주문 링크 · 안내는 펼친 안쪽에 있다", () => {
  const c = code(ordersFold);
  assert.match(c, /<details [^>]*data-testid="my-orders-fold"/);
  assert.doesNotMatch(c.slice(c.indexOf("<details"), c.indexOf(">", c.indexOf("<details"))), /\bopen\b/, "기본은 접힘");
  assert.match(c, /<summary [^>]*min-h-12[^>]*cursor-pointer/, "눌리는 영역 48px · 키보드로 열고 닫는 네이티브 요약");
  assert.match(c, /\{orders\.length\}건/);
  assert.match(c, /\/my\/orders\/\$\{o\.orderNumber\}/);
  assert.match(c, /group-open:rotate-180/, "펼침 표시");
  // 주문이 없으면 접는 것이 아니라 빈 상태 문구
  assert.match(page, /orders\.length === 0 \? \([\s\S]*결제내역이 없어요[\s\S]*<OrdersFold orders=\{orders\} \/>/);
});

test("MY: '미유와 대화하기 (지난 상담 이어보기)'는 '미유 대화기록'으로 바뀌고 같은 진입점(/my/chats)에서 상담 기록을 찾아 이어 볼 수 있다 · MY 본문의 별도 '저장한 채팅 요약' 블록은 없다", () => {
  assert.doesNotMatch(hubData + page, /미유와 대화하기|지난 상담 이어보기/);
  assert.match(hubData, /title: ROOM_COPY\.history\.hub, description: ROOM_COPY\.history\.hubDescription, href: "\/my\/chats"/);
  assert.doesNotMatch(page, /my-chats|저장한 채팅 요약 보기|countVisibleChatSummaries|savedChats/);
  const talkRoom = read("lib/report/reading/talk-room.ts");
  assert.match(talkRoom, /hub: "미유 대화기록"/);
  // 그 화면: 이어서 상담하기(방마다 링크) + 같은 화면의 저장한 요약 구역 + 모두 지우기(요약 데이터는 일괄 삭제하지 않는다 — 회원이 누를 때만)
  const c = code(chats);
  assert.match(c, /listMyConversations\(repo, member\.userId, subjects\)/);
  assert.match(c, /talkRoomPath\(c\.assessmentId, c\.room\)/);
  assert.match(c, /data-testid="chats-continue"/);
  assert.match(c, /listSavedSummaries\(repo, member\.userId\)/);
  assert.match(c, /deleteAllChatSummariesAction/);
  assert.match(chats, /title: "미유 대화기록 · ME:U 미유"/);
});
