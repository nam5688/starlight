-- ME:U(미유) 테스트 리포트 확인 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 언제: 실제 AI(Claude)로 리포트가 어떻게 만들어지는지 처음부터 다시 보고 싶을 때, 지우기 전에 어떤 리포트가 지워지는지 미리 확인한다.
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run.
--       목록이 마음에 들면 delete-test-reports.sql을 따로 실행한다. 이 파일은 지우지 않는다.
--
-- 지워지는 리포트의 조건 (delete-test-reports.sql과 같다):
--   · 주문이 실결제(live)가 아닌 테스트 결제(test · test-docs)일 것
--   · 실제 Claude로 만든 리포트(생성기 이름이 ai:anthropic으로 시작)가 아닐 것 — 실제 AI로 만든 것은 지우지 않는다
-- 주문 · 결제 기록은 지워지지 않는다. 리포트만 지워지고, 결제가 끝난 주문이므로 결과 화면의 [리포트 다시 만들기]를 한 번 누르면 새로 만들어진다(다시 결제하지 않는다).
--
-- 개인을 알 수 있는 값은 닉네임 · 회원번호 앞 8자리뿐이다. 결제 키 · 리포트 내용은 보여 주지 않는다.

select
  case
    when o.payment_env = 'live'                                     then '지우지 않음 (실결제 주문)'
    when coalesce(r.generator, '') like 'ai:anthropic%'             then '지우지 않음 (실제 Claude로 만든 리포트)'
    else '지움 대상'
  end                                                               as "판정",
  o.order_number                                                    as "주문번호",
  o.payment_env                                                     as "결제 환경",
  o.status                                                          as "주문 상태",
  r.status                                                          as "리포트 상태",
  coalesce(r.generator, '-')                                        as "생성기",
  coalesce(r.generator_version, '-')                                as "생성기 버전",
  left(o.user_id::text, 8)                                          as "회원(앞 8자리)",
  a.nickname                                                        as "닉네임",
  to_char(r.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')  as "만든 시각(KST)"
from public.reports r
join public.orders o on o.id = r.order_id
left join public.assessments a on a.id = r.assessment_id
order by r.created_at desc
limit 100;
