# 기록 삭제 범위 확대 — DB 변경 29번 (연결된 채팅방 · 대화 · 요약까지 함께 삭제)

> 상태(2026-10-19): **로컬 시험 DB에서만 적용 · 시험했다. 외부(테스트 · 운영) DB에는 적용하지 않았다** — 이 문서의 SQL 전문 · 영향 · 순서를 root(운영자)가 검토한 뒤, 테스트 전용 프로젝트(`wdvrwwajakjdfrajgxcm`)에 적용한다. 운영 DB 적용은 별도 승인이다.
> 기존 28번(`20261107000000_record_delete.sql`)은 이미 외부 테스트 DB에 적용돼 있으므로 **한 글자도 고치지 않았다.** 29번은 새 파일이다.
> 실제 AI 호출 0 · 실결제 0 · 실제 사용자 기록 삭제 0 (시험은 모두 가상 계정 · 가상 데이터).

## 1. 무엇이 달라지나

MY "내 리포트"의 **기록 삭제**를 확정하면, 그 검사 결과에 연결된 **채팅방 · 나눈 대화 · 저장한 채팅 요약 · 읽기용 대화 기록**도 함께 지운다.
28번은 대화를 "읽기용 대화 기록"으로 옮겨 남기고 분석 원자료도 남겼다. 29번은 그 남기는 부분을 없앤다.

| | 28번(예전 범위) | 29번(새 범위) |
| --- | --- | --- |
| 개인 통합 리포트 · 고민 반영 리포트 본문(만족도 의견 포함) | 지움 | 지움 |
| 맛보기 글 · 고민 입력 · 고민 기록 | 지움(맛보기는 줄만 남겨 무료 한 번이 다시 생기지 않음) | 같음 |
| 채팅방(`talk_rooms.actions` = 나눈 대화) | **읽기용 기록으로 옮기고** 방 줄은 정리 | **지움** (옮기지 않음) |
| 저장한 채팅 요약(`chat_summaries.items` = 질문 · 답) | 남음 | **지움** |
| 읽기용 대화 기록(`talk_transcripts.lines`) | 새로 만들어 남음 | **지움** (이 결과의 것) |
| 분석 원자료(`assessments`의 닉네임 · 생년월일 · 응답 · 계산 결과) | 남음(채팅이 이어지도록) | **비움** — 단, 리포트 궁합 쌍(`pairs`)이 이 결과를 가리키면 그 궁합이 쓰는 동안 남김 |
| 질문권(지갑 · 묶음 장부 · `cash_ledger`) | 남음 | 남음 |
| 채팅 질문 횟수(`chat_questions`) | 남음 | 남음 |
| 주문 · 결제 · 환불 증빙 · 계정 · 동의 | 남음 | 남음 |
| 다른 분석 결과 · 사주 궁합 · 리포트 궁합 · AI 사용 기록(토큰 수뿐) | 남음 | 남음 |
| 삭제 이후 | 채팅은 이어진다(읽기용 기록 + 새 대화) | **채팅방도 열리지 않는다** (삭제 안내만) |

**이미 28번 범위로 삭제한 기록은 소급해서 정리하지 않는다**(함수는 `unchanged`를 돌려주고 아무것도 바꾸지 않는다). 그 기록의 채팅방 · 읽기용 기록은 지금처럼 남고 MY "삭제한 기록"에 계속 나온다. 소급 정리가 필요한지는 운영자 결정 항목이다(10장).

## 2. 대화 "내용"과 "사용 이력"의 구분 (열 구성으로 확인)

| 표 | 내용을 담는 열 | 29번 처리 |
| --- | --- | --- |
| `talk_rooms` | `actions`(눌렀던 행동 · 직접 쓴 질문 · 미유의 답) | 이 결과의 줄 전부 삭제 |
| `chat_summaries` | `items`(요약된 질문 · 답) | 이 결과의 줄 전부 삭제 |
| `talk_transcripts` | `lines`(화면에 표시됐던 말) | 이 결과의 줄 전부 삭제 |
| `chat_questions` | **없음** — `user_id` · `assessment_id` · `room_key` · `created_at` · `state` · `reserved_until` | 그대로(질문 횟수 · 무료 한도 계산에 필요) |
| `cash_ledger` · `question_packs` · `cash_wallets` | **없음** — 개수 · 참조번호 · 시각뿐 | 그대로(잔액 · 환불 계산에 필요) |
| `ai_usage` | **없음** — 토큰 수 · 모델 · 비용 어림뿐 | 그대로 |
| `report_feedback` | 만족도 의견 | 리포트 삭제 때 연쇄로 지워짐(28번과 같음) |
| `reviews`(DB 25번, 후기) | 후기 글 | **건드리지 않음** — 이용 건당 별도 표이고 `assessments` · `reports`에 FK가 없다(사용자가 쓴 후기는 후기 화면에서 따로 지운다) |

