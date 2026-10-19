-- ME:U(미유) DB 변경 25번(후기) 단독 적용 파일 — SQL Editor에서 한 번 실행한다
--
-- 이 파일은 supabase/migrations/20261104000000_reviews.sql을 한 글자도 고치지 않고 가운데에 붙인 것이다.
-- (scripts/render-apply-sql.ts --reviews 가 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- ⚠️ 테스트 전용 프로젝트(wdvrwwajakjdfrajgxcm)에 적용하기 위한 파일이다. 운영 DB에는 운영자가 따로 승인하기 전에는 실행하지 않는다.
--
-- 사용 순서
--  1) supabase/review-25-precheck.sql을 먼저 실행해 "종합"이 OK인지 확인한다(읽기 전용).
--  2) 이 파일을 SQL Editor에 모두 붙여넣고 Run (한 번만).
--  3) supabase/review-25-postcheck.sql을 실행해 "종합"이 OK인지 확인한다(읽기 전용). 이 파일 끝의 확인 조회와 같은 것이다.
--
-- 안전장치
--  - 시작 조건: 필요한 표 · 열 · 역할이 있고, 25번이 만드는 것이 하나도 없으며, funnel_events의 기존 이름이 새 허용 목록 안에 있어야 한다.
--    아니면 아무것도 바꾸지 않고 "시작 조건 불충족"으로 멈춘다(이미 한 번 실행한 뒤 다시 실행해도 여기서 멈춘다 — 문제가 아니다).
--  - 전체가 하나의 트랜잭션이다. 끝 확인(표 · 권한 · 정책 · 함수 · 트리거 · 이름 검사)이 하나라도 어긋나면 이 파일이 한 일이 모두 취소된다.
--  - 기존 회원 · 검사 · 주문 · 결제 · 리포트 · 방문 단계 데이터는 지우거나 고치지 않는다. 바뀌는 기존 항목은 funnel_events의 이름 검사 하나뿐이다(허용 이름 5개 → 7개).
--  - 이 파일을 적용하는 것만으로는 아무 후기도 만들어지지 않고 질문권이 지급되지 않는다(보상은 혜택 설정 feature.review_reward가 꺼져 있는 동안 지급하지 않는다).
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: funnel_events의 제약 조건 교체(허용값을 넓히는 변경) 때문이다. 기존 데이터를 지우지 않으므로 실행해도 된다.

begin;

do $check$
declare
  problems text[] := '{}';
  bad_names text;
begin
  if to_regclass('public.profiles') is null then problems := problems || '표 profiles(1~3번)'::text; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'withdrawn_at') then problems := problems || '프로필의 withdrawn_at 열(10번)'::text; end if;
  if to_regclass('public.funnel_events') is null then problems := problems || '표 funnel_events(8번)'::text; end if;
  if to_regclass('auth.users') is null then problems := problems || '표 auth.users(Supabase Auth)'::text; end if;
  if (select count(*) from pg_roles where rolname in ('service_role', 'authenticated', 'anon')) <> 3 then problems := problems || '역할 service_role · authenticated · anon'::text; end if;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 필요한 것이 없습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 실행하지 말고 review-25-precheck.sql 결과를 알려 주세요.', array_to_string(problems, ' / ');
  end if;

  if to_regclass('public.reviews') is not null then problems := problems || '표 reviews'::text; end if;
  if to_regclass('public.review_admin_log') is not null then problems := problems || '표 review_admin_log'::text; end if;
  if to_regclass('public.review_reports') is not null then problems := problems || '표 review_reports'::text; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('submit_review_report', 'review_admin_apply', 'reviews_on_withdraw', 'reviews_touch')) then problems := problems || '후기 함수'::text; end if;
  if exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) then problems := problems || '트리거 profiles_reviews_withdraw'::text; end if;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 25번이 만드는 것이 이미 있습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 다시 실행하지 말고 review-25-precheck.sql 결과를 알려 주세요.', array_to_string(problems, ' / ');
  end if;

  select string_agg(distinct name, ', ' order by name) into bad_names from public.funnel_events where name not in ('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view', 'review_section_view', 'review_all_click');
  if bad_names is not null then
    raise exception '시작 조건 불충족 — funnel_events에 새 허용 목록 밖의 이름이 있습니다: %. 25번의 이름 검사를 바꿀 수 없어 아무것도 바꾸지 않았습니다. 결과를 알려 주세요.', bad_names;
  end if;
