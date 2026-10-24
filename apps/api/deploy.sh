#!/usr/bin/env bash
# =============================================================================
# wallhaze-deploy — controlled deployment script for the Contabo VPS.
#
# Location on the VPS: /opt/wallhaze/apps/api/deploy.sh (repo: apps/api/)
# Run as a sudo-capable user from /opt/wallhaze/apps/api.
#
# SAFETY CONTRACT:
#   - NEVER runs: docker compose down -v, docker volume prune,
#     docker system prune --volumes, rm -rf on data directories.
#   - Volumes (wallhaze_postgres_data, wallhaze_pg_backups) are never touched
#     by any command here.
#   - Images are tagged by git SHA; rollback = redeploy the previous tag.
#
# Usage:
#   ./deploy.sh deploy [image-tag]     # pull/build + migrate + rolling start
#   ./deploy.sh rollback <image-tag>   # point services back at an old tag
#   ./deploy.sh status                 # ps + health + port audit
#   ./deploy.sh logs <service> [tail]  # service logs
#   ./deploy.sh backup                 # immediate pg_dump into the volume
# =============================================================================
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-compose.production.yaml}"
cd "$(dirname "$0")"

log() { printf '[deploy %s] %s\n' "$(date -u '+%H:%M:%S')" "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

require_file() {
    [ -f "$1" ] || die "missing required file: $1"
}

# --- Preflight ----------------------------------------------------------------
preflight() {
    command -v docker >/dev/null || die "docker is not installed"
    docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"
    require_file "$COMPOSE_FILE"
    require_file "Caddyfile"
    require_file "jobs/crontab-runner.sh"
    [ -f /opt/wallhaze/secrets/api.env ] || die "/opt/wallhaze/secrets/api.env missing (see ENVIRONMENT-VARIABLES.md)"
    [ -f /opt/wallhaze/secrets/compose.env ] || die "/opt/wallhaze/secrets/compose.env missing (SITE_DOMAIN, POSTGRES_*)"
    # Fail fast if a destructive flag ever sneaks into this script.
    if grep -nE "down -v|volume prune|system prune --volumes" "$0" | grep -v "NEVER\|deliberately" >/dev/null 2>&1; then
        die "destructive volume command detected in deploy script — refusing to run"
    fi
    log "preflight ok"
}

# --- Health -------------------------------------------------------------------
wait_healthy() {
    service="$1"; timeout="${2:-180}"; waited=0
    until [ "$(docker inspect -f '{{.State.Health.Status}}' "wallhaze-$service" 2>/dev/null)" = "healthy" ]; do
        waited=$((waited + 5))
        [ "$waited" -ge "$timeout" ] && die "$service did not become healthy within ${timeout}s"
        sleep 5
    done
    log "$service is healthy"
}

cmd_status() {
    docker compose -f "$COMPOSE_FILE" ps
    echo
    for s in caddy web api worker postgres; do
        printf '%-10s %s\n' "$s" "$(docker inspect -f '{{.State.Health.Status}}' "wallhaze-$s" 2>/dev/null || echo 'n/a')"
    done
    echo
    log "published host ports (ONLY 80/443 expected):"
    docker ps --format '{{.Names}}\t{{.Ports}}' | grep wallhaze || true
}

cmd_logs() {
    service="${1:?usage: deploy.sh logs <service> [tail]}"
    tail_n="${2:-200}"
    docker compose -f "$COMPOSE_FILE" logs --tail="$tail_n" "$service"
}

cmd_backup() {
    log "triggering immediate backup in the jobs container…"
    docker compose -f "$COMPOSE_FILE" exec jobs /bin/sh /etc/wallhaze/crontab-runner.sh --daily
}

# --- Deploy -------------------------------------------------------------------
cmd_deploy() {
    preflight
    tag="${1:-latest}"
    log "deploying tag: $tag"

    # 1) Ensure the database volume exists and Postgres is healthy FIRST.
    docker compose -f "$COMPOSE_FILE" up -d postgres
    wait_healthy postgres 120

    # 2) Migrations run via the API image against the internal network.
    #    The API already runs migrate() on boot, but an explicit step makes
    #    failures visible before any traffic is switched.
    log "running migrations via one-shot api container…"
    docker compose -f "$COMPOSE_FILE" run --rm --no-deps api \
        node dist/apps/api/src/db-migrate.js || \
    docker compose -f "$COMPOSE_FILE" run --rm --no-deps api \
        node -e "import('./dist/apps/api/src/db/migrate.js').then(async m => { const {createPostgresDatabase}=await import('./dist/apps/api/src/db/database.js'); const db=createPostgresDatabase(process.env.DATABASE_URL); await m.migrate(db); await db.close(); console.log('[migrate] done'); })"

    # 3) Rolling start of the application services (images already pulled/built).
    docker compose -f "$COMPOSE_FILE" up -d --no-deps api worker web
    wait_healthy api 240
    wait_healthy web 240

    # 4) Proxy last, only once both upstreams are healthy.
    docker compose -f "$COMPOSE_FILE" up -d --no-deps caddy
    wait_healthy caddy 60

    # 5) Port audit: fail the deployment if anything but 80/443 is published.
    published="$(docker ps --format '{{.Names}} {{.Ports}}' | grep wallhaze || true)"
    echo "$published"
    if echo "$published" | grep -Ev '(caddy|0.0.0.0:80|0.0.0.0:443|\[::\]:80|\[::\]:443)' | grep -E '0\.0\.0\.0|\[::\]' >/dev/null; then
        die "unexpected public port mapping detected — rolling back proxy only"
    fi

    log "deploy complete. Previous image retained for rollback: check 'docker images wallhaze/*'"
}

# --- Rollback -----------------------------------------------------------------
cmd_rollback() {
    preflight
    tag="${1:?usage: deploy.sh rollback <image-tag>}"
    log "rolling back to tag: $tag"
    export WALLHAZE_IMAGE_TAG="$tag"
    # Retag current images to the requested tag and restart app services only.
    for svc in web api worker; do
        docker tag "wallhaze/$svc:$tag" "wallhaze/$svc:latest" 2>/dev/null \
            || die "image wallhaze/$svc:$tag not found locally"
    done
    docker compose -f "$COMPOSE_FILE" up -d --no-deps api worker web
    wait_healthy api 240
    wait_healthy web 240
    docker compose -f "$COMPOSE_FILE" up -d --no-deps caddy
    log "rollback complete. Database schema was NOT modified — if the newer"
    log "release ran irreversible migrations, see ROLLBACK-RUNBOOK.md."
}

case "${1:-help}" in
    deploy)   shift; cmd_deploy "$@" ;;
    rollback) shift; cmd_rollback "$@" ;;
    status)   cmd_status ;;
    logs)     shift; cmd_logs "$@" ;;
    backup)   cmd_backup ;;
    *)        sed -n '2,12p' "$0" ;;
esac