시험이 `chat_questions` 줄에 질문 · 답 · 본문에 해당하는 열이 없음을 확인한다(`record-purge.db.test.ts` 첫 번째 시험).

## 3. 한 번 삭제하면 되살아나지 않게 하는 장치

1. **DB 트리거 4개** — `record_purged_at`이 찍힌 결과에는 `talk_rooms`(넣기 · 고치기) · `chat_summaries` · `talk_transcripts` · `chat_questions`(넣기)가 `record_purged` 오류로 거절된다. 삭제 직전에 열려 있던 화면의 늦은 저장 · 늦게 도착한 AI 답 · 직접 호출이 모두 걸린다.
2. **행 잠금** — 삭제 함수가 검사 결과 행을 `for update`로 잠그고, 트리거는 같은 행을 `for share`로 읽는다. 삭제와 같은 순간 들어온 저장은 삭제가 끝날 때까지 기다린 뒤 거절된다(시험: 삭제 트랜잭션을 2초 붙잡고 동시에 넣어 확인).
3. **앱 게이트** — `owns()`(대화 읽기 · 쓰기 · 질문 · 요약의 소유 확인)가 삭제를 마친 기록을 "없는 기록"으로 다룬다. 결과 화면 · 채팅방 주소는 삭제 안내만 보이고 채팅방은 열리지 않는다. 리포트 · 주문 경로는 28번 장치가 그대로 막는다.
4. **하나의 트랜잭션** — 함수 하나가 한 번에 처리해 중간까지만 지워진 상태가 남지 않는다. 같은 요청을 여러 번(동시에도) 보내면 한 번만 처리하고 나머지는 `unchanged`다.

## 4. 마이그레이션 전문

`supabase/migrations/20261108000000_record_delete_scope.sql` (아래는 파일 그대로다):

