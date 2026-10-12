-- ME:U(미유) 가입 동의 기록
-- 첫 번째 마이그레이션(20261011000000_init.sql)을 실행한 뒤, SQL Editor에서 이 파일도 한 번 실행한다.
--
-- - 동의·철회 기록은 지우지 않고 쌓는다 (항목별 최신 기록이 현재 상태)
-- - 약관 버전을 함께 남겨, 약관이 바뀌면 다시 동의를 받는다
-- - 브라우저는 본인 기록 조회만, 기록은 서버만 쓴다

create table public.user_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null check (consent_type in ('age_14', 'terms', 'privacy', 'marketing')),
  version text not null check (char_length(version) between 1 and 40),
  agreed boolean not null,
  created_at timestamptz not null default now()
);

create index user_consents_user_idx on public.user_consents (user_id, consent_type, created_at desc);

-- 기록은 고치거나 지울 수 없다 (회원 삭제 시에만 함께 삭제)
create or replace function public.user_consents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'consent records are append-only';
end;
$$;

create trigger user_consents_no_update before update on public.user_consents
  for each row execute function public.user_consents_guard();

alter table public.user_consents enable row level security;

create policy "본인 동의 기록 조회" on public.user_consents
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.user_consents from anon, authenticated;
revoke select on public.user_consents from anon;

-- 필요한 권한은 직접 준다 (프로젝트 기본 권한 설정과 관계없이): 브라우저는 조회, 서버는 조회 · 추가만
grant select on public.user_consents to authenticated;
grant select, insert on public.user_consents to service_role;
grant usage, select on sequence public.user_consents_id_seq to service_role;
