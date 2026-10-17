-- 사주 궁합(유료) 요청 — 구매한 사람이 입력한 "상대 출생정보"를 리포트가 만들어지는 동안에만 따로 보관한다. 마이그레이션 23번.
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 서버(service_role)만 읽고 쓴다 — 브라우저는 이 표를 볼 수 없다(RLS 켜고 정책을 만들지 않는다).
-- 주문(orders)은 상품 번호 `saju-compat:<요청 번호>`로 만들어지고, 같은 번호로 이 표의 한 줄이 생긴다. 리포트(reports)는 기존 표를 그대로 쓴다(content에 완성된 글만 담는다 — 상대 생년월일은 글에 없다).
-- 리포트가 완성되면 상대 출생정보를 지운다(scrub_compat_request). 탈퇴하면 지운다(프로필의 탈퇴 표시 트리거). 법정 보관이 필요한 것은 주문 · 결제 기록이고 상대 출생정보는 아니다 — 보관 근거 · 기간은 법률 검토 대상이다.

create table public.compat_requests (
  id uuid primary key,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  -- 상대 입력(이름 · 달력 · 생년월일 · 출생시간 · 성별(선택)) — 비워 두면 지운 것이다
  partner jsonb not null check (jsonb_typeof(partner) = 'object' and pg_column_size(partner) <= 1024),
  -- 지운 시각(리포트 완성 · 탈퇴). 지우기 전에는 null
  scrubbed_at timestamptz,
  created_at timestamptz not null default now(),
  check (scrubbed_at is null or partner = '{}'::jsonb)
);

create index compat_requests_user_idx on public.compat_requests (user_id, created_at desc);

alter table public.compat_requests enable row level security;
-- 정책 없음: anon · authenticated는 읽을 수 없고, service_role만 쓴다.
grant select, insert, update, delete on public.compat_requests to service_role;

-- 리포트가 완성되면 서버가 부른다 — 상대 출생정보를 비운다(이미 비웠으면 아무것도 하지 않는다)
create or replace function public.scrub_compat_request(p_order uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.compat_requests set partner = '{}'::jsonb, scrubbed_at = now() where order_id = p_order and scrubbed_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- 탈퇴하면 이 회원이 넣은 상대 출생정보를 모두 지운다 — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다
create or replace function public.compat_requests_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.compat_requests set partner = '{}'::jsonb, scrubbed_at = coalesce(scrubbed_at, now()) where user_id = new.id and scrubbed_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_compat_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.compat_requests_on_withdraw();

revoke all on function public.scrub_compat_request(uuid) from public, anon, authenticated;
revoke all on function public.compat_requests_on_withdraw() from public, anon, authenticated;
grant execute on function public.scrub_compat_request(uuid) to service_role;