```sql
-- 리포트 기록 삭제 범위 확대 — 마이그레이션 29번(운영자 요청 2026-10-19). 로컬 시험 DB에서만 적용해 시험했고 외부(테스트 · 운영) DB에는 적용하지 않았다(운영자가 스키마 · 권한 · 데이터 영향을 검토한 뒤 적용).
-- 규칙: 더하기만 한다 — 28번(record_delete) 파일과 그 함수 delete_assessment_record는 한 글자도 바꾸지 않고 그대로 둔다(이미 삭제한 기록은 소급해서 정리하지 않는다).
-- 앞 번호 가운데 28번까지 있으면 적용된다 — 19~22번 · 25번 · 27번 같은 다른 미적용 변경에 기대지 않는다(리포트 궁합 표 pairs는 있을 때만 확인한다).
-- 이 파일을 실행하는 것만으로는 어떤 데이터도 지워지거나 바뀌지 않는다. 데이터는 회원이 MY에서 "기록 삭제"를 직접 확정했을 때, 아래 새 함수가 그 회원의 그 기록에 한해서만 처리한다.
--
-- 28번과 달라지는 점 (화면의 확인창 문구와 같다)
--   28번 함수(예전 범위): 리포트 · 맛보기 · 고민은 지우고 채팅방 대화는 "읽기용 대화 기록"으로 옮겨 남기며 채팅 요약 · 분석 원자료도 남긴다.
--   새 함수(삭제 범위 확대): 위에 더해 이 결과의 채팅방 · 나눈 대화 · 저장한 채팅 요약 · 읽기용 대화 기록도 지운다. 분석 원자료는 대화를 이어 가려고 남기던 것이라, 다른 서비스가 쓰고 있지 않으면 함께 비운다.
--   지운다(복구할 수 없다): 개인 통합 리포트 · 고민 반영 리포트의 본문(만족도 의견 포함) · 맛보기 글 · 고민 입력 · 고민 기록 · 채팅방(talk_rooms의 행동 목록 = 대화 내용) · 저장한 채팅 요약(chat_summaries의 질문 · 답) ·
--                          읽기용 대화 기록(talk_transcripts) · 분석 원자료(assessments의 닉네임 · 생년월일 · 응답 · 계산 결과 — 리포트 궁합 쌍(pairs)이 이 결과를 가리키고 있으면 그 궁합이 쓰는 동안 남긴다)
--   남긴다: 계정 · 가입 동의 · 주문 · 결제 · 환불 기록(결제 증빙) · 질문권(지갑 · 묶음 장부 · cash_ledger — 질문 내용 없이 개수 · 참조번호 · 시각뿐) · 채팅 질문 횟수(chat_questions — 내용 없이 누가 · 언제 · 어느 방만) ·
--           다른 분석 결과 · 사주 궁합 · 리포트 궁합 · AI 사용 기록(토큰 수뿐) · 맛보기 줄(글만 비우고 줄은 남겨 무료 한 번이 다시 생기지 않는다) · 삭제 표시(assessments.record_deleted_at) · 이 파일의 삭제 완료 표시(record_purged_at)
--
-- 내용과 사용 이력의 구분(운영자 요청): 대화 "내용"이 들어 있는 곳은 talk_rooms.actions · chat_summaries.items · talk_transcripts.lines 셋뿐이고 모두 지운다.
--   chat_questions · cash_ledger · question_packs · ai_usage에는 질문 · 답이 없다(열 구성으로 확인) — 개수 · 시각 · 참조번호만 있는 사용 이력이라 그대로 남긴다. 질문권 잔액과 환불 계산이 이 이력에 기대기 때문이다.
--
-- 삭제 뒤에 대화가 되살아나지 않게 하는 장치: 삭제 완료 표시(record_purged_at)가 있는 검사 결과에는 talk_rooms · chat_summaries · talk_transcripts · chat_questions에 새 줄을 넣거나(방은 고치는 것도) 할 수 없다 —
--   삭제 직전에 열려 있던 대화 화면의 늦은 저장 · 늦게 도착한 AI 답 · 직접 호출도 이 장치에 걸린다(앱 코드도 먼저 막지만 DB가 마지막으로 보장한다).
--
-- 코드를 먼저 배포해도 깨지지 않는다: 이 함수가 없으면 앱은 28번의 예전 범위 삭제(예전 확인창 문구)로 동작하고, 이 파일을 적용하면 같은 앱이 새 범위로 동작한다.

alter table public.assessments
  add column record_purged_at timestamptz;

-- 28번의 record_deleted_at(삭제했다)과 다른 열이다. 비어 있으면(null) 예전 범위로 삭제했거나 삭제하지 않은 기록이다 — 기존 행은 모두 null이고 소급해서 바꾸지 않는다.

-- 삭제 완료한 기록에 대화가 생기거나 바뀌지 않게 하는 장치 ------------------------------------------------------------------------------------------------

create or replace function public.block_write_on_purged_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged timestamptz;
begin
  -- 삭제 함수와 같은 행을 잠그는 읽기(for share) — 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단한다
  select a.record_purged_at into v_purged from public.assessments a where a.id = new.assessment_id for share;
  if v_purged is not null then
    raise exception 'record_purged';
  end if;
  return new;
end;
$$;

create trigger talk_rooms_block_purged before insert or update on public.talk_rooms
  for each row execute function public.block_write_on_purged_record();
create trigger chat_summaries_block_purged before insert on public.chat_summaries
  for each row execute function public.block_write_on_purged_record();
create trigger talk_transcripts_block_purged before insert on public.talk_transcripts
  for each row execute function public.block_write_on_purged_record();
create trigger chat_questions_block_purged before insert on public.chat_questions
  for each row execute function public.block_write_on_purged_record();

revoke all on function public.block_write_on_purged_record() from public, anon, authenticated;

-- 본인 검사 결과의 기록을 삭제한다(삭제 범위 확대) ------------------------------------------------------------------------------------------------------
--   반환: 'deleted'(이번에 삭제함) · 'unchanged'(이미 삭제한 기록 — 예전 범위로 삭제한 기록도 소급해서 바꾸지 않는다) ·
--         'busy'(진행 중인 결제 · 생성 · 질문이 있어 지금은 삭제하지 않음) · 'not_found'(없거나 본인 것이 아님 — 둘을 구분해 알리지 않는다. 번호가 비어 있어도 같다 — 앱이 이 함수가 있는지 확인하는 데 쓴다)
--   읽기용 대화 기록으로 옮기는 단계가 없으므로 앱이 대화를 읽어 넘길 인자가 없다(그래서 'stale'도 없다 — 대화방 줄을 잠그고 한 번에 지운다).
--   같은 요청을 여러 번(동시에도) 보내도 한 번만 처리하고 나머지는 'unchanged'다. 한 번에 한 트랜잭션이라 중간까지만 처리된 상태가 남지 않는다.
create or replace function public.delete_assessment_record_v2(p_user_id uuid, p_assessment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assessments%rowtype;
  v_pair_refs boolean := false;
begin
  if p_user_id is null or p_assessment_id is null then
    return 'not_found';
  end if;

  -- 검사 결과 행을 먼저 잠근다 — 같은 순간의 주문 · 리포트 · 대화 저장 · 다른 삭제 요청은 이 줄 뒤로 줄을 선다
  select * into a
    from public.assessments
   where id = p_assessment_id and user_id = p_user_id and withdrawn_at is null
   for update;
  if not found then
    return 'not_found';
  end if;
  if a.record_deleted_at is not null then
    return 'unchanged';
  end if;

  -- 진행 중인 생성 · 결제 · 질문이 있으면 지금은 삭제하지 않는다 (28번 함수와 같은 기준 — 15분 넘게 멈춘 생성은 진행 중으로 보지 않는다)
  if exists (
    select 1 from public.reports r
     where r.assessment_id = p_assessment_id
       and r.status in ('queued', 'generating')
       and r.updated_at > now() - interval '15 minutes'
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.orders o
     where o.assessment_id = p_assessment_id
       and o.status = 'pending'
       and o.created_at > now() - interval '1 hour'
       and o.product_id not like 'cash-charge:%'
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.orders o
     where o.assessment_id = p_assessment_id
       and o.status = 'paid'
       and (o.product_id like 'saju-compat:%' or o.product_id like 'report-compat:%')
       and not exists (select 1 from public.reports r where r.order_id = o.id)
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.taste_reports tr
     where tr.assessment_id = p_assessment_id and tr.user_id = p_user_id and tr.status = 'pending' and tr.reserved_until > now()
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.chat_questions c
     where c.assessment_id = p_assessment_id
       and ((c.state = 'reserved' and c.reserved_until > now()) or c.created_at > now() - interval '30 seconds')
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.cash_ledger l
     where l.user_id = p_user_id and l.kind = 'spend' and l.created_at > now() - interval '30 seconds'
  ) then
    return 'busy';
  end if;

  -- 대화 내용: 채팅방(행동 목록 = 나눈 대화) · 저장한 채팅 요약(질문 · 답) · 읽기용 대화 기록. 방 줄을 잠그고 한 번에 지운다 — 이 결과의 것만(다른 결과 · 다른 회원의 것은 건드리지 않는다)
  perform 1 from public.talk_rooms where assessment_id = p_assessment_id for update;
  delete from public.talk_rooms where assessment_id = p_assessment_id;
  delete from public.chat_summaries where assessment_id = p_assessment_id and user_id = p_user_id;
  delete from public.talk_transcripts where assessment_id = p_assessment_id and user_id = p_user_id;

  -- 리포트 본문(주문은 남는다). 이 검사 결과의 개인 통합 리포트 · 고민 반영 리포트만 — 사주 궁합 · 리포트 궁합은 별개 상품이라 남긴다. 만족도 의견은 함께 지워진다(연쇄 삭제)
  delete from public.reports r
        using public.orders o
  where o.id = r.order_id
    and r.assessment_id = p_assessment_id
    and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%' or o.product_id like 'concern-report:%');

  -- 고민 입력 · 고민 기록(고객이 적은 글)
  delete from public.personal_contexts where assessment_id = p_assessment_id;
  delete from public.concern_records where assessment_id = p_assessment_id;

  -- 맛보기: 작성이 끝나지 않고 멈춘 예약 줄은 받은 적이 없으므로 지우고, 받은 글은 줄을 남긴 채 글만 비운다(무료 한 번이 다시 생기지 않는다)
  delete from public.taste_reports
   where assessment_id = p_assessment_id and user_id = p_user_id and status = 'pending';
  update public.taste_reports
     set content = '{"deleted": true}'::jsonb,
         generator = null,
         generator_version = null,
         reserved_until = null
   where assessment_id = p_assessment_id and user_id = p_user_id and status = 'ready';

  -- 분석 원자료: 채팅이 이어지도록 남기던 것이라 대화를 지운 지금은 쓸 곳이 없다. 다만 리포트 궁합 쌍(pairs)이 이 결과를 가리키고 있으면 그 궁합이 쓰는 동안 남긴다(표가 없는 DB에서는 확인하지 않는다).
  -- 비우는 값은 회원 탈퇴 함수(10번)와 같다 — 날짜 자리는 형식 검사를 맞추기 위한 빈 값(1900-01-01)이다.
  if to_regclass('public.pairs') is not null then
    execute 'select exists (select 1 from public.pairs where a_assessment_id = $1 or b_assessment_id = $1)' into v_pair_refs using p_assessment_id;
  end if;
  if not v_pair_refs then
    update public.assessments
       set nickname = '삭제',
           birth_calendar = 'solar',
           birth_is_leap_month = false,
           birth_year = 1900, birth_month = 1, birth_day = 1,
           birth_time = null,
           known_mbti = null,
           answers = '{}'::jsonb,
           summary = '{}'::jsonb,
           saju = '{}'::jsonb,
           content_version = 'record-deleted'
     where id = p_assessment_id;
  end if;

  -- 삭제 표시 둘(예전 범위 삭제와 구분): 이 순간부터 위의 장치가 이 결과의 대화 · 리포트 · 주문 쓰기를 막는다
  update public.assessments set record_deleted_at = now(), record_purged_at = now() where id = p_assessment_id;
  return 'deleted';
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.delete_assessment_record_v2(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_assessment_record_v2(uuid, uuid) to service_role;
```

