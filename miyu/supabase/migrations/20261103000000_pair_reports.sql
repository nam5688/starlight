-- 리포트 궁합(유료 2) — 두 사람이 각자 분석을 마치고 서로 궁합 생성에 동의한 쌍. 마이그레이션 24번.
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 서버(service_role)만 읽고 쓴다 — 브라우저는 이 표를 볼 수 없다(RLS 켜고 정책을 만들지 않는다).
-- 이 표에는 이름 · 생년월일 · 응답이 없다. 회원번호 · 검사 결과 번호 · 동의 시각 · 동의한 문구의 버전 · 상태뿐이다.
-- 원본(각자의 검사 결과)은 assessments에 그대로 있고 이 표는 "누구와 누가 어느 결과로 연결됐는가"만 안다 — 완성된 궁합 글은 reports에 따로 저장된다(결제 상태와 생성 상태도 따로).
-- 구분(운영자 2026-10-17 D7):
--   · 연결 해제(unlink)  = 더 이상 이 쌍으로 새로 만들지 않는다. 이미 완성된 글의 열람은 그대로다.
--   · 동의 철회(withdraw) = 그 사람의 자료를 새 궁합 생성에 더 쓰지 않는다(철회 시각을 남기고 연결도 끊는다). 완성된 글은 지우지 않는다.
--   · 탈퇴 = 아래 트리거가 그 사람의 쌍을 끊고 철회로 기록한다(결과 글의 처리는 서비스 규칙, docs/report-compat-v1.md).
-- 결제는 쌍마다 한 번이다: 상품 번호 `report-compat:<쌍 번호>`의 결제 완료 주문은 하나만 생긴다(아래 고유 조건).

create table public.pairs (
  id uuid primary key,
  -- 초대 링크의 무작위 토큰(이름 · 생년월일 · 회원번호 없음)
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  a_user_id uuid not null references auth.users (id) on delete restrict,
  -- 검사 결과 번호는 외래 키로 묶지 않는다: 회원 탈퇴가 주문이 없는 검사 결과를 지우는데(withdraw_member_data) 그때 이 표가 탈퇴를 막으면 안 된다.
  -- 지워진 검사 결과는 서비스가 "쓸 수 없는 결과"로 읽는다(새 생성을 막고, 이미 완성된 글의 열람은 결제한 사람의 주문 · 리포트로 이어진다).
  a_assessment_id uuid not null,
  a_consent_at timestamptz not null,
  a_consent_version text not null check (char_length(a_consent_version) between 1 and 40),
  a_withdrawn_at timestamptz,
  b_user_id uuid references auth.users (id) on delete restrict,
  b_assessment_id uuid,
  b_consent_at timestamptz,
  b_consent_version text check (b_consent_version is null or char_length(b_consent_version) between 1 and 40),
  b_withdrawn_at timestamptz,
  -- invited: 상대가 아직 들어오지 않음 · linked: 두 사람이 모두 동의해 연결됨 · unlinked: 끊김(해제 · 철회 · 탈퇴)
  status text not null default 'invited' check (status in ('invited', 'linked', 'unlinked')),
  unlinked_at timestamptz,
  unlinked_by uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((b_user_id is null) = (b_assessment_id is null)),
  check (b_user_id is null or b_user_id <> a_user_id),
  check (b_user_id is null or (b_consent_at is not null and b_consent_version is not null)),
  check (status <> 'linked' or b_user_id is not null),
  check ((status = 'unlinked') = (unlinked_at is not null))
);

create index pairs_a_user_idx on public.pairs (a_user_id, created_at desc);
create index pairs_b_user_idx on public.pairs (b_user_id, created_at desc) where b_user_id is not null;

alter table public.pairs enable row level security;
-- 정책 없음: anon · authenticated는 읽을 수 없고, service_role만 쓴다.
grant select, insert, update, delete on public.pairs to service_role;

-- 쌍마다 결제 완료 주문은 하나 — 한 사람이 결제하면 상대는 다시 결제할 수 없다(동시에 둘이 결제를 마쳐도 두 번째는 이 조건이 막고, 서버가 중복 결제로 운영자에게 알린다)
create unique index orders_one_paid_pair on public.orders (product_id) where status = 'paid' and product_id like 'report-compat:%';

