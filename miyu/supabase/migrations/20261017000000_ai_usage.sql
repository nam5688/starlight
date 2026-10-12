-- ME:U(미유) AI 사용 기록 — 리포트를 만들 때 부른 AI 호출의 횟수 · 토큰 · 예상 비용 · 결과를 쌓는다.
-- 앞의 마이그레이션 6개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다.
--
-- - 서버만 쓰고 읽는다 (브라우저 권한으로는 보이지 않는다)
-- - 지우거나 고치지 않고 쌓는다
-- - 요청 · 응답 내용 (이름 · 생년월일 · 답변 · 고민 · 리포트 문장)은 담지 않는다. 호출의 크기와 결과만 남긴다
-- - report_id에는 외래 키를 걸지 않는다 (쌓기만 하는 표라서 리포트가 지워져도 기록은 남는다)

create table public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  report_id uuid,
  provider text not null check (char_length(provider) between 1 and 60),
  model text not null check (char_length(model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  -- 예상 비용 (원). 토큰 단가를 설정하기 전에는 비어 있다
  est_cost_krw numeric(14, 4) check (est_cost_krw is null or est_cost_krw >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  -- ok: 형식 검사 통과 · invalid: 응답은 왔지만 형식 검사 실패 · timeout: 시간 초과 · error: 그 밖의 호출 오류
  outcome text not null check (outcome in ('ok', 'invalid', 'timeout', 'error')),
  error_code text check (error_code is null or char_length(error_code) <= 60)
);

create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_report_idx on public.ai_usage (report_id) where report_id is not null;

create or replace function public.ai_usage_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ai usage records are append-only';
end;
$$;

create trigger ai_usage_no_update before update on public.ai_usage
  for each row execute function public.ai_usage_guard();

alter table public.ai_usage enable row level security;
-- 정책을 두지 않는다 = 로그인한 사용자 · 비로그인은 접근할 수 없다 (서버 비밀키만 접근)

revoke all on public.ai_usage from anon, authenticated;
grant select, insert on public.ai_usage to service_role;
grant usage, select on sequence public.ai_usage_id_seq to service_role;

-- 용량 점검(생성 중 · 대기 중 리포트 수)과 하루 검사 수 제한에 쓰는 색인
create index if not exists reports_status_updated_idx on public.reports (status, updated_at);
create index if not exists assessments_user_created_idx on public.assessments (user_id, created_at desc);