## 5. 권한 영향 (실제 Supabase와 같은 기본 권한 조건에서 확인)

- 새 **함수 2개**만 생긴다. 새 표 · 새 정책은 없다.
  - `delete_assessment_record_v2(uuid, uuid)` — 서버 역할(`service_role`)만 실행. `anon` · `authenticated` · PUBLIC 실행 불가(`revoke all` 후 `grant execute ... to service_role`).
  - `block_write_on_purged_record()` — 트리거 전용. 아무도 직접 실행 불가(`revoke all`). `security definer` + `search_path = ''`.
- 새 **열 1개**: `assessments.record_purged_at timestamptz`(기존 행은 모두 null, 소급 없음). 회원(`authenticated`)이 이 열을 직접 바꿀 수 없다(RLS · 열 권한 시험).
- 새 **트리거 4개**: 위 3장.
- **기존 표 · 함수의 권한은 한 줄도 바뀌지 않는다** — 새 마이그레이션 적용 전후로 `pg_class.relacl` · `pg_proc.proacl` 전체를 비교해 새 함수 둘 말고는 달라진 줄이 없음을 시험이 확인한다(기본 권한 `alter default privileges ... grant all to anon, authenticated, service_role` 조건에서도 같다).
- 이 파일을 실행하는 것만으로는 **어떤 데이터도 지워지거나 바뀌지 않는다.** 데이터는 회원이 MY에서 "기록 삭제"를 직접 확정했을 때, 새 함수가 그 회원의 그 기록에 한해서만 처리한다.
- 앱은 서버 비밀키(`service_role`)로만 이 함수를 부르고, 호출 전에 소유자(로그인 회원 = 기록 주인)를 서버에서 확인한다. 함수 안에서도 `user_id` 일치를 다시 확인한다.

