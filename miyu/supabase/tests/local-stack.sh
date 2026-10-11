#!/usr/bin/env bash
# 로컬 검증용 Supabase 비슷한 환경: Postgres 16 + Supabase Auth(GoTrue) + PostgREST + 경로 중계.
# Linux 개발 환경(클라우드 세션)에서만 쓴다. Windows에서는 실행하지 않는다.
#
# 사용: BIN_DIR=<gotrue·postgrest 바이너리 폴더> WORK_DIR=<작업 폴더> ./local-stack.sh start|stop
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
: "${BIN_DIR:?BIN_DIR 필요}"
: "${WORK_DIR:?WORK_DIR 필요}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_PORT="${PG_PORT:-54329}"
JWT_SECRET="${JWT_SECRET:-local-test-jwt-secret-at-least-32-characters}"
GATEWAY_PORT="${GATEWAY_PORT:-54321}"
SITE_URL="${SITE_URL:-http://127.0.0.1:4321}"

# Postgres는 root로 실행할 수 없으므로, root면 postgres 계정으로 실행한다
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

start() {
  mkdir -p "$WORK_DIR/pg"
  [ "$(id -u)" = "0" ] && chown postgres "$WORK_DIR/pg" && chmod 755 "$WORK_DIR"
  if [ ! -f "$WORK_DIR/pg/PG_VERSION" ]; then
    as_pg "$PG_BIN/initdb" -D "$WORK_DIR/pg" -U postgres --auth=trust >/dev/null
  fi
  as_pg "$PG_BIN/pg_ctl" -D "$WORK_DIR/pg" -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$WORK_DIR/pg/pg.log" start </dev/null >/dev/null 2>&1
  until "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; do sleep 0.3; done

  local psql=(psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
  if ! "${psql[@]}" -tAc "select 1 from pg_roles where rolname='anon'" | grep -q 1; then
    "${psql[@]}" -f "$HERE/bootstrap.sql"
  fi

  # Supabase Auth: 시작하면서 auth 스키마를 만든다
  env \
    GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
    API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1" \
    GOTRUE_DB_DRIVER=postgres \
    GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:auth_admin@127.0.0.1:$PG_PORT/postgres?sslmode=disable" \
    DATABASE_URL="postgres://supabase_auth_admin:auth_admin@127.0.0.1:$PG_PORT/postgres?sslmode=disable" \
    GOTRUE_DB_MIGRATIONS_PATH="$BIN_DIR/migrations" \
    GOTRUE_SITE_URL="$SITE_URL" GOTRUE_URI_ALLOW_LIST="$SITE_URL/**" \
    GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true \
    GOTRUE_EXTERNAL_KAKAO_ENABLED=true GOTRUE_EXTERNAL_KAKAO_CLIENT_ID=local-kakao-client \
    GOTRUE_EXTERNAL_KAKAO_SECRET=local-kakao-secret \
    GOTRUE_EXTERNAL_KAKAO_REDIRECT_URI="http://127.0.0.1:$GATEWAY_PORT/auth/v1/callback" \
    GOTRUE_EXTERNAL_KAKAO_EMAIL_OPTIONAL=true \
    GOTRUE_EXTERNAL_KAKAO_URL="${KAKAO_MOCK_URL:-}" \
    GOTRUE_LOG_LEVEL=warn \
    setsid nohup "$BIN_DIR/auth" < /dev/null > "$WORK_DIR/auth.log" 2>&1 &
  echo $! > "$WORK_DIR/auth.pid"
  for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:9999/health" >/dev/null && break; sleep 0.5; done
  curl -sf "http://127.0.0.1:9999/health" >/dev/null || { echo "auth 시작 실패"; tail -20 "$WORK_DIR/auth.log"; exit 1; }

  # 앱 테이블
  if ! "${psql[@]}" -tAc "select 1 from pg_tables where tablename='orders'" | grep -q 1; then
    for f in "$MIGRATIONS"/*.sql; do "${psql[@]}" -f "$f"; done
  fi

  cat > "$WORK_DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3000
CONF
  setsid nohup "$BIN_DIR/postgrest" "$WORK_DIR/postgrest.conf" < /dev/null > "$WORK_DIR/postgrest.log" 2>&1 & echo $! > "$WORK_DIR/postgrest.pid"
  for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:3000/" && break; sleep 0.25; done

  GATEWAY_PORT="$GATEWAY_PORT" setsid nohup node "$HERE/gateway.mjs" < /dev/null > "$WORK_DIR/gateway.log" 2>&1 & echo $! > "$WORK_DIR/gateway.pid"
  for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$GATEWAY_PORT/rest/v1/" && break; sleep 0.25; done
  echo "local stack ready: http://127.0.0.1:$GATEWAY_PORT"
}

stop() {
  for p in gateway postgrest auth; do
    [ -f "$WORK_DIR/$p.pid" ] && kill "$(cat "$WORK_DIR/$p.pid")" 2>/dev/null || true
    rm -f "$WORK_DIR/$p.pid"
  done
  [ -d "$WORK_DIR/pg" ] && as_pg "$PG_BIN/pg_ctl" -D "$WORK_DIR/pg" stop -m fast >/dev/null 2>&1 || true
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop"; exit 1 ;;
esac