end
$check$;

-- ═════════════════════════════════════════════════════════════════
-- 25번: 20261104000000_reviews.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 25번째 마이그레이션 — 이용 후기(리뷰): 후기 표 · 운영자 조치 이력 · 신고 · 운영자 조치 함수 · 방문 단계 이름 확장 · 탈퇴하면 지우기.
-- 앞의 파일들(1~24번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- ⚠️ 이 파일은 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 규칙: 더하기만 한다(기존 표 · 함수 · 데이터는 바뀌지 않는다 — 단 funnel_events의 이름 검사만 허용 이름 둘을 더한 목록으로 바꾼다). 이 파일을 적용하는 것만으로는
-- 아무것도 새로 보이거나 지급되지 않는다 — 후기가 없으면 메인에 아무것도 그리지 않고, 질문권 보상은 혜택 설정 feature.review_reward가 꺼져 있는 동안 지급하지 않는다.
--
-- 보상(질문권) 지급은 이 파일의 함수가 아니라 19번의 grant_credit을 서버가 멱등 키 'review:<후기 번호>'로 한 번만 불러서 한다.
-- 후기 한 건 = (회원, 종류, 이용 건) 하나(고유 조건). 삭제는 행을 남기고 글만 지우는 "묘비"라서, 지운 뒤 다시 써도 같은 이용 건에는 보상이 한 번뿐이다.
-- 후기 글은 어떤 운영 기록 · 알림에도 넣지 않는다. 운영자 조치 이력(review_admin_log)에는 누가 · 언제 · 무엇을 · 사유 분류만 있고 글은 복사하지 않는다.
-- 대가(질문권 보상 · 무료 체험) 표시의 정확한 법정 문구와 후기 보관 기간 · 약관 문구는 법률 검토 대상이며 이 파일에서 정하지 않는다.

-- ─────────────────────────────────────────────
-- 1. 후기
-- ─────────────────────────────────────────────

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 개인 심층 리포트 · 사주 궁합 · 리포트 궁합 · 미유 채팅
  kind text not null check (kind in ('personal', 'saju_compat', 'pair_compat', 'chat')),
  -- 구매 건이면 주문 번호(orders.id), 채팅이면 검사 결과 번호(assessments.id). 서버가 본인 이용 건인지 확인한 뒤에만 넣는다(여러 표를 가리켜서 외래 키는 두지 않는다)
  subject_ref uuid not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 600),
  -- 공개에 동의했는가. 공개 후기 = status published + public_consent 둘 다
  public_consent boolean not null default false,
  -- published 공개 · private 나만 보기 · hidden 운영자가 숨김 · deleted 삭제(묘비)
  status text not null default 'private' check (status in ('published', 'private', 'hidden', 'deleted')),
  -- 쓸 때의 대가 표시 — reward 질문권 보상 대상 · free_trial 보상 없이 무료로 제공받은 이용 · none. free_trial은 무료로 제공받은 이용이면 보상 여부와 관계없이 true
  disclosure text not null default 'none' check (disclosure in ('reward', 'free_trial', 'none')),
  free_trial boolean not null default false,
  -- 보상: off 꺼져 있음/0개 · ineligible 보상 대상이 아닌 무료 체험 · pending 지급을 시작함 · granted 지급 확정 · failed 지급 실패(다시 시도 가능)
  reward_state text not null default 'off' check (reward_state in ('off', 'ineligible', 'pending', 'granted', 'failed')),
  reward_credits integer not null default 0 check (reward_credits between 0 and 10),
  reward_op_key text,
  rewarded_at timestamptz,
  -- 공개에 동의한 시각(동의하지 않으면 null)과 마지막으로 저장할 때 보인 공개 전 안내의 판
  consented_at timestamptz,
  consent_notice_version text check (consent_notice_version is null or char_length(consent_notice_version) <= 20),
  -- 운영자가 고른(메인 우선 노출) 후기
  featured boolean not null default false,
  featured_at timestamptz,
  -- 운영자가 숨기거나 지운 사유 분류(글 내용이 아니다)
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 40),
  hidden_at timestamptz,
  deleted_by text check (deleted_by is null or deleted_by in ('user', 'admin')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 같은 이용 건에 후기는 하나(중복 작성 · 보상 중복 지급 방지의 바탕)
  unique (user_id, kind, subject_ref),
  -- 공개 중이면 공개 동의가 있다
  check (status <> 'published' or public_consent),
  check (not public_consent or consented_at is not null),
  -- 삭제(묘비)는 글이 비어 있고 공개 동의 · 선정이 없다
  check (status <> 'deleted' or (body = '' and not public_consent and not featured and deleted_by is not null)),
  -- 보상 기록의 앞뒤가 맞아야 한다
  check (reward_state = 'granted' or reward_credits = 0),
  check (reward_state <> 'granted' or (reward_credits >= 1 and rewarded_at is not null)),
  check (reward_state in ('off', 'ineligible') or reward_op_key is not null)
);

