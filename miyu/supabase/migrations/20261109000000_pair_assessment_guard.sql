-- 리포트 궁합 쌍(pairs) × 기록 삭제가 같은 순간 겹칠 때의 무결성 장치. 마이그레이션 30번.
-- 규칙: 더하기만 한다 — 28 · 29번 파일은 고치지 않고, 이 파일이 새 트리거 하나 + pair_join 함수의 새 정의만 더한다(데이터는 바꾸지 않는다).
--
-- 문제(로컬 DB에서 동시 트랜잭션 두 줄로 재현했다 — supabase/tests/pair-purge.db.test.ts):
--   pairs는 검사 결과(assessments)를 외래 키로 묶지 않는다(24번 주석: 회원 탈퇴가 주문 없는 검사 결과를 지우는데 그때 이 표가 탈퇴를 막으면 안 되기 때문).
--   그래서 쌍을 만드는 쪽(insert)과 수락하는 쪽(pair_join의 update)은 검사 결과 행을 잠그지 않고,
--   29번 삭제 함수(delete_assessment_record_v2)의 "쌍이 이 결과를 가리키면 분석 원자료를 남긴다" 확인(select exists ...)은
--   아직 커밋하지 않은 쌍을 볼 수 없다. 그 결과
--     ① 삭제가 결과 행을 잠근 채 원자료를 비우는 동안 새 쌍이 만들어지거나(쌍 만들기는 기다리지 않는다)
--     ② 쌍 만들기 트랜잭션이 끝나기 전에 삭제가 확인을 마치고 원자료를 비우면
--   "원자료(생년월일 · 응답 · 사주)가 빈 값인 분석을 새 쌍이 가리키는" 상태가 남을 수 있었다(그 쌍으로 궁합을 만들면 빈 자료로 계산한다).
--   앱은 쌍을 만들기 전에 삭제 여부를 읽어 확인하지만 읽기와 쓰기 사이에 삭제가 끼어들 수 있고, DB는 이를 막지 못했다.
--
-- 장치: 28 · 29번의 대화 · 주문 · 리포트 차단과 같은 방식이다.
--   · 쌍이 결과를 가리키는 순간(만들기 · 수락 · 결과 번호 변경)에 그 검사 결과 행을 for share로 읽는다 — 삭제 함수의 for update와 같은 행이라
--       삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단하고(삭제를 마친 결과면 거절),
--       쌍이 먼저면 삭제 함수가 그 쌍이 커밋될 때까지 기다린 뒤 쌍을 보고 원자료를 남긴다.
--   · 이미 삭제한 결과(28번 범위: record_deleted_at, 29번 범위: record_purged_at)를 가리키는 쌍은 만들 수 없다 — 순서가 겹치지 않아도 DB가 지킨다.
--   · 결과 번호를 바꾸지 않는 갱신(연결 해제 · 동의 철회 · 탈퇴 반응)은 막지 않는다 — 한쪽이 기록을 삭제한 뒤에도 기존 쌍은 정리할 수 있다.
--   · 없는 결과(회원 탈퇴로 지워진 번호)를 가리키는 쌍은 예전처럼 허용한다(외래 키가 없는 설계는 그대로).
--   · 잠금은 공유 잠금(for share)뿐이라 쌍끼리는 서로 기다리지 않는다. 삭제 함수는 결과 행 하나만 잠그고 쌍 행은 잠그지 않으므로(읽기만) 서로 기다리는 순환이 없다.
--       (pair_join은 쌍 행 → 결과 행 순서로 잠근다. 이 순서를 거꾸로 잡는 곳은 없다 — 탈퇴 함수는 상대가 들어오기 전의 쌍 행을 건드리지 않는다.)
--
-- 보존: 이미 만들어진 쌍 · 연결 · 완성된 글 · 다른 회원의 자료 · 질문권은 바뀌지 않는다. 이 파일은 새 쌍이 지워진 결과를 가리키지 못하게만 한다.
--       이미 이 상태(원자료가 비어 있는데 쌍이 가리킴)가 된 행이 있는지는 supabase/pair-assessment-guard-30-precheck.sql로 읽어서 확인한다(읽기 전용).
-- 선행조건: 24번(pairs) · 29번(record_purged_at)이 적용돼 있어야 한다. 없으면 아래에서 멈춘다(아무것도 바꾸지 않는다).

