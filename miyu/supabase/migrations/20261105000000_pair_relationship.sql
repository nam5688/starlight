-- 리포트 궁합 쌍에 "무슨 사이인가요?"(초대한 사람이 알려 준 두 사람의 현재 사이)를 더한다. 마이그레이션 26번 — 파일만 준비한 것이며 어떤 DB에도 적용하지 않았다(운영자 승인 후 적용).
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 열 하나를 더할 뿐이라 기존 쌍 · 결제 · 열람 권한은 그대로다.
-- 값: lover(연인) · engaged(결혼준비중) · some(썸타는중) · married(결혼함) · friend(친구) · other(기타). 비어 있으면(null) 이 기능 이전의 쌍이다 —
--   서비스는 특정 관계로 채우지 않고 예전처럼 중립으로 읽는다. 이름 · 생년월일 · 성별은 이 표에 없다(성별은 각자의 분석 결과에 이미 있다).
-- 이 열은 풀이의 관점 · 표현에만 쓰이고 궁합 지수 · 사주 계산 · 결제 · 열람 권한을 바꾸지 않는다.
-- 코드를 먼저 배포해도 깨지지 않는다: 열이 없으면 쌍 읽기는 사이를 null로 읽고, 새 초대 만들기만 "준비 중"(db-not-ready)으로 멈춘다.

alter table public.pairs
  add column relationship text
  check (relationship is null or relationship in ('lover', 'engaged', 'some', 'married', 'friend', 'other'));
