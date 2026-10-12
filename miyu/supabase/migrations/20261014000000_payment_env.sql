-- ME:U(미유) 4번째 마이그레이션 — 주문마다 결제 환경을 남긴다
-- 앞의 세 파일을 실행한 뒤 SQL Editor에서 실행한다. 여러 번 실행하면 "already exists" 오류가 나며, 그 경우 그대로 두면 된다.
--
-- payment_env
--   test      : 내 상점의 테스트 키로 진행한 테스트 결제 (실제 돈이 나가지 않음)
--   test-docs : 토스페이먼츠 문서 예제용 공용 테스트 키로 진행한 테스트 결제 — 내 상점 관리자에는 내역이 보이지 않는다
--   live      : 실결제
-- 기존 주문은 모두 실결제 전환 전에 만든 것이므로 test로 채운다. 기존 주문의 다른 값은 바꾸지 않는다.

alter table public.orders
  add column payment_env text not null default 'test'
  check (payment_env in ('test', 'test-docs', 'live'));

-- 주문을 만든 뒤에는 결제 환경을 바꿀 수 없다
create or replace function public.orders_env_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_env <> old.payment_env then
    raise exception 'order payment_env is immutable';
  end if;
  return new;
end;
$$;

create trigger orders_env_guard before update on public.orders
  for each row execute function public.orders_env_guard();