do $$
begin
  if to_regclass('public.pairs') is null then
    raise exception '30번은 24번(리포트 궁합, pairs 표)을 먼저 적용해야 합니다';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at'
  ) then
    raise exception '30번은 29번(기록 삭제 범위 확대, assessments.record_purged_at)을 먼저 적용해야 합니다';
  end if;
end;
$$;

-- 쌍이 가리키는 검사 결과가 삭제 중이거나 삭제를 마쳤으면 거절한다 -----------------------------------------------------------------------------------
create or replace function public.pairs_block_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
  v_purged timestamptz;
begin
  -- 만들 때는 두 자리 모두, 바꿀 때는 번호가 달라진 자리만 본다(번호를 바꾸지 않는 갱신은 지나간다)
  if tg_op = 'INSERT' or new.a_assessment_id is distinct from old.a_assessment_id then
    -- 삭제 함수와 같은 행을 잠그는 읽기(for share) — 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단한다 (읽는 것은 삭제 시각 둘뿐이다)
    select a.record_deleted_at, a.record_purged_at into v_deleted, v_purged
      from public.assessments a where a.id = new.a_assessment_id for share;
    if v_purged is not null then
      raise exception 'record_purged';
    end if;
    if v_deleted is not null then
      raise exception 'record_deleted';
    end if;
  end if;
  if new.b_assessment_id is not null and (tg_op = 'INSERT' or new.b_assessment_id is distinct from old.b_assessment_id) then
    select a.record_deleted_at, a.record_purged_at into v_deleted, v_purged
      from public.assessments a where a.id = new.b_assessment_id for share;
    if v_purged is not null then
      raise exception 'record_purged';
    end if;
    if v_deleted is not null then
      raise exception 'record_deleted';
    end if;
  end if;
  return new;
end;
$$;

create trigger pairs_block_deleted_record before insert or update of a_assessment_id, b_assessment_id on public.pairs
  for each row execute function public.pairs_block_deleted_record();

revoke all on function public.pairs_block_deleted_record() from public, anon, authenticated;

-- pair_join: 24번 정의와 같고, 상대의 결과를 for share로 읽으며 삭제한 결과는 'bad-assessment'로 돌려준다(위 트리거 전에 깨끗한 상태 값으로 거절) --------------------------
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
  v_deleted timestamptz;
  v_purged timestamptz;
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
  -- 상대의 결과 행을 공유 잠금으로 읽는다: 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단하고, 이 수락이 먼저면 삭제가 이 수락이 끝날 때까지 기다린다
  select user_id, withdrawn_at, record_deleted_at, record_purged_at into v_owner, v_withdrawn, v_deleted, v_purged
    from public.assessments where id = p_assessment for share;
  if v_owner is null or v_owner <> p_user or v_withdrawn is not null or v_deleted is not null or v_purged is not null then
    return jsonb_build_object('status', 'bad-assessment');
  end if;
  update public.pairs
     set b_user_id = p_user, b_assessment_id = p_assessment, b_consent_at = now(), b_consent_version = p_consent_version, status = 'linked'
   where id = v.id;
  return jsonb_build_object('status', 'joined', 'pair', v.id);
end;
$$;

-- 권한은 24번과 같다(서버만 부를 수 있다). create or replace는 기존 권한을 유지하지만 의도를 한 번 더 적어 둔다
revoke all on function public.pair_join(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pair_join(text, uuid, uuid, text) to service_role;
