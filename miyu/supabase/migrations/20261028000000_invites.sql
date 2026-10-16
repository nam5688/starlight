-- ME:U(미유) 18번째 마이그레이션 — 초대 링크와 초대 할인(심층 리포트 9,900원 → 5,900원)
-- 앞의 파일들(1~17번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다(탈퇴 함수에는 초대 링크 삭제 한 단계를 더한다). 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 대화 · 질문 장부 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
--
-- 운영자 결정(2026-10-16):
--  - 심층 리포트를 구매한 회원이 초대 링크를 만든다. 링크로 들어온 사람이 심층 리포트를 처음 살 때 5,900원(정가 9,900원).
--  - "계정당 3번" = 초대한 사람 한 명당 3명까지(한도 값은 앱이 정해 함수에 넘긴다). 초대받은 사람은 첫 구매 1회.
--  - 궁합(심층 궁합)은 별도 유료이며 이 파일의 범위가 아니다.
--
-- 하는 일
--  - invites: 초대 링크. 검사 결과(심층 리포트를 산 결과)마다 하나. 링크에는 이름 · 생년월일이 없고 무작위 토큰뿐이다. 서버만 쓰고 본인(초대한 사람)만 읽는다.
--  - invite_discounts: 초대 할인을 받은 기록. 초대받은 회원 한 명당 한 줄(그 사람은 평생 한 번만) — 주문 기록처럼 탈퇴 뒤에도 남는다(회원번호 · 주문번호뿐, 개인정보 없음).
--  - invite_discount_status: 지금 이 사람이 이 링크로 할인을 받을 수 있는지 읽기만 한다(화면의 가격 표시용).
--  - claim_invite_discount: 이미 만든 주문(5,900원)에 할인을 확정한다. 초대한 사람별 잠금 안에서 한도 · 첫 구매 · 본인 링크 · 초대한 사람의 구매 상태를 확인하므로 동시에 눌러도 한도를 넘지 않는다.
--    확정하지 못하면 아무것도 바꾸지 않고 이유만 돌려준다(앱이 그 주문을 취소하고 정가 주문을 만든다).
--
-- 한도에 세는 것: 결제 완료 주문 + 결제 대기 1시간 이내 주문. 환불된 주문 · 취소된 주문은 세지 않는다(단, 환불받은 사람이 다시 할인받지는 못한다 — 첫 구매 1회).
-- 결제 대기가 1시간을 넘긴 할인 주문은 같은 초대한 사람의 다음 확인 때 취소한다(그 주문으로 나중에 결제돼 한도를 넘는 일을 막는다).

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  -- 링크에 들어가는 무작위 토큰(24자) — 이름 · 생년월일 · 회원번호가 아니다
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  -- 심층 리포트를 산 결과 하나에 링크 하나
  assessment_id uuid not null unique references public.assessments (id) on delete cascade,
  -- 만든 때의 초대한 사람의 등급: deep = 심층 리포트 구매자(할인 대상 링크) · free = 무료 리포트(나중에 궁합용, 할인 없음)
  inviter_tier text not null check (inviter_tier in ('deep', 'free')),
  created_at timestamptz not null default now()
);

create index invites_inviter_idx on public.invites (inviter_user_id);

-- 초대한 사람 = 그 검사 결과의 주인 (서버 코드 실수로 남의 결과에 붙지 않게)
create or replace function public.invites_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.inviter_user_id
  ) then
    raise exception 'invite owner mismatch';
  end if;
  return new;
end;
$$;

create trigger invites_owner before insert on public.invites
  for each row execute function public.invites_owner_check();

alter table public.invites enable row level security;

create policy "본인 초대 링크 조회" on public.invites
  for select to authenticated using (inviter_user_id = (select auth.uid()));

revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;

-- 초대 할인을 받은 기록 — 초대받은 회원 한 명당 한 줄(평생 한 번). 주문과 같은 성격의 기록이라 링크가 지워져도 남는다
create table public.invite_discounts (
  invitee_user_id uuid primary key references auth.users (id) on delete cascade,
  invite_id uuid references public.invites (id) on delete set null,
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invite_discounts_not_self check (invitee_user_id <> inviter_user_id)
);

