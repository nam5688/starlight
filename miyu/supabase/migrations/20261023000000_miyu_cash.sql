-- ME:U(미유) 13번째 마이그레이션 — 미유캐시(선불 충전 포인트): 지갑 · 거래 내역 · 충전 · 차감 · 되돌림
-- 앞의 파일들(1~12번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 · 대화 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "남은 캐시가 있으면 막기"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 하는 일
--  - cash_wallets: 회원마다 지갑 한 줄(잔액). 잔액은 0 아래로 내려가지 않는다.
--  - cash_ledger: 캐시가 오르내린 내역(충전 · 보너스 · 질문에 사용 · 사용 되돌림 · 결제 취소 회수). 쌓기만 하고 고치거나 지우지 않는다.
--    "지갑 잔액 = 내역의 합계"여야 하며 supabase/check-cash.sql이 읽기 전용으로 확인한다.
--  - 충전: 미유캐시 충전 주문(상품 번호 cash-charge:<충전>:<보너스>:<임의번호>)이 "결제 완료"로 바뀌는 바로 그 처리 안에서(트리거) 지갑에 넣는다.
--    그래서 결제 승인과 충전이 따로 놀지 않고, 같은 승인을 여러 번 반영해도 한 번만 들어간다(주문 · 종류별 고유 조건).
--  - 결제 취소: 결제 완료 → 환불됨으로 바뀔 때 그 주문으로 넣은 캐시를 회수한다. 이미 쓴 만큼은 회수하지 못하고 부족분(shortfall)을 내역에 남긴다(주문 상태 변경은 막지 않는다).
--  - 질문 차감: spend_cash(회원, 개수, 참조번호) — 잔액이 모자라면 아무것도 바꾸지 않고 null. 같은 참조번호로 두 번 차감할 수 없다.
--  - 되돌림: restore_cash_spend(회원, 참조번호) — 답을 받지 못한 질문의 차감을 한 번만 되돌린다.
--  - 브라우저는 본인 지갑 · 내역 조회만. 쓰기는 위 함수(서버 비밀키)와 트리거로만 한다.

create table public.cash_wallets (
  user_id uuid primary key references auth.users (id) on delete restrict,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  -- charge 충전 · bonus 보너스 · spend 질문에 사용 · spend_restore 사용 되돌림 · clawback 결제 취소로 회수
  kind text not null check (kind in ('charge', 'bonus', 'spend', 'spend_restore', 'clawback')),
  amount integer not null,
  order_id uuid references public.orders (id) on delete restrict,
  -- 질문 한 번을 가리키는 참조번호 (차감과 되돌림이 같은 번호를 쓴다). 질문 내용은 담지 않는다
  ref text check (ref is null or ref ~ '^[A-Za-z0-9_:.=-]{6,80}$'),
  -- 결제 취소 때 이미 써서 회수하지 못한 캐시
  shortfall integer not null default 0 check (shortfall >= 0),
  created_at timestamptz not null default now(),
  check (
    (kind in ('charge', 'bonus', 'spend_restore') and amount > 0)
    or (kind = 'spend' and amount < 0)
    or (kind = 'clawback' and amount <= 0)
  ),
  check (
    (kind in ('charge', 'bonus', 'clawback') and order_id is not null)
    or (kind in ('spend', 'spend_restore') and ref is not null)
  )
);

-- 같은 주문의 같은 종류는 한 번만 (같은 결제 승인을 여러 번 반영해도 한 번만 충전 · 회수)
create unique index cash_ledger_order_kind on public.cash_ledger (order_id, kind) where order_id is not null;
-- 같은 질문의 차감 · 되돌림도 한 번만
create unique index cash_ledger_ref_kind on public.cash_ledger (ref, kind) where ref is not null;
create index cash_ledger_user_idx on public.cash_ledger (user_id, created_at desc);

-- 내역은 쌓기만 한다
create or replace function public.cash_ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cash ledger is append-only';
end;
$$;

create trigger cash_ledger_no_change before update or delete on public.cash_ledger
  for each row execute function public.cash_ledger_append_only();

alter table public.cash_wallets enable row level security;
alter table public.cash_ledger enable row level security;

create policy "본인 지갑 조회" on public.cash_wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 캐시 내역 조회" on public.cash_ledger
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.cash_wallets, public.cash_ledger from anon, authenticated;
grant select on public.cash_wallets, public.cash_ledger to authenticated;
-- 서버(비밀키)도 표를 직접 고치지 못하고 읽기만 한다. 쓰기는 아래 함수 · 트리거로만
revoke all on public.cash_wallets, public.cash_ledger from service_role;
grant select on public.cash_wallets, public.cash_ledger to service_role;

-- ─────────────────────────────────────────────
-- 충전 · 결제 취소 회수: 주문 상태가 바뀔 때 같은 처리 안에서
-- 상품 번호 형식이 맞지 않으면 건너뛴다 — 결제 완료 처리를 막지 않기 위해서이며, 건너뛴 주문은 check-cash.sql이 찾는다.
-- ─────────────────────────────────────────────
create or replace function public.cash_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_cash int;
  v_bonus int;
  v_credited int;
  v_balance int;
  v_take int;
begin
  if new.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    return new;
  end if;
  v_parts := string_to_array(new.product_id, ':');
  v_cash := v_parts[2]::int;
  v_bonus := v_parts[3]::int;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.cash_wallets (user_id, balance) values (new.user_id, 0) on conflict (user_id) do nothing;

    if v_cash > 0 then
      insert into public.cash_ledger (user_id, kind, amount, order_id) values (new.user_id, 'charge', v_cash, new.id) on conflict do nothing;
      if found then
        update public.cash_wallets set balance = balance + v_cash, updated_at = now() where user_id = new.user_id;
      end if;
    end if;
    if v_bonus > 0 then
      insert into public.cash_ledger (user_id, kind, amount, order_id) values (new.user_id, 'bonus', v_bonus, new.id) on conflict do nothing;
      if found then
        update public.cash_wallets set balance = balance + v_bonus, updated_at = now() where user_id = new.user_id;
      end if;
    end if;

  elsif new.status = 'refunded' and old.status = 'paid' then
    select coalesce(sum(amount), 0) into v_credited
      from public.cash_ledger where order_id = new.id and kind in ('charge', 'bonus');
    if v_credited > 0 then
      select balance into v_balance from public.cash_wallets where user_id = new.user_id for update;
      v_take := least(coalesce(v_balance, 0), v_credited);
      insert into public.cash_ledger (user_id, kind, amount, order_id, shortfall)
        values (new.user_id, 'clawback', -v_take, new.id, v_credited - v_take)
        on conflict do nothing;
      if found and v_take > 0 then
        update public.cash_wallets set balance = balance - v_take, updated_at = now() where user_id = new.user_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_cash_change after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.cash_on_order_change();

-- ─────────────────────────────────────────────
-- 질문 차감 · 되돌림 (서버만 부른다)
-- ─────────────────────────────────────────────
create or replace function public.spend_cash(p_user_id uuid, p_amount int, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'cash_invalid_amount';
  end if;
  update public.cash_wallets
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user_id and balance >= p_amount
  returning balance into v_balance;
  if not found then
    return null; -- 잔액이 모자라거나 지갑이 없다. 아무것도 바꾸지 않는다
  end if;
  insert into public.cash_ledger (user_id, kind, amount, ref) values (p_user_id, 'spend', -p_amount, p_ref);
  return v_balance;
end;
$$;

create or replace function public.restore_cash_spend(p_user_id uuid, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount int;
  v_balance int;
begin
  select -amount into v_amount from public.cash_ledger where user_id = p_user_id and ref = p_ref and kind = 'spend';
  if v_amount is null then
    return null; -- 되돌릴 차감이 없다
  end if;
  insert into public.cash_ledger (user_id, kind, amount, ref) values (p_user_id, 'spend_restore', v_amount, p_ref) on conflict do nothing;
  if not found then
    return null; -- 이미 되돌렸다
  end if;
  update public.cash_wallets set balance = balance + v_amount, updated_at = now() where user_id = p_user_id returning balance into v_balance;
  return v_balance;
end;
$$;

revoke all on function public.spend_cash(uuid, int, text) from public, anon, authenticated;
revoke all on function public.restore_cash_spend(uuid, text) from public, anon, authenticated;
grant execute on function public.spend_cash(uuid, int, text) to service_role;
grant execute on function public.restore_cash_spend(uuid, text) to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 남은 미유캐시가 있으면 처리하지 않는다. 나머지는 12번 파일과 같다.
-- 지갑 · 내역은 주문 · 결제 기록처럼 거래 기록이라 지우지 않고 남긴다.
-- ─────────────────────────────────────────────
create or replace function public.withdraw_member_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reports int := 0;
  v_deleted_assessments int := 0;
  v_scrubbed_assessments int := 0;
  v_contexts int := 0;
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'withdraw_not_found';
  end if;

  -- 진행 중인 결제 · 리포트 생성이 있으면 처리하지 않는다 (결제 확인이나 생성이 끝난 뒤에 다시)
  if exists (select 1 from public.orders where user_id = p_user_id and status = 'pending' and created_at > now() - interval '1 hour') then
    raise exception 'withdraw_blocked_pending_order';
  end if;
  if exists (select 1 from public.reports where user_id = p_user_id and status in ('queued', 'generating')) then
    raise exception 'withdraw_blocked_report_in_progress';
  end if;
  -- 남은 미유캐시가 있으면 처리하지 않는다 (다 쓰거나 환불 문의를 마친 뒤에 다시 — 정책 확정 전 초안, docs/cash-policy.md)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  -- 리포트 내용 삭제 (주문은 남는다). 완성 리포트는 수정할 수 없지만 삭제는 회원 탈퇴 때만 이 함수로 한다
  delete from public.reports where user_id = p_user_id;
  get diagnostics v_reports = row_count;

  delete from public.user_regions where user_id = p_user_id;
  get diagnostics v_regions = row_count;

  -- 주문이 없는 검사는 통째로 삭제
  delete from public.assessments a
   where a.user_id = p_user_id
     and not exists (select 1 from public.orders o where o.assessment_id = a.id);
  get diagnostics v_deleted_assessments = row_count;

  -- 주문이 가리키는 검사는 내용을 비운다 (생년월일 · 응답 · 닉네임 · MBTI · 계산 결과 모두). 날짜 자리는 형식 검사를 맞추기 위한 빈 값(1900-01-01)이다
  update public.assessments
     set nickname = '탈퇴',
         birth_calendar = 'solar',
         birth_is_leap_month = false,
         birth_year = 1900, birth_month = 1, birth_day = 1,
         birth_time = null,
         known_mbti = null,
         answers = '{}'::jsonb,
         summary = '{}'::jsonb,
         saju = '{}'::jsonb,
         content_version = 'withdrawn',
         withdrawn_at = coalesce(withdrawn_at, now())
   where user_id = p_user_id and withdrawn_at is null;
  get diagnostics v_scrubbed_assessments = row_count;

  update public.profiles
     set nickname = null,
         withdrawn_at = coalesce(withdrawn_at, now())
   where id = p_user_id;

  return jsonb_build_object(
    'reports', v_reports,
    'assessments_deleted', v_deleted_assessments,
    'assessments_emptied', v_scrubbed_assessments,
    'personal_contexts', v_contexts,
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