create index reviews_user_idx on public.reviews (user_id, created_at desc);
create index reviews_status_idx on public.reviews (status, created_at desc);
create index reviews_public_idx on public.reviews (created_at desc) where status = 'published' and public_consent;
create index reviews_featured_idx on public.reviews (featured_at desc) where featured and status = 'published' and public_consent;
create index reviews_reward_retry_idx on public.reviews (created_at) where reward_state in ('pending', 'failed');

create or replace function public.reviews_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reviews_touch_updated before update on public.reviews
  for each row execute function public.reviews_touch();

alter table public.reviews enable row level security;
-- 본인 후기만 조회한다. 공개 후기는 서버가 공개 조건(published + 동의)으로 걸러 읽고 작성자를 알 수 있는 값은 내보내지 않는다
create policy "본인 후기 조회" on public.reviews for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;
grant select, insert, update, delete on public.reviews to service_role;

-- ─────────────────────────────────────────────
-- 2. 운영자 조치 이력 — 숨김 · 숨김 해제 · 삭제 · 메인 선정 · 선정 해제 · 신고 기각. 글은 복사하지 않는다
-- ─────────────────────────────────────────────

create table public.review_admin_log (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviews (id) on delete cascade,
  admin_id uuid not null,
  action text not null check (action in ('hide', 'unhide', 'delete', 'feature', 'unfeature', 'dismiss_reports')),
  reason_code text not null,
  memo text check (memo is null or char_length(memo) <= 120),
  created_at timestamptz not null default now(),
  -- 사유 분류는 조치에 맞는 것만 — "부정적인 내용"이라는 분류는 없다. 기타는 메모가 꼭 있어야 한다
  check (
    (action in ('hide', 'delete') and reason_code in ('privacy', 'abuse', 'fake_or_ad', 'report', 'other'))
    or (action = 'unhide' and reason_code in ('wrongly_hidden', 'resolved', 'other'))
    or (action = 'feature' and reason_code in ('specific', 'helpful', 'balance', 'other'))
    or (action = 'unfeature' and reason_code in ('replaced', 'criteria', 'other'))
    or (action = 'dismiss_reports' and reason_code in ('no_violation', 'other'))
  ),
  check (reason_code <> 'other' or (memo is not null and char_length(btrim(memo)) >= 2))
);

