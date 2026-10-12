-- ME:U(미유) 나를 더 반영하기 (선택 입력)
-- 앞의 마이그레이션 4개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다.
--
-- - 검사 결과 하나에 하나: 지금 고민 · 반복되는 상황 · 이전 풀이에서 맞았던/달랐던 점 · 대화 일부
-- - 리포트를 만들 때 해석의 초점과 예시를 고르는 데만 쓴다 (사주 계산은 바뀌지 않는다)
-- - 고객이 직접 보고 · 고치고 · 지울 수 있다 (지우면 행이 삭제된다)
-- - 브라우저는 본인 것 조회만, 쓰기 · 지우기는 서버가 소유자를 확인한 뒤에

create table public.personal_contexts (
  assessment_id uuid primary key references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (topic in ('love', 'marriage', 'relationship', 'work', 'money', 'self', 'other')),
  question text not null default '' check (char_length(question) <= 300),
  situation text not null default '' check (char_length(situation) <= 300),
  matched text not null default '' check (char_length(matched) <= 300),
  differed text not null default '' check (char_length(differed) <= 300),
  excerpt text not null default '' check (char_length(excerpt) <= 1500),
  -- 리포트 해석에 쓰는 데 동의한 시각 (선택 항목 동의)
  agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_contexts_user_idx on public.personal_contexts (user_id);

create trigger personal_contexts_updated_at before update on public.personal_contexts
  for each row execute function public.set_updated_at();

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.personal_contexts_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'personal context owner mismatch';
  end if;
  return new;
end;
$$;

create trigger personal_contexts_owner before insert or update on public.personal_contexts
  for each row execute function public.personal_contexts_owner_check();

alter table public.personal_contexts enable row level security;

create policy "본인 반영 정보 조회" on public.personal_contexts
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.personal_contexts from anon, authenticated;
revoke select on public.personal_contexts from anon;

-- 필요한 권한은 직접 준다: 브라우저는 조회, 서버는 조회 · 저장 · 수정 · 삭제
grant select on public.personal_contexts to authenticated;
grant select, insert, update, delete on public.personal_contexts to service_role;
