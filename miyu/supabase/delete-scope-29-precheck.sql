-- ME:U(미유) DB 변경 29번(기록 삭제 범위 확대) — 적용 전 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 테스트 전용 프로젝트(wdvrwwajakjdfrajgxcm)의 SQL Editor에서 이 파일을 붙여넣고 Run. "종합"이 OK이면 supabase/migrations/20261108000000_record_delete_scope.sql을 한 번만 실행한다.
-- 결과의 "참고" 줄(번호 9~12)의 숫자는 적용 뒤 delete-scope-29-postcheck.sql의 숫자와 같아야 한다(29번을 적용하는 것만으로는 어떤 데이터도 바뀌지 않는다) — 이 숫자를 적어 둔다.

with
r as (
  select * from (values
    (1, '선행: 28번(기록 삭제)이 적용돼 있다 — 열 assessments.record_deleted_at · 함수 delete_assessment_record · 표 talk_transcripts',
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_deleted_at')
            and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_assessment_record')
            and to_regclass('public.talk_transcripts') is not null then 'OK' else '이상' end, ''),
    (2, '선행: 29번이 대화 쓰기를 막을 표 네 개가 있다 — talk_rooms · chat_summaries · talk_transcripts · chat_questions',
      case when to_regclass('public.talk_rooms') is not null and to_regclass('public.chat_summaries') is not null and to_regclass('public.talk_transcripts') is not null and to_regclass('public.chat_questions') is not null then 'OK' else '이상' end, ''),
    (3, '선행: 29번이 비우거나 확인하는 표·열이 있다 — personal_contexts · concern_records · taste_reports · reports · orders · cash_ledger (표 pairs는 있으면 확인한다)',
      case when to_regclass('public.personal_contexts') is not null and to_regclass('public.concern_records') is not null and to_regclass('public.taste_reports') is not null
            and to_regclass('public.reports') is not null and to_regclass('public.orders') is not null and to_regclass('public.cash_ledger') is not null then 'OK' else '이상' end,
      '표 pairs(리포트 궁합) ' || case when to_regclass('public.pairs') is null then '없음 — 29번은 쌍 확인을 건너뛴다(19~24번에 기대지 않는다)' else '있음 — 쌍이 쓰는 분석 원자료는 남긴다' end),
    (4, '선행: 서버 역할(service_role)이 있다', case when exists (select 1 from pg_roles where rolname = 'service_role') then 'OK' else '이상' end, ''),
    (5, '29번이 만드는 것이 아직 하나도 없다 — 열 record_purged_at · 함수 delete_assessment_record_v2 · block_write_on_purged_record · 장치 4개',
      case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at')
            and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('delete_assessment_record_v2', 'block_write_on_purged_record'))
            and not exists (select 1 from pg_trigger where tgname in ('talk_rooms_block_purged', 'chat_summaries_block_purged', 'talk_transcripts_block_purged', 'chat_questions_block_purged')) then 'OK'
           else '이미 적용됐거나 일부만 있음 — 이 파일을 다시 실행하지 말고 결과를 알려 달라' end, ''),
    (6, '19~22번(혜택) · 25번(후기)에 기대지 않는다 — 이 변경은 위 표들만 쓴다', '참고',
      '혜택 표 ' || case when to_regclass('public.coupons') is null and to_regclass('public.point_ledger') is null then '없음' else '있음' end || ' · 후기 표 ' || case when to_regclass('public.reviews') is null then '없음' else '있음' end || ' (어느 쪽이든 29번 적용에 영향이 없다)'),
    (7, '지금 진행 중인 삭제 대상이 없다(참고) — 생성 중인 리포트 · 결제 대기 주문 · 답을 기다리는 질문', '참고',
      '생성 중 ' || (select count(*) from public.reports where status in ('queued', 'generating') and updated_at > now() - interval '15 minutes') || ' · 결제 대기(1시간 안) ' || (select count(*) from public.orders where status = 'pending' and created_at > now() - interval '1 hour') || ' · 답을 기다리는 질문 ' || (select count(*) from public.chat_questions where state = 'reserved' and reserved_until > now())),
    (8, '이미 28번 범위로 삭제한 기록(참고) — 29번은 이 기록을 소급해서 바꾸지 않는다', '참고',
      (select count(*) from public.assessments where record_deleted_at is not null) || '건 (그 기록의 채팅방 · 읽기용 대화 기록 · 분석 원자료는 그대로 남는다)'),
    (9, '대화 내용이 들어 있는 표의 행 수(적용 뒤에도 같아야 한다)', '참고',
      'talk_rooms ' || (select count(*) from public.talk_rooms) || ' · chat_summaries ' || (select count(*) from public.chat_summaries) || ' · talk_transcripts ' || (select count(*) from public.talk_transcripts)),
    (10, '사용 이력 표의 행 수(적용 뒤에도 같아야 한다 — 질문 내용은 없고 횟수 · 시각 · 참조번호뿐)', '참고',
      'chat_questions ' || (select count(*) from public.chat_questions) || ' · cash_ledger ' || (select count(*) from public.cash_ledger)),
    (11, '주문 · 결제 · 리포트 · 맛보기 행 수(적용 뒤에도 같아야 한다)', '참고',
      'orders ' || (select count(*) from public.orders) || ' · reports ' || (select count(*) from public.reports) || ' · taste_reports ' || (select count(*) from public.taste_reports)),
    (12, '분석 결과 · 회원 행 수(적용 뒤에도 같아야 한다)', '참고',
      'assessments ' || (select count(*) from public.assessments) || ' · profiles ' || (select count(*) from public.profiles))
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from r
union all
select 99, '종합', case when exists (select 1 from r where verdict not in ('OK', '참고')) then '이상 — 29번을 실행하지 말고 결과를 그대로 알려 달라' else 'OK — 29번을 적용해도 된다' end, '이상 ' || (select count(*) from r where verdict not in ('OK', '참고')) || '개'
order by 1;
