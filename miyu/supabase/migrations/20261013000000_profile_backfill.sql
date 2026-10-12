-- ME:U(미유) 3번째 마이그레이션 — 프로필 누락 보완
-- 앞의 두 파일(20261011000000_init.sql, 20261012000000_consents.sql)을 실행한 뒤 SQL Editor에서 실행한다.
--
-- 배경: 테이블을 만들기 전에 카카오로 가입한 회원은 가입 트리거가 없어서 profiles 행이 없다.
--       그러면 결제 화면에서 구매자 키를 찾지 못한다.
--
-- - 여러 번 실행해도 안전하다: 이미 있는 프로필은 그대로 두고, 없는 회원만 채운다.
-- - 회원 · 검사 · 주문 · 결제 기록은 바꾸거나 지우지 않는다.

insert into public.profiles (id)
select u.id
from auth.users u
on conflict (id) do nothing;

-- 앞으로는 서버가 빠진 프로필을 로그인 · 결제 때 스스로 만든다 (서버 비밀키 권한에 추가만 한다)
grant insert on public.profiles to service_role;
