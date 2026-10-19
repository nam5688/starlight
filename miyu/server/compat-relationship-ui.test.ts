// 실행: npm test — 궁합 입력 화면의 지시 사항을 소스에서 확인한다(실제 화면 확인은 scripts/qa-compat-relationship.ts가 브라우저로 따로 한다).
//  · 이름 안내 문구는 "본인의 이름을 적어주세요" / "상대의 이름을 적어주세요" 그대로, 예전 "예: 슬기" · "예: 남수" 없음
//  · "무슨 사이인가요?" 여섯 값은 연인 / 결혼준비중 / 썸타는중 / 결혼함 / 친구 / 기타 순서이고 기본 선택이 없다 · 성별도 기본 선택이 없다
//  · /compat의 제목 · 안내는 관계 중립이고, 결과는 사이에 맞는 제목 · 유형 표시를 쓴다 · 저장 안내가 실제 보관 방식(탭 1시간, 입력 지우기)과 어긋나지 않는다
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSource } from "../lib/report/test-source.ts";

const read = (p: string) => readSource(new URL(`../${p}`, import.meta.url));
/** 주석을 지운 코드 — 설명 주석에 적힌 낱말이 검사에 걸리지 않게 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const compatForm = read("components/compat/compat-form.tsx");
const buyForm = read("components/compat/compat-buy-form.tsx");
const person = read("components/compat/person-fields.tsx");
const choice = read("components/compat/choice-fields.tsx");
const page = read("app/compat/page.tsx");
const result = read("components/compat/compat-result.tsx");
const pairForms = read("components/pair/pair-forms.tsx");
const reportView = read("components/report/compat-report-view.tsx");

test("이름 안내 문구는 지시한 그대로이고 예전 예시 이름 안내가 어디에도 없다", () => {
  const rel = read("lib/compat/relationship.ts");
  assert.ok(rel.includes('self: "본인의 이름을 적어주세요"') && rel.includes('partner: "상대의 이름을 적어주세요"'));
  for (const src of [compatForm, buyForm, person, pairForms]) assert.doesNotMatch(code(src), /예:\s*슬기|예:\s*남수/);
  assert.match(code(compatForm), /placeholderName=\{NAME_PLACEHOLDER\.self\}/);
  assert.match(code(compatForm), /placeholderName=\{NAME_PLACEHOLDER\.partner\}/);
  assert.match(code(buyForm), /placeholderName=\{NAME_PLACEHOLDER\.partner\}/);
});

test("사이 · 성별 선택은 여섯 값 · 두 값을 정해진 순서로 그리고 기본 선택이 없다", () => {
  const c = code(choice);
  assert.match(c, /COMPAT_RELATIONSHIPS\.map/, "여섯 값을 정해진 목록 순서로 그린다");
  assert.match(c, /COMPAT_GENDERS\.map/);
  assert.match(c, /checked=\{value === r\}/);
  assert.match(c, /checked=\{value === g\}/);
  assert.doesNotMatch(c, /defaultChecked|checked=\{true\}|defaultValue/, "미리 골라 둔 값이 없다");
  // 폼 상태의 처음 값은 모두 빈 값("")이다
  for (const src of [compatForm, buyForm]) {
    assert.match(code(src), /useState<"" \| CompatRelationship>\(""\)/);
  }
  assert.match(code(buyForm), /useState<"" \| CompatGender>\(""\)/);
  // 모바일: 두 칸 → 세 칸으로 넓어지는 격자, 글자는 단어 단위로 줄바꿈, 터치 칸은 48px 이상
  assert.match(c, /grid-cols-2 gap-2 pt-3 sm:grid-cols-3/);
  assert.match(c, /break-keep/);
  assert.match(c, /min-h-12/);
});

test("사이는 모든 입구에서 같은 구성 요소를 쓴다 — 간단 궁합 · 사주 궁합 구매 · 리포트 궁합 초대", () => {
  for (const src of [compatForm, buyForm, pairForms]) assert.match(code(src), /<RelationshipField/);
  for (const src of [buyForm, pairForms]) assert.match(code(src), /<GenderField/);
  assert.match(code(person), /<GenderField/);
});

test("/compat의 제목 · 안내는 관계 중립이고 \"무슨 커플\"이 고정되어 있지 않다", () => {
  const c = code(page);
  assert.match(c, /우리 둘은 어떤 사이일까\?/);
  assert.doesNotMatch(c, /무슨 커플/);
  assert.doesNotMatch(c.slice(c.indexOf("<h1")), /두 사주에서 읽힌 커플 유형과 궁합 지수/);
  assert.match(page, /title: "간단 궁합 · 우리 둘은 어떤 사이일까\?/);
});

test("결과 화면: 커플 유형 이름은 연인 · 결혼준비중 · 결혼함에서만 제목으로 쓰고 그 밖에는 사이의 제목을 쓴다 · 사이에 맞는 풀이 구역이 있다", () => {
  const r = code(result);
  assert.match(r, /showType/);
  assert.match(r, /rel\.heading/);
  assert.match(r, /data-relation-frame/);
  for (const label of ["잘 맞는 모습", "차이가 나타나는 상황", "서로 이해해 볼 점", "지금 해 볼 행동"]) assert.ok(result.includes(label), label);
  // 우리 커플 핵심 상자는 유형을 보이는 사이에서만
  assert.match(r, /\{showType && \(/);
  const v = code(reportView);
  assert.match(v, /showsCoupleType/);
  assert.match(v, /\{showType && \(/);
});

test("개인정보 안내가 실제 동작과 같다 — 서버에는 저장하지 않고, 새로고침용으로 이 브라우저 탭에만 1시간 두며, 탭을 닫거나 입력 지우기로 지워진다 · 이름 · 생년월일 · 성별은 AI에 보내지 않는다", () => {
  const f = compatForm.replace(/\s+/g, " ");
  // 계산을 위한 서버 전달 · 서버 비저장 · 탭 임시 보관(1시간)과 지우는 때를 서로 모순 없이 따로 말한다
  assert.match(f, /입력한 정보는 궁합 계산을 위해 서버에 전달되지만 서버에는 저장하지 않아요/);
  assert.match(f, /새로고침해도 이어 쓸 수 있도록 이 브라우저 탭에 1시간 동안 임시 보관해요/);
  assert.match(f, /탭을 닫거나 \[입력 지우기\]를 누르면 지워져요/);
  assert.doesNotMatch(f, /서버에서 쓰고|서버로 보내지 않아요/, "무료 간단 궁합 안내에 서로 모순으로 읽히는 옛 문구가 없다");
  // 유료 입력 안내(구매 폼)는 이 무료 안내와 섞지 않는다 — 상대 정보 보관은 구매 폼에만 있다
  assert.doesNotMatch(f, /결제|리포트가 완성되면/);
  const b = buyForm.replace(/\s+/g, " ");
  assert.match(b, /이름 · 생년월일 · 성별은 AI에 보내지 않고, 사이는 풀이의 관점을 정하는 지침으로만 전달해요/);
  assert.match(b, /결제 화면으로 넘어가거나 \[입력 지우기\]를 누르면 지워져요/);
  assert.match(b, /리포트가 완성되면 지워요/);
  // 서버 보관(유료 리포트용)과 탭 임시 보관을 따로 말하고, 서로 모순으로 읽히는 "(서버로 보내지 않아요)"가 없다
  assert.match(b, /\[서버 보관\] 상대의 이름 · 생년월일 · 성별과 두 분의 사이는 결제를 시작하면 궁합 리포트를 만드는 동안에만 서버에 보관하고/);
  assert.match(b, /결제를 시작하기 전에 떠나면 서버에는 보관하지 않아요/);
  assert.match(b, /\[탭 임시 보관\] 이와 별개로 새로고침해도 이어 쓸 수 있도록 입력한 내용을 이 브라우저 탭에 1시간 동안 임시 보관하고/);
  assert.doesNotMatch(b, /서버로 보내지 않아요/);
  // 임시 보관은 sessionStorage뿐이다(localStorage · 쿠키 · 서버 저장 없음)
  for (const src of [compatForm, buyForm]) {
    assert.match(code(src), /sessionStorage/);
    assert.doesNotMatch(code(src), /localStorage|document\.cookie/);
  }
  // 결제 화면으로 넘어갈 때(redirect) 임시 보관을 지운다
  assert.match(code(buyForm), /NEXT_REDIRECT"\)\) \{\s*clearDraft\(\);\s*throw err;/);
  // 입력 지우기 단추가 있다
  for (const src of [compatForm, buyForm]) assert.match(code(src), /입력 지우기/);
});

test("공개 개인정보 처리방침에 궁합 입력 정보의 사실이 있다 — 수집 항목(사이) · 탭 임시 보관 1시간과 지우는 때 · AI 전달 범위(사이 + 고정 지침, 이름 · 생년월일 원문 · 성별 값 제외) · AI 현재 미연결 · 보관 기간 · 위탁 업체 · 약관 버전은 그대로", () => {
  const p = read("app/privacy/page.tsx").replace(/\s+/g, " ");
  assert.match(p, /궁합: 이름\(호칭으로만 사용\).*두 사람의 사이\(연인·결혼준비중·썸타는중·결혼함·친구·기타 중 직접 선택/);
  assert.match(p, /3-2\. 궁합 입력 정보/);
  // 무료 간단 궁합: 전달 · 비저장 · 탭 1시간 · 지우는 때 (화면 안내와 같은 사실)
  assert.match(p, /궁합을 계산하기 위해 서버에 전달되지만 서버에는 저장하지 않습니다/);
  assert.match(p, /브라우저 탭\(sessionStorage\)에 1시간 동안 임시 보관하며, 탭을 닫거나 ‘입력 지우기’ 또는 ‘다른 두 사람으로 다시 보기’를 누르면 지웁니다/);
  assert.match(p, /1시간이 지난 것은 다시 열 때 버립니다/);
  // 유료: 보관과 지우는 때
  assert.match(p, /리포트가 완성되거나 결제가 취소·환불·만료로 닫히거나 회원이 탈퇴하면 지웁니다/);
  assert.match(p, /리포트 궁합의 보관 기간은 4번과 같이 출시 전 확정합니다/);
  // AI 전달 범위 · 현재 미연결
  assert.match(p, /선택한 사이의 이름표와 읽는 법을 알려 주는 고정 지침이 AI 서비스에 전달됩니다/);
  assert.match(p, /이름·생년월일 원문과 성별 값은 전달하지 않으며/);
  assert.match(p, /현재 이 AI 풀이는 연결하지 않은 상태이고, 연결하면 위 범위로 전달합니다/);
  // 개인 리포트 · 맛보기 · 자유 질문의 실제 전달 항목(코드로 확인한 범위) — 3-3과 3-1
  assert.match(p, /3-3\. 리포트를 만드는 AI/);
  assert.match(p, /이름 · 생년월일 원문 · 출생지 · 닉네임 · 회원번호 · 문항 문장과 고른 선택지는 전달하지 않습니다/);
  assert.match(p, /응답에서 읽은 경향 문장\(응답을 환산한 숫자 포함\)/);
  assert.match(p, /입력했다면 알고 있는 MBTI 글자/);
  assert.match(p, /이 정보로 출생 연도와 월을 대략 짐작할 수 있습니다/);
  assert.match(p, /맛보기 리포트는 무료 결과에 이미 보여 드린 사주 문구와, 직접 고른 뚜렷한 응답의 문항 문장 · 고른 답\(최대 16개\)을 전달합니다/);
  assert.match(p, /자유 질문을 보내면 질문 글, 그 방의 풀이 글과 요약, 상담방에서 먼저 묻는 질문에 고른 답, 직전 대화와 이전 대화 요약/);
  assert.match(p, /법적 충분성과 동의 방식은 출시 전 법률 검토로 확정합니다/);
  // 사실 설명이 코드와 어긋나지 않는다: 임시 보관은 sessionStorage뿐
  assert.doesNotMatch(code(compatForm), /localStorage|document\.cookie/);
  // 이번에 바꾸지 않은 것: 기존 보관 문구 · 위탁 업체 목록 · 약관 버전(동의 항목)
  assert.match(p, /회원 탈퇴 시까지 보관합니다\. 다만 관련 법령에 따라 거래 기록 등은 정해진 기간 동안 보관합니다\. 항목별 기간은 출시 전 확정합니다\./);
  assert.match(p, /Supabase — 회원 인증과 데이터 저장/);
  // 업체 이름(Anthropic) · 승인 범위 문구는 그대로이고, 용도만 실제 사용 범위로 맞췄다
  assert.match(p, /Anthropic — 리포트 · 궁합 풀이 · 맛보기 리포트 · 자유 질문 답변을 만드는 AI \(전달 항목은 3-1 · 3-2 · 3-3에 적음, 이름 · 생년월일 원문 제외, 현재는 연결하지 않았고 시험 단계에서는 운영자가 승인한 범위 안에서만 호출\)/);
  assert.doesNotMatch(p, /자유 질문에 답하는 AI/);
  assert.match(read("lib/membership/terms.ts"), /TERMS_VERSION = "2026-10-draft-1"/);
});

test("결과 위치: 제출 직후(렌더 전)에 스크롤하지 않고, 결과 컴포넌트가 붙은 뒤 한 번만 제목부터 보이게 옮긴다 · 전체 스크롤 초기화 없음", () => {
  const f = code(compatForm);
  // 예전 방식(setCard 바로 뒤 requestAnimationFrame → 결과로 스크롤)은 입력 칸이 사라지기 전에 실행될 수 있어 결과 중간이 보였다
  assert.doesNotMatch(f, /requestAnimationFrame/);
  assert.doesNotMatch(f, /scrollTo\(0,\s*0\)|window\.scrollTo/);
  const r = code(result);
  assert.match(r, /useEffect\(\(\) => \{[\s\S]*placed\.current[\s\S]*scrollIntoView\(\{ block: "start"[\s\S]*\}, \[\]\)/);
  assert.match(r, /focus\(\{ preventScroll: true \}\)/);
  assert.match(r, /id="compat-result-title"/);
  // 고정 머리글은 전체 스크롤 여백이 비켜 준다
  assert.match(read("app/globals.css"), /scroll-padding-top:\s*5rem/);
});

test("결과 아래 다음 단계(사주 · 리포트 궁합)는 하드코딩된 준비 중 버튼이 아니라 판매 스위치 값을 따른다 — 스위치는 열지 않았다", () => {
  const n = code(read("components/compat/compat-next-steps.tsx"));
  assert.match(n, /saleOpenOf\("saju-compat"\)/);
  assert.match(n, /saleOpenOf\("report-compat"\)/);
  assert.doesNotMatch(code(result), /준비 중/);
  assert.match(read("lib/config/product.ts"), /SAJU_COMPAT[\s\S]{0,400}saleOpen:\s*false/);
  assert.match(read("lib/config/product.ts"), /PAIR_COMPAT[\s\S]{0,400}saleOpen:\s*false/);
});