-- 상대가 초대 링크로 들어와 동의하고 연결한다 — 한 번에 하나만 성공한다(행을 잠그고 확인한다)
create or replace function public.pair_join(p_token text, p_user uuid, p_assessment uuid, p_consent_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
  v_owner uuid;
  v_withdrawn timestamptz;
begin
  select * into v from public.pairs where token = p_token for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if v.status = 'unlinked' then
    return jsonb_build_object('status', 'closed');
  end if;
  if v.b_user_id is not null then
    -- 이미 이 사람이 들어와 있으면 같은 결과(다시 눌러도 한 번만)
    if v.b_user_id = p_user then
      return jsonb_build_object('status', 'joined', 'pair', v.id);
    end if;
    return jsonb_build_object('status', 'taken');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v.a_user_id = p_user then
    return jsonb_build_object('status', 'self');
  end if;
  if v.a_withdrawn_at is not null then
    return jsonb_build_object('status', 'closed');
  end if;
  select user_id, withdrawn_at into v_owner, v_withdrawn from public.assessments where id = p_assessment;
  if v_owner is null or v_owner <> p_user or v_withdrawn is not null then
    return jsonb_build_object('status', 'bad-assessment');
  end if;
  update public.pairs
     set b_user_id = p_user, b_assessment_id = p_assessment, b_consent_at = now(), b_consent_version = p_consent_version, status = 'linked'
   where id = v.id;
  return jsonb_build_object('status', 'joined', 'pair', v.id);
end;
$$;

-- 동의 철회: 철회 시각을 남기고 연결을 끊는다(이미 철회했으면 같은 결과)
create or replace function public.pair_withdraw_consent(p_pair uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
begin
  select * into v from public.pairs where id = p_pair for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if p_user is distinct from v.a_user_id and p_user is distinct from v.b_user_id then
    return jsonb_build_object('status', 'not-member');
  end if;
  update public.pairs
     set a_withdrawn_at = case when a_user_id = p_user then coalesce(a_withdrawn_at, now()) else a_withdrawn_at end,
         b_withdrawn_at = case when b_user_id = p_user then coalesce(b_withdrawn_at, now()) else b_withdrawn_at end,
         status = 'unlinked',
         unlinked_at = coalesce(unlinked_at, now()),
         unlinked_by = coalesce(unlinked_by, p_user)
   where id = v.id;
  return jsonb_build_object('status', 'withdrawn');
end;
$$;

-- 연결 해제: 더 이상 이 쌍으로 새로 만들지 않는다(동의 철회는 아니다 — 철회 시각은 남기지 않는다)
create or replace function public.pair_unlink(p_pair uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
begin
  select * into v from public.pairs where id = p_pair for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if p_user is distinct from v.a_user_id and p_user is distinct from v.b_user_id then
    return jsonb_build_object('status', 'not-member');
  end if;
  update public.pairs
     set status = 'unlinked', unlinked_at = coalesce(unlinked_at, now()), unlinked_by = coalesce(unlinked_by, p_user)
   where id = v.id;
  return jsonb_build_object('status', 'unlinked');
end;
$$;

-- 탈퇴하면 이 회원의 쌍을 끊고 철회로 기록한다. 상대가 들어오지 않은 초대는 지운다 — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다
create or replace function public.pairs_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    delete from public.pairs where a_user_id = new.id and b_user_id is null;
    update public.pairs
       set a_withdrawn_at = case when a_user_id = new.id then coalesce(a_withdrawn_at, now()) else a_withdrawn_at end,
           b_withdrawn_at = case when b_user_id = new.id then coalesce(b_withdrawn_at, now()) else b_withdrawn_at end,
           status = 'unlinked',
           unlinked_at = coalesce(unlinked_at, now()),
           unlinked_by = coalesce(unlinked_by, new.id)
     where (a_user_id = new.id or b_user_id = new.id) and status <> 'unlinked';
    update public.pairs
       set a_withdrawn_at = case when a_user_id = new.id then coalesce(a_withdrawn_at, now()) else a_withdrawn_at end,
           b_withdrawn_at = case when b_user_id = new.id then coalesce(b_withdrawn_at, now()) else b_withdrawn_at end
     where (a_user_id = new.id or b_user_id = new.id) and status = 'unlinked';
  end if;
  return new;
end;
$$;

create trigger profiles_pairs_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.pairs_on_withdraw();

revoke all on function public.pair_join(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pair_withdraw_consent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pair_unlink(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pairs_on_withdraw() from public, anon, authenticated;
grant execute on function public.pair_join(text, uuid, uuid, text) to service_role;
grant execute on function public.pair_withdraw_consent(uuid, uuid) to service_role;
grant execute on function public.pair_unlink(uuid, uuid) to service_role;