## 6. 적용 순서 (테스트 전용 프로젝트, root가 SQL Editor에서)

1. `supabase/delete-scope-29-precheck.sql` 실행(읽기 전용) → **종합 OK**여야 한다. "참고" 줄(번호 9~12)의 행 수를 적어 둔다.
2. `supabase/migrations/20261108000000_record_delete_scope.sql`을 **한 번만** 실행한다(한 번의 제출 = 하나의 트랜잭션. 중간에 실패하면 전부 취소된다. 두 번째 실행은 "이미 있음" 오류로 멈춘다).
3. `supabase/delete-scope-29-postcheck.sql` 실행(읽기 전용) → **종합 OK**, 번호 9~12의 행 수가 1번에서 적어 둔 숫자와 같아야 한다(= 데이터가 바뀌지 않았다).
4. 앱이 새 범위를 쓰는지 화면으로 확인 — MY의 "기록 삭제" 확인창에 "채팅방과 나눈 대화, 저장한 채팅 요약"이 보이면 앱이 새 함수를 알아본 것이다(최대 20초). 새 함수가 PostgREST에 안 보이면 `notify pgrst, 'reload schema';`.
5. 실제 삭제 시험은 **가상 계정의 가상 기록으로만** 한다. 실제 사용자 기록은 삭제하지 않는다.

