-- 로컬 검증용: Supabase가 미리 만들어 두는 역할과 기본 권한을 흉내 낸다.
-- 실제 Supabase 프로젝트에는 실행하지 않는다 (이미 있음).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authenticator';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login superuser password 'auth_admin';
create schema auth authorization supabase_auth_admin;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- Supabase의 "새 테이블 자동 공개" 기본 권한은 일부러 흉내 내지 않는다.
-- 마이그레이션이 필요한 권한을 직접 주는지(자동 공개를 끈 프로젝트에서도 동작하는지) 확인하기 위해서다.
-- Supabase처럼 Auth의 마이그레이션 기록을 auth 스키마에 둔다
alter role supabase_auth_admin set search_path = auth;