create index invite_discounts_inviter_idx on public.invite_discounts (inviter_user_id);

alter table public.invite_discounts enable row level security;
-- 브라우저에는 어떤 접근도 주지 않는다(정책 없음) — 서버만 읽고 쓴다
revoke all on public.invite_discounts from anon, authenticated;
grant select, insert, update, delete on public.invite_discounts to service_role;

-- ─────────────────────────────────────────────
-- 상태 확인(읽기만) · 확정. 서버(비밀키)만 부른다.
-- ─────────────────────────────────────────────

-- 이 사람이 이 링크로 할인을 받을 수 있는가. 결과: { ok: true, remaining } 또는 { ok: false, reason }
--  reason: invalid(없는 링크) · not-deep(할인 대상 링크가 아님) · self(본인 링크) · inviter-not-paid(초대한 사람의 구매가 지금은 확인되지 않음)
--          · already-used(이미 초대 할인을 받았다) · not-first(이미 심층 리포트를 샀다) · cap(초대한 사람의 한도가 찼다)
create or replace function public.invite_discount_status(p_token text, p_invitee uuid, p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  own public.invite_discounts%rowtype;
  own_status text;
  used integer;
begin
  select * into inv from public.invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if inv.inviter_tier <> 'deep' then return jsonb_build_object('ok', false, 'reason', 'not-deep'); end if;
  if inv.inviter_user_id = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not exists (
    select 1 from public.orders o
     where o.user_id = inv.inviter_user_id and o.status = 'paid'
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'inviter-not-paid');
  end if;

  select * into own from public.invite_discounts where invitee_user_id = p_invitee;
  if found then
    select o.status into own_status from public.orders o where o.id = own.order_id;
    if own_status in ('paid', 'refunded') then return jsonb_build_object('ok', false, 'reason', 'already-used'); end if;
  elsif exists (
    select 1 from public.orders o
     where o.user_id = p_invitee and o.status in ('paid', 'refunded')
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-first');
  end if;

  select count(*) into used
    from public.invite_discounts d join public.orders o on o.id = d.order_id
   where d.inviter_user_id = inv.inviter_user_id and d.invitee_user_id <> p_invitee
     and (o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - interval '1 hour'));
  if used >= p_cap then return jsonb_build_object('ok', false, 'reason', 'cap'); end if;
  return jsonb_build_object('ok', true, 'remaining', p_cap - used);
end;
$$;

-- 이미 만든 결제 대기 주문(5,900원)에 할인을 확정한다. 결과는 invite_discount_status와 같은 모양(+ 이유 order-mismatch).
create or replace function public.claim_invite_discount(p_token text, p_invitee uuid, p_order uuid, p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  ord public.orders%rowtype;
  own public.invite_discounts%rowtype;
  own_status text;
  used integer;
begin
  select * into inv from public.invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  -- 초대한 사람별로 한 번에 하나씩 (여러 서버에서 동시에 와도 한도를 넘지 않는다)
  perform pg_advisory_xact_lock(hashtextextended('invite:' || inv.inviter_user_id::text, 0));
  -- 잠금을 잡은 뒤 다시 읽는다(그 사이에 링크가 바뀌었을 수 있다)
  select * into inv from public.invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if inv.inviter_tier <> 'deep' then return jsonb_build_object('ok', false, 'reason', 'not-deep'); end if;
  if inv.inviter_user_id = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  select * into ord from public.orders where id = p_order;
  -- 주문은 이 사람의 결제 대기 주문이고 심층 리포트의 첫 구매 상품이어야 한다
  if not found or ord.user_id <> p_invitee or ord.status <> 'pending' or ord.product_id <> 'personal-integrated-report' then
    return jsonb_build_object('ok', false, 'reason', 'order-mismatch');
  end if;

  if not exists (
    select 1 from public.orders o
     where o.user_id = inv.inviter_user_id and o.status = 'paid'
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'inviter-not-paid');
  end if;

  select * into own from public.invite_discounts where invitee_user_id = p_invitee;
  if found then
    select o.status into own_status from public.orders o where o.id = own.order_id;
    if own_status in ('paid', 'refunded') then return jsonb_build_object('ok', false, 'reason', 'already-used'); end if;
  elsif exists (
    select 1 from public.orders o
     where o.user_id = p_invitee and o.status in ('paid', 'refunded')
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-first');
  end if;

  -- 결제 대기가 1시간을 넘긴 이 초대한 사람의 할인 주문은 취소한다(나중에 결제돼 한도를 넘지 않게). 이 사람 자신의 이전 주문은 아래에서 따로 정리한다
  update public.orders o
     set status = 'canceled', failure_code = 'DISCOUNT_STALE', failure_message = '초대 할인 결제 대기 시간이 지나 취소됨'
   where o.status = 'pending' and o.created_at <= now() - interval '1 hour'
     and o.id in (select d.order_id from public.invite_discounts d where d.inviter_user_id = inv.inviter_user_id and d.invitee_user_id <> p_invitee);

  select count(*) into used
    from public.invite_discounts d join public.orders o on o.id = d.order_id
   where d.inviter_user_id = inv.inviter_user_id and d.invitee_user_id <> p_invitee
     and (o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - interval '1 hour'));
  if used >= p_cap then return jsonb_build_object('ok', false, 'reason', 'cap'); end if;

  if own.invitee_user_id is not null then
    -- 이 사람의 이전 할인 주문이 결제 대기로 남아 있으면 취소한다(두 주문 모두 5,900원으로 결제되는 일을 막는다)
    if own.order_id <> p_order then
      update public.orders set status = 'canceled', failure_code = 'DISCOUNT_REPLACED', failure_message = '새 초대 할인 주문으로 대체됨'
       where id = own.order_id and status = 'pending';
    end if;
    update public.invite_discounts
       set invite_id = inv.id, inviter_user_id = inv.inviter_user_id, order_id = p_order, updated_at = now()
     where invitee_user_id = p_invitee;
  else
    insert into public.invite_discounts (invitee_user_id, invite_id, inviter_user_id, order_id)
      values (p_invitee, inv.id, inv.inviter_user_id, p_order);
  end if;
  return jsonb_build_object('ok', true, 'remaining', p_cap - used - 1);
end;
$$;

revoke all on function public.invite_discount_status(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_invite_discount(text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.invite_discount_status(text, uuid, integer) to service_role;
grant execute on function public.claim_invite_discount(text, uuid, uuid, integer) to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신: 초대 링크를 지운다(링크가 더는 열리지 않는다).
-- 초대 할인 기록(invite_discounts)은 주문 기록과 같은 성격(회원번호 · 주문번호뿐)이라 남긴다.
-- 아래 함수는 17번(20261027000000_taste_reports.sql)의 탈퇴 함수에 "초대 링크 삭제" 한 단계와 결과의 invites 개수만 더한 것이다.
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
  v_summaries int := 0;
  v_tastes int := 0;
  v_invites int := 0;
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

  -- 채팅 요약(직접 저장한 것 · 저장하지 않고 끝낸 대화의 참고 기록) 삭제
  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

  -- 맛보기 리포트(AI가 쓴 글) 삭제 — 주문이 있는 검사는 지워지지 않고 비워지기만 하므로 여기서 직접 지운다
  delete from public.taste_reports where user_id = p_user_id;
  get diagnostics v_tastes = row_count;

  -- 초대 링크 삭제 — 링크가 더는 열리지 않는다(초대 할인 기록은 주문 기록처럼 남는다)
  delete from public.invites where inviter_user_id = p_user_id;
  get diagnostics v_invites = row_count;

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
    'chat_questions', v_questions,
    'chat_summaries', v_summaries,
    'taste_reports', v_tastes,
    'invites', v_invites
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