이 변경은 19~22번(혜택) · 25번(후기)에 기대지 않는다. 리포트 궁합 표 `pairs`는 있을 때만 확인한다(없는 DB에서도 적용된다). 통합 파일 `supabase/apply-staging-all.sql`(빈 새 스테이징 프로젝트 전용)에는 29번까지 들어 있다.

## 7. 코드와 DB 배포 순서 — 어느 쪽이 먼저여도 안전한가

현재 외부 테스트 DB는 28번까지 적용돼 있고, 브랜치를 push하면 miutest가 자동 배포한다.

| 순서 | 동작 | 안전 |
| --- | --- | --- |
| **코드 먼저**(29번 전) | 앱이 `delete_assessment_record_v2` 존재를 확인(번호 없는 호출) → 없으면 예전 범위(28번)로 삭제하고 확인창도 예전 문구를 보인다. 열 `record_purged_at`이 없어 값은 `undefined`로 읽힌다(삭제 완료로 보지 않음). `select *`라 열이 없어도 깨지지 않는다. | ✅ 시험: "29번 전 DB(함수 · 열 없음)에서는 앱이 예전 범위로 이어 간다" |
| **DB 먼저**(예전 코드) | 예전 코드는 28번 함수만 부른다 → 동작 그대로. 새 트리거는 삭제 완료 기록에만 작동하는데 아직 그런 기록이 없다. | ✅ |
| **DB 뒤**(코드가 이미 배포) | 최대 20초(함수가 없다고 확인된 결과를 기억하는 시간) 뒤부터 새 범위로 동작. 확인창 문구도 같이 바뀐다. | ✅ |
| 확인 직후 함수가 사라진 경우(되돌림) | 호출이 "함수 없음"으로 실패하면 그 요청만 예전 범위로 이어 간다. 다른 오류(연결 끊김 등)는 **아무것도 지우지 않은 채** 그대로 알린다. | ✅ 시험 |

**되돌릴 때의 한계**: 29번 뒤에 삭제를 마친 기록이 생긴 다음 **코드만** 예전 버전으로 되돌리면, 그 기록의 채팅방 주소(`/results/<번호>/talk/...`)를 직접 열 때 오류가 날 수 있다(예전 코드는 분석 원자료가 남아 있다고 가정). MY 목록에는 나오지 않는 기록이라 북마크 같은 직접 주소에서만 해당한다. DB를 되돌려도 이미 지운 데이터는 복구되지 않는다(백업뿐).

**기능만 끄려면**(새 마이그레이션으로): `revoke execute on function public.delete_assessment_record_v2(uuid, uuid) from service_role;` 또는 함수를 삭제하면 앱이 최대 5분 안에 예전 범위로 돌아간다(성공 확인 결과를 5분 기억). 이미 삭제 완료한 기록은 그대로 삭제 완료다.

## 8. 앱 쪽 변경

- `lib/services/my-service.ts` `deleteReportRecord` — `purgeAvailable()` 확인 → 있으면 `purgeAssessmentRecord`(읽기용 기록으로 옮기는 단계 없음), 없으면 예전 경로. 결과 종류 `deleted-all` 추가, 안내 문구는 새 범위를 사실대로 말한다.
- `getMyPage` — 삭제를 마친 기록은 "삭제한 기록" 목록에 나오지 않는다(열 것이 없다). 결제내역은 그대로.
- `talk-service.ts` `owns()` · `saveTalkRoom` — 삭제를 마친 기록은 없는 기록으로 취급(읽기 · 저장 · 질문 · 요약 모두).
- 결과 화면 · 채팅방 주소 — 삭제를 마친 기록은 삭제 안내만(채팅방 링크 없음).
- MY 확인창 — 서버가 확인한 범위(`all` · `legacy`)에 맞는 "삭제되는 것 · 남는 것" 문구. 문구와 실제 동작은 같은 확인으로 정해진다.
- `/go/<방>` — 삭제를 마친 기록은 고르지 않는다.

