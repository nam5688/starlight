-- ME:U(미유) DB 변경 30번(리포트 궁합 쌍 × 기록 삭제 동시성 장치) — 적용 전 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 테스트 전용 프로젝트(wdvrwwajakjdfrajgxcm)의 SQL Editor에서 이 파일을 붙여넣고 Run. "종합"이 OK이면 supabase/migrations/20261109000000_pair_assessment_guard.sql을 한 번만 실행한다.
-- 결과의 "참고" 줄(번호 5 · 6)의 숫자는 적용 뒤 pair-assessment-guard-30-postcheck.sql의 숫자와 같아야 한다(30번은 어떤 데이터도 바꾸지 않는다) — 이 숫자를 적어 둔다.
-- 번호 4가 0이 아니면 30번 이전에 이미 "원자료가 비워진 분석을 쌍이 가리키는" 행이 있다는 뜻이다. 30번은 그 행을 고치지 않는다(앞으로 새로 생기지 않게만 막는다) — 결과를 그대로 알려 달라.

with
r as (
  select * from (values
    (1, '선행: 24번(리포트 궁합)이 적용돼 있다 — 표 pairs · 함수 pair_join',
      case when to_regclass('public.pairs') is not null
            and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pair_join') then 'OK' else '이상' end, ''),
    (2, '선행: 29번(기록 삭제 범위 확대)이 적용돼 있다 — 열 assessments.record_purged_at · 함수 delete_assessment_record_v2',
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at')
            and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_assessment_record_v2') then 'OK' else '이상' end, ''),
    (3, '30번이 만드는 것이 아직 없다 — 함수 pairs_block_deleted_record · 장치 pairs_block_deleted_record',
      case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pairs_block_deleted_record')
            and not exists (select 1 from pg_trigger where tgname = 'pairs_block_deleted_record') then 'OK'
           else '이미 적용됐거나 일부만 있음 — 이 파일을 다시 실행하지 말고 결과를 알려 달라' end, ''),
    (4, '이미 "원자료가 비워진 분석"(삭제 완료)을 가리키는 쌍이 있는가(참고) — 있어도 30번이 고치지 않는다', '참고',
      case when to_regclass('public.pairs') is null then '표 없음' else
        (select count(*) from public.pairs p join public.assessments a on a.id = p.a_assessment_id where a.record_purged_at is not null and a.content_version = 'record-deleted')
        + (select count(*) from public.pairs p join public.assessments a on a.id = p.b_assessment_id where a.record_purged_at is not null and a.content_version = 'record-deleted')
        || '건' end),
    (5, '쌍 · 분석 결과 행 수(적용 뒤에도 같아야 한다)', '참고',
      'pairs ' || (select count(*) from public.pairs) || ' · assessments ' || (select count(*) from public.assessments)),
    (6, '삭제를 마쳤거나(29번 범위) 삭제 표시만 있는(28번 범위) 기록 수(참고 — 적용 뒤에도 같아야 한다)', '참고',
      '삭제 완료 ' || (select count(*) from public.assessments where record_purged_at is not null) || ' · 삭제 표시 ' || (select count(*) from public.assessments where record_deleted_at is not null))
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from r
union all
select 99, '종합', case when exists (select 1 from r where verdict not in ('OK', '참고')) then '이상 — 30번을 실행하지 말고 결과를 그대로 알려 달라' else 'OK — 30번을 적용해도 된다' end, '이상 ' || (select count(*) from r where verdict not in ('OK', '참고')) || '개'
order by 1;