create index review_admin_log_review_idx on public.review_admin_log (review_id, id desc);
create index review_admin_log_recent_idx on public.review_admin_log (id desc);

alter table public.review_admin_log enable row level security;
-- 정책 없음: 서버(service_role)만 읽고 쌓는다
revoke all on public.review_admin_log from anon, authenticated;
grant select, insert on public.review_admin_log to service_role;
grant usage, select on sequence public.review_admin_log_id_seq to service_role;

-- ─────────────────────────────────────────────
-- 3. 신고 — 공개 후기에 대해서만. 같은 방문자(익명 번호)는 같은 후기를 한 번만 신고한다. 신고자의 이름 · 연락처는 받지 않는다
-- ─────────────────────────────────────────────

create table public.review_reports (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_key text not null check (char_length(reporter_key) between 8 and 64),
  reason text not null check (reason in ('privacy', 'abuse', 'fake_or_ad', 'other')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_action text check (handled_action is null or handled_action in ('hide', 'delete', 'dismiss_reports')),
  unique (review_id, reporter_key)
);

create index review_reports_open_idx on public.review_reports (review_id) where handled_at is null;

alter table public.review_reports enable row level security;
revoke all on public.review_reports from anon, authenticated;
grant select, insert, update on public.review_reports to service_role;
grant usage, select on sequence public.review_reports_id_seq to service_role;

-- 신고 접수. 공개 중인 후기에만 받는다. 결과: reported · duplicate(같은 방문자가 이미 신고함) · not-public
create or replace function public.submit_review_report(p_review uuid, p_reporter text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews%rowtype;
  n integer;
begin
  select * into r from public.reviews where id = p_review;
  if not found or r.status <> 'published' or not r.public_consent then return 'not-public'; end if;
  insert into public.review_reports (review_id, reporter_key, reason) values (p_review, p_reporter, p_reason)
    on conflict (review_id, reporter_key) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'reported' else 'duplicate' end;
end;
$$;

-- ─────────────────────────────────────────────
-- 4. 운영자 조치 — 상태 변경과 이력 기록을 한 번에(이력만 남거나 조치만 남지 않는다)
-- ─────────────────────────────────────────────

-- p_action: hide · unhide · delete · feature · unfeature · dismiss_reports. 사유 분류가 조치에 맞지 않으면 이력 검사에 걸려 전체가 취소된다(23514).
-- 결과: { ok: true } 또는 { ok: false, reason: 'not-found' | 'invalid-state' }
--  - hide: 공개 중 · 나만 보기 → hidden (숨김 중에는 회원이 고쳐도 다시 공개되지 않는다)
--  - unhide: hidden → 공개 동의가 있으면 published, 없으면 private
--  - delete: 글을 지우고 묘비로(deleted_by admin — 회원이 다시 쓸 수 없다)
--  - feature · unfeature: 메인 우선 노출 지정 · 해제(공개 중인 후기만 지정할 수 있다)
--  - dismiss_reports: 후기는 그대로 두고 열린 신고만 닫는다
-- 숨김 · 삭제 · 신고 기각은 그 후기의 열린 신고를 처리됨으로 닫는다. 이 함수는 운영 기록(ops_events)을 남기지 않는다 — 서버가 후기 번호만 남긴다.
create or replace function public.review_admin_apply(p_review uuid, p_action text, p_reason text, p_memo text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews%rowtype;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  select * into r from public.reviews where id = p_review for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;

  if p_action = 'hide' then
    if r.status not in ('published', 'private') then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set status = 'hidden', hidden_reason = p_reason, hidden_at = now() where id = r.id;
  elsif p_action = 'unhide' then
    if r.status <> 'hidden' then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set status = case when public_consent then 'published' else 'private' end, hidden_reason = null, hidden_at = null where id = r.id;
  elsif p_action = 'delete' then
    if r.status = 'deleted' then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews
       set status = 'deleted', body = '', public_consent = false, consented_at = null, featured = false, featured_at = null,
           deleted_by = 'admin', deleted_at = now(), hidden_reason = p_reason, hidden_at = coalesce(hidden_at, now())
     where id = r.id;
  elsif p_action = 'feature' then
    if r.status <> 'published' or not r.public_consent or r.featured then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set featured = true, featured_at = now() where id = r.id;
  elsif p_action = 'unfeature' then
    if not r.featured then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set featured = false, featured_at = null where id = r.id;
  elsif p_action = 'dismiss_reports' then
    if not exists (select 1 from public.review_reports where review_id = r.id and handled_at is null) then
      return jsonb_build_object('ok', false, 'reason', 'invalid-state');
    end if;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid-state');
  end if;

  insert into public.review_admin_log (review_id, admin_id, action, reason_code, memo) values (r.id, p_admin, p_action, p_reason, v_memo);
  if p_action in ('hide', 'delete', 'dismiss_reports') then
    update public.review_reports set handled_at = now(), handled_action = p_action where review_id = r.id and handled_at is null;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_review_report(uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_admin_apply(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_review_report(uuid, text, text) to service_role;
grant execute on function public.review_admin_apply(uuid, text, text, text, uuid) to service_role;

-- ─────────────────────────────────────────────
-- 5. 탈퇴하면 이 회원의 후기를 지운다(묘비 · 이력 · 신고 포함) — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다
-- ─────────────────────────────────────────────

create or replace function public.reviews_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    delete from public.reviews where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_reviews_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.reviews_on_withdraw();

revoke all on function public.reviews_on_withdraw() from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- 6. 방문 단계 이름 확장 — 메인 후기 영역이 화면에 보임(review_section_view) · 전체 후기 클릭(review_all_click)
-- ─────────────────────────────────────────────
-- 허용하는 단계 이름을 하나씩 나열한 검사를 유지한다(결제 이벤트 같은 이름은 받지 않는다). 8번의 다섯 이름 + 새 이름 둘. 서버 코드(FUNNEL_EVENT_NAMES)와 같은 목록이다.
alter table public.funnel_events drop constraint if exists funnel_events_name_check;
alter table public.funnel_events add constraint funnel_events_name_check
  check (name in ('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view', 'review_section_view', 'review_all_click'));

-- ═════════════════════════════════════════════════════════════════
-- 끝 확인 — 하나라도 어긋나면 위의 모든 변경이 취소된다
-- ═════════════════════════════════════════════════════════════════
do $verify$
declare
  def text;
begin
  if to_regclass('public.reviews') is null or to_regclass('public.review_admin_log') is null or to_regclass('public.review_reports') is null then raise exception '끝 확인 실패 — 후기 표가 없습니다'; end if;
  if (select count(*) from pg_class where oid in (to_regclass('public.reviews'), to_regclass('public.review_admin_log'), to_regclass('public.review_reports')) and relrowsecurity) <> 3 then raise exception '끝 확인 실패 — 행 단위 접근 제한(RLS)이 모두 켜지지 않았습니다'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reviews') <> 1 or (select count(*) from pg_policies where schemaname = 'public' and tablename in ('review_admin_log', 'review_reports')) <> 0 then raise exception '끝 확인 실패 — 정책이 예상과 다릅니다'; end if;
  if has_table_privilege('anon', 'public.reviews', 'select') or has_table_privilege('anon', 'public.review_admin_log', 'select') or has_table_privilege('anon', 'public.review_reports', 'select') then raise exception '끝 확인 실패 — anon이 후기 표를 읽을 수 있습니다'; end if;
  if not has_table_privilege('authenticated', 'public.reviews', 'select') or has_table_privilege('authenticated', 'public.reviews', 'insert') or has_table_privilege('authenticated', 'public.reviews', 'update') or has_table_privilege('authenticated', 'public.reviews', 'delete') or has_table_privilege('authenticated', 'public.review_admin_log', 'select') or has_table_privilege('authenticated', 'public.review_reports', 'select') then raise exception '끝 확인 실패 — authenticated 권한이 예상과 다릅니다'; end if;
  if not (has_table_privilege('service_role', 'public.reviews', 'insert') and has_table_privilege('service_role', 'public.review_admin_log', 'insert') and has_table_privilege('service_role', 'public.review_reports', 'update')) then raise exception '끝 확인 실패 — service_role 권한이 부족합니다'; end if;
  if not (has_function_privilege('service_role', 'public.submit_review_report(uuid,text,text)', 'execute') and has_function_privilege('service_role', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute'))
     or has_function_privilege('anon', 'public.submit_review_report(uuid,text,text)', 'execute') or has_function_privilege('authenticated', 'public.submit_review_report(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') or has_function_privilege('authenticated', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') then
    raise exception '끝 확인 실패 — 함수 실행 권한이 예상과 다릅니다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) then raise exception '끝 확인 실패 — 탈퇴 트리거가 없습니다'; end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check';
  if def is null or def not like '%review_section_view%' or def not like '%review_all_click%' then raise exception '끝 확인 실패 — 방문 단계 이름 검사가 바뀌지 않았습니다'; end if;
  if (select count(*) from public.reviews) <> 0 then raise exception '끝 확인 실패 — 후기가 만들어졌습니다'; end if;
end
$verify$;

commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 25번 적용 결과 (읽기 전용 — supabase/review-25-postcheck.sql과 같다. 아무것도 바꾸지 않는다)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) DB 변경 25번(후기) — 적용 뒤 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 25번(supabase/apply-25-reviews.sql)을 실행한 직후, 같은 테스트 전용 프로젝트의 SQL Editor에서 이 파일을 붙여넣고 Run. "판정"이 모두 "OK"여야 한다.
-- 앱이 후기 화면을 열 수 있는지(PostgREST가 새 표를 알아보는지)는 이 파일이 아니라 앱 화면 · API 목록으로 따로 확인한다 — 마지막 "참고" 줄의 안내를 본다.

with
r as (
  select * from (values
    (1, '표 reviews · review_admin_log · review_reports 생성',
      case when to_regclass('public.reviews') is not null and to_regclass('public.review_admin_log') is not null and to_regclass('public.review_reports') is not null then 'OK' else '이상' end, ''),
    (2, '세 표 모두 행 단위 접근 제한(RLS) 켜짐',
      case when (select count(*) from pg_class where oid in (to_regclass('public.reviews'), to_regclass('public.review_admin_log'), to_regclass('public.review_reports')) and relrowsecurity) = 3 then 'OK' else '이상' end, ''),
    (3, '정책: reviews는 본인 조회 정책 하나, 나머지 두 표는 정책 없음(서버만)',
      case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reviews') = 1
            and (select count(*) from pg_policies where schemaname = 'public' and tablename in ('review_admin_log', 'review_reports')) = 0 then 'OK' else '이상' end,
      (select coalesce(string_agg(tablename || ':' || policyname, ' / '), '없음') from pg_policies where schemaname = 'public' and tablename in ('reviews', 'review_admin_log', 'review_reports'))),
    (4, '권한: anon은 세 표에 아무 권한도 없다',
      case when not (has_table_privilege('anon', 'public.reviews', 'select') or has_table_privilege('anon', 'public.review_admin_log', 'select') or has_table_privilege('anon', 'public.review_reports', 'select')
                  or has_table_privilege('anon', 'public.reviews', 'insert')) then 'OK' else '이상' end, ''),
    (5, '권한: authenticated는 reviews를 조회만(쓰기 없음), 나머지 두 표는 권한 없음',
      case when has_table_privilege('authenticated', 'public.reviews', 'select') and not has_table_privilege('authenticated', 'public.reviews', 'insert') and not has_table_privilege('authenticated', 'public.reviews', 'update') and not has_table_privilege('authenticated', 'public.reviews', 'delete')
            and not has_table_privilege('authenticated', 'public.review_admin_log', 'select') and not has_table_privilege('authenticated', 'public.review_reports', 'select') then 'OK' else '이상' end, ''),
    (6, '권한: service_role은 reviews 읽기 · 쓰기 · 지우기, 이력은 읽기 · 쌓기, 신고는 읽기 · 쌓기 · 갱신',
      case when has_table_privilege('service_role', 'public.reviews', 'select') and has_table_privilege('service_role', 'public.reviews', 'insert') and has_table_privilege('service_role', 'public.reviews', 'update') and has_table_privilege('service_role', 'public.reviews', 'delete')
            and has_table_privilege('service_role', 'public.review_admin_log', 'insert') and has_table_privilege('service_role', 'public.review_reports', 'update') then 'OK' else '이상' end, ''),
    (7, '함수 submit_review_report · review_admin_apply: service_role만 실행(anon · authenticated · public 불가)',
      case when has_function_privilege('service_role', 'public.submit_review_report(uuid,text,text)', 'execute') and has_function_privilege('service_role', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute')
            and not has_function_privilege('anon', 'public.submit_review_report(uuid,text,text)', 'execute') and not has_function_privilege('authenticated', 'public.submit_review_report(uuid,text,text)', 'execute')
            and not has_function_privilege('anon', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') and not has_function_privilege('authenticated', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') then 'OK' else '이상' end, ''),
    (8, '탈퇴 트리거 profiles_reviews_withdraw (프로필 withdrawn_at 갱신 뒤) 있음 · 함수는 외부 실행 불가',
      case when exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) and not has_function_privilege('authenticated', 'public.reviews_on_withdraw()', 'execute') and not has_function_privilege('anon', 'public.reviews_on_withdraw()', 'execute') then 'OK' else '이상' end, ''),
    (9, '방문 단계 이름 검사가 7개 나열형으로 바뀜(결제 이벤트 같은 이름은 계속 거절)',
      case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') like '%review_section_view%'
            and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') like '%review_all_click%'
            and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') not like '%payment%' then 'OK' else '이상' end,
      coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check'), '제약 없음')),
    (10, '아무 후기도 만들어지지 않았다(적용만으로는 아무것도 생기지 않는다)',
      case when (select count(*) from public.reviews) = 0 and (select count(*) from public.review_admin_log) = 0 and (select count(*) from public.review_reports) = 0 then 'OK' else '이상' end,
      'reviews ' || (select count(*) from public.reviews) || ' · 이력 ' || (select count(*) from public.review_admin_log) || ' · 신고 ' || (select count(*) from public.review_reports)),
    (11, '기존 데이터가 그대로다(프로필 · 방문 단계 행 수 — 적용 전에 저장해 둔 값과 비교)', '참고',
      'profiles ' || (select count(*) from public.profiles) || ' · funnel_events ' || (select count(*) from public.funnel_events)),
    (12, '앱 쪽 확인(이 파일로는 알 수 없다)', '참고',
      '앱이 /my/reviews에서 "후기 준비 중"이 사라졌는지 확인한다. 그래도 남으면 PostgREST 스키마 캐시를 다시 읽게 한다: SQL Editor에서  notify pgrst, ''reload schema'';  (읽기 전용이 아니므로 이 파일에는 넣지 않았다)')
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from r
union all
select 99, '종합', case when exists (select 1 from r where verdict = '이상') then '이상 — 결과를 그대로 알려 달라(임의로 다시 실행하지 않는다)' else 'OK — 25번이 적용됐다' end, '이상 ' || (select count(*) from r where verdict = '이상') || '개'
order by 1;