## 9. 확인한 것 · 확인하지 못한 것

확인함(로컬 Postgres + 가짜 서버, 가상 데이터):
- 단위 시험(메모리 저장소) 20개 `lib/services/record-delete.test.ts` — 새 범위로 삭제되는 것 · 남는 것 · 멱등 · 소유자 · 진행 중(busy) · 늦은 저장 차단 · 남은 질문권으로 다른 분석에서 질문 · 쌍이 쓰는 원자료 보존 · 소급 안 함 · 29번 없는 DB 되돌아가기.
- DB 시험 11개 `supabase/tests/record-purge.db.test.ts` + 기존 DB 시험 전체(117개): 실제로 지워짐 · 증빙 그대로 · 동시 8건 중 1건만 처리 · 남의 번호 · 빈 번호 · 행 잠금 경합 · 쌍(a · b 양쪽) · 권한(비로그인 · 본인 · 다른 회원이 함수 · 열 · 트리거 함수를 못 씀) · 탈퇴 · 29번 전 DB 흉내 · 기본 권한 조건의 ACL 전후 비교 · 사전 / 사후 확인 SQL(28번까지 적용한 새 DB에서 OK → 적용 뒤 "이미 적용됨" / OK, 행 수 불변).
- 빈 새 DB에 통합 파일(`apply-staging-all.sql`)을 처음부터 적용해 29번까지 들어가고 확인 조회가 "적용됨"을 돌려줌.

**확인하지 못한 것(합격 처리하지 않는다)**:
- 실제 Supabase(테스트 DB `wdvrwwajakjdfrajgxcm`)에서의 적용과 실제 삭제 — root 검토 · 적용 뒤 가상 계정으로 확인해야 한다.
- 삭제 뒤 새 질문의 **실제 AI 답** — 로컬은 가짜 AI라 질문 경로의 소유 확인 · 차단만 확인했다(AI를 부르지 않는다).
- 실제 휴대폰 · 카카오톡 앱 안 브라우저에서의 확인창 흐름.

알려진 한계:
1. **리포트 궁합 쌍은 상태와 상관없이 원자료를 남긴다.** `pairs`에 이 결과를 가리키는 줄이 하나라도 있으면(초대 대기 · 연결 · 연결 해제 모두) 분석 원자료를 비우지 않는다. 연결 해제된 쌍의 원자료까지 비우는 것은 쌍 화면이 원자료를 읽지 않는다는 확인이 필요해 하지 않았다.
2. **쌍을 만드는 요청과 삭제가 정확히 같은 순간에 겹치면**(`pairs`에는 `assessments` 외래키가 없다) 비워진 원자료를 쌍이 가리킬 수 있다. 앱은 쌍 생성 전에 삭제 여부를 확인하지만 DB 장치는 없다(`pairs` 표가 없는 DB에서도 29번이 적용되게 하려고 의존을 만들지 않았다). 실제 가능성은 매우 낮다.
3. 삭제 직후 AI 답이 늦게 도착한 **유료 질문**은 질문권이 이미 차감돼 있다 — 답은 저장되지 않고 질문 횟수만 못 쌓인다(차감 · 복원 규칙은 기존 그대로).
4. 질문 횟수 표 `chat_questions`는 질문 내용이 없지만 "언제 어느 방에서 질문했는지"는 남는다(무료 한도 · 질문권 계산에 필요).

## 10. 운영자 결정 항목

- 이미 28번 범위로 삭제한 기록(지금은 읽기용 기록으로 남아 있음)을 새 범위로 **소급 정리**할지 — 기본은 하지 않는다(요청 없음 · 소급 금지 요구). 하려면 별도 SQL을 만들고 승인 뒤 실행한다.
- 확인창 문구가 법적 고지로 충분한지 — 법률 검토 대상이다(개인정보 삭제 · 보존 근거 `docs/legal-review-list.md`).
- 연결 해제된 리포트 궁합 쌍의 원자료를 비울지(위 한계 1).

## 11. 되돌릴 수 없음에 대한 안내

삭제는 되돌릴 수 없다. 확인창이 "삭제하면 되돌릴 수 없어요"를 먼저 보이고 삭제하기를 눌러야만 실행한다. 29번 파일을 적용했다고 해서 지워지는 것은 없다.
