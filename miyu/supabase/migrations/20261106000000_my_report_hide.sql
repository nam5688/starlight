-- MY 목록에서 리포트(분석 결과) 숨기기 · 다시 보이게 하기 — 마이그레이션 27번. 파일만 준비한 것이며 어떤 DB에도 적용하지 않았다(운영자 승인 후 적용).
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 19~22번 · 25번 같은 다른 미적용 변경에 기대지 않는다(앞 번호 가운데 1~18번만 있으면 된다 — 26번 없이도 적용된다).
--
-- 이 변경이 하는 것: 검사 결과(assessments)에 "MY 목록에서 숨긴 시각"(my_hidden_at) 열 하나를 더하고, 본인 것만 숨기고 되돌리는 함수 하나를 더한다.
--   · 숨기기는 MY의 "내 리포트" 목록 표시만 바꾼다. 검사 결과 · 리포트 · 주문 · 결제 · 질문권 · 채팅 대화 · 동의 기록 · 맛보기 사용 기록 · 열람 권한은 읽지도 쓰지도 않는다.
--   · 회원 탈퇴가 아니다. 탈퇴 표시(withdrawn_at)와 다른 열을 쓰고, 이 열은 어느 권한 판단에도 쓰이지 않는다.
--   · 값이 비어 있으면(null) 숨기지 않은 것이다. 기존 행은 모두 null이라 이 파일을 실행하는 것만으로는 아무 화면도 바뀌지 않는다.
--   · 언제든 다시 보이게 할 수 있다(복원 = 열을 null로). 지우는 문장은 없다.
-- 접근: 새 권한을 넓히지 않는다. 로그인 회원(authenticated)은 기존처럼 본인 행 조회만 되고(기존 표 단위 조회 권한이 새 열에도 적용된다), 쓰기 권한은 주지 않는다.
--   바꾸는 일은 서버(service_role)만 아래 함수로 한다. 함수가 회원번호와 검사 결과 번호가 짝이 맞는지(본인 것인지) 다시 확인한다.
-- 코드를 먼저 배포해도 깨지지 않는다: 이 열이 없으면 MY는 숨기기 버튼을 보이지 않고 모든 리포트를 예전처럼 보인다.

alter table public.assessments
  add column my_hidden_at timestamptz;

-- 본인 검사 결과 하나를 MY 목록에서 숨기거나 다시 보이게 한다. 같은 요청을 여러 번(동시에도) 보내도 결과가 같다.
--   반환: 'changed'(바뀜) · 'unchanged'(이미 그 상태) · 'not_found'(없거나 본인 것이 아님 — 둘을 구분해 알리지 않는다)
--   숨길 때의 시각은 처음 숨긴 때를 그대로 둔다. 탈퇴 처리된(내용이 비워진) 검사 결과는 다루지 않는다.
create or replace function public.set_assessment_my_hidden(p_user_id uuid, p_assessment_id uuid, p_hidden boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed int;
begin
  if p_user_id is null or p_assessment_id is null or p_hidden is null then
    return 'not_found';
  end if;

  if p_hidden then
    update public.assessments
       set my_hidden_at = now()
     where id = p_assessment_id and user_id = p_user_id and withdrawn_at is null and my_hidden_at is null;
  else
    update public.assessments
       set my_hidden_at = null
     where id = p_assessment_id and user_id = p_user_id and withdrawn_at is null and my_hidden_at is not null;
  end if;
  get diagnostics v_changed = row_count;
  if v_changed > 0 then
    return 'changed';
  end if;

  if exists (select 1 from public.assessments where id = p_assessment_id and user_id = p_user_id and withdrawn_at is null) then
    return 'unchanged';
  end if;
  return 'not_found';
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.set_assessment_my_hidden(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_assessment_my_hidden(uuid, uuid, boolean) to service_role;
