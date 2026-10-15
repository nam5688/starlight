-- ME:U(미유) 테스트 리포트 지우기 — 리포트만 지운다. 주문 · 결제 · 회원 · 검사 결과는 그대로 둔다.
--
-- 언제: 지금까지 개발용 · 모의 생성기로 만들어진 테스트 리포트를 지우고, 실제 AI(Claude)로 새로 만들어 보고 싶을 때 (운영자가 직접 실행한다).
-- 먼저: check-test-reports.sql로 어떤 리포트가 지워지는지 확인한다. 이 파일은 확인 없이 지운다.
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run. 한 번에 한 가지 결과 표("지운 리포트 수")만 나온다.
--
-- 지워지는 리포트의 조건:
--   · 주문이 실결제(live)가 아닌 테스트 결제(test · test-docs)일 것
--   · 실제 Claude로 만든 리포트(생성기 이름이 ai:anthropic으로 시작)가 아닐 것 — 실제 AI로 만든 것은 지우지 않는다
-- 같이 지워지는 것: 그 리포트에 남긴 만족도 의견(report_feedback, 리포트에 딸린 기록).
-- 지워지지 않는 것: 주문 · 결제 기록 · AI 사용 기록(ai_usage, 비용 확인용) · 검사 결과 · 채팅 대화 · 채팅 질문 횟수.
--
-- 지운 뒤: 결제가 끝난 주문이라 다시 결제하지 않는다. 결과 화면을 열면 "결제가 완료되었습니다 · 리포트를 만들지 못했습니다" 안내와
--          [리포트 다시 만들기] 버튼이 보인다 — 그 버튼을 한 번 누르면 같은 주문으로 새로 만들어진다(화면 문구가 "만들지 못했습니다"인 것은 정상이다. 지운 리포트가 없는 상태를 같은 화면이 쓴다).
--          서버를 실제 Claude로 연결해 두었다면(.env.local의 AI_PROVIDER=anthropic 등 — docs/update-guide.md) 그 AI가 만든다.
--          연결하지 않았다면 개발용 규칙 생성기가 다시 만든다. 한 번 만든 리포트는 열 때마다 새로 만들지 않고 저장된 것을 그대로 보여 준다.

with deleted as (
  delete from public.reports r
  using public.orders o
  where o.id = r.order_id
    and o.payment_env <> 'live'
    and coalesce(r.generator, '') not like 'ai:anthropic%'
  returning r.id
)
select count(*) as "지운 리포트 수" from deleted;

-- ─────────────────────────────────────────────
-- (선택) 같은 계정으로 채팅을 처음부터 다시 시험하고 싶을 때만 — 아래 블록의 앞쪽 `--`를 지우고 위 블록과 따로 한 번 더 실행한다.
-- 채팅 질문 횟수(방마다 무료 질문 수를 세는 기록)와 이어 보기 대화를 지운다. 질문 내용은 원래 횟수 기록에 없다.
-- 결제해 두고 쓰지 않은 질문(질문 장부)은 건드리지 않는다. 테스트 결제 주문이 있는 회원만 대상이다.
--
-- with who as (select distinct user_id from public.orders where payment_env <> 'live'),
--      q as (delete from public.chat_questions where user_id in (select user_id from who) returning 1),
--      t as (delete from public.talk_rooms where user_id in (select user_id from who) returning 1)
-- select (select count(*) from q) as "지운 질문 횟수 기록", (select count(*) from t) as "지운 대화";
