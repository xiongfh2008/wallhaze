#!/usr/bin/env bash
# =============================================================================
# wallhaze-deploy — Contabo VPS backend deployment (wallhaze-app compose).
#
# FINAL ARCHITECTURE (2026-10-24 revision): frontend lives on Cloudflare
# Workers; this VPS runs ONLY the backend stack: api / worker / postgres /
# jobs. The host Nginx (already serving other sites) proxies
# https://api.wallhaze.com -> 127.0.0.1:4000 via a separate site file.
#
# Location on the VPS: /opt/wallhaze/apps/api/deploy.sh (repo: apps/api/)
# Run as a sudo-capable user from /opt/wallhaze/apps/api.
#
# SAFETY CONTRACT:
#   - NEVER runs: docker compose down -v, docker volume prune,
#     docker system prune --volumes, rm -rf on data directories.
#   - Volumes (wallhaze_app_pgdata, wallhaze_app_backups) are never touched.
#   - Never touches other projects on this host (tarot, vidsavey, the
#     wallhaze/redis project, host Nginx).
#   - The published-port audit FAILS the deploy if anything other than
#     127.0.0.1:4000 is published by this stack.
#
# Usage:
#   ./deploy.sh deploy              # postgres -> migrate -> api -> worker
#   ./deploy.sh status              # ps + health + port audit
#   ./deploy.sh logs <service> [n]  # service logs (api|worker|postgres|jobs)
#   ./deploy.sh backup              # immediate pg_dump via the jobs container
#   ./deploy.sh rollback            # restart app services from previous image
# =============================================================================
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-compose.production.yaml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/opt/wallhaze/secrets/compose.env}"
cd "$(dirname "$0")"

# Compose project name is pinned in the file (name: wallhaze-app), so
# containers are wallhaze-app-<service>-1 and volumes wallhaze_app_*.
ctr() { echo "wallhaze-app-$1-1"; }

log() { printf '[deploy %s] %s\n' "$(date -u '+%H:%M:%S')" "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# --- Preflight ----------------------------------------------------------------
preflight() {
    command -v docker >/dev/null || die "docker is not installed"
    docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"
    [ -f "$COMPOSE_FILE" ] || die "missing compose file: $COMPOSE_FILE"
    [ -f "jobs/crontab-runner.sh" ] || die "missing jobs/crontab-runner.sh"
    [ -f "$COMPOSE_ENV_FILE" ] || die "$COMPOSE_ENV_FILE missing (see compose.env.staging.example)"
    [ -f /opt/wallhaze/secrets/api.env ] || die "/opt/wallhaze/secrets/api.env missing (see .env.staging.example)"
    # Fail fast if a destructive flag ever sneaks into this script.
    if grep -nE "down -v|volume prune|system prune --volumes" "$0" | grep -v "NEVER" >/dev/null 2>&1; then
        die "destructive volume command detected in deploy script — refusing to run"
    fi
    # Coexistence guard: this stack must never publish onto ports owned by
    # the other services on this host.
    for svc in api worker postgres jobs; do
        [ "$(docker inspect -f '{{.State.Running}}' "$(ctr "$svc")" 2>/dev/null || true)" = "true" ] || continue
    done
    log "preflight ok"
}

# --- Health -------------------------------------------------------------------
wait_healthy() {
    service="$1"; timeout="${2:-180}"; waited=0
    until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(ctr "$service")" 2>/dev/null)" = "healthy" ]; do
        waited=$((waited + 5))
        [ "$waited" -ge "$timeout" ] && die "$service did not become healthy within ${timeout}s"
        sleep 5
    done
    log "$service is healthy"
}

cmd_status() {
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
    echo
    for s in api worker postgres jobs; do
        printf '%-10s %s\n' "$s" "$(docker inspect -f '{{.State.Health.Status}}' "$(ctr "$s")" 2>/dev/null || echo 'n/a')"
    done
    echo
    log "published host ports for wallhaze-app (ONLY 127.0.0.1:4000 expected):"
    docker ps --format '{{.Names}}\t{{.Ports}}' | grep wallhaze-app || true
}

cmd_logs() {
    service="${1:?usage: deploy.sh logs <api|worker|postgres|jobs> [tail]}"
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
    log "deploying backend stack (wallhaze-app)"

    # 1) Database first: volume + health before anything reads the schema.
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d postgres
    wait_healthy postgres 120

    # 2) Explicit one-shot migration (the API also migrates on boot; this
    #    step makes schema failures visible before any service starts).
    #    The emitted tsc layout is dynamic, so resolve migrate.js relative
    #    to the recorded .dist-entry (server.js's directory).
    log "running migrations via one-shot api container…"
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps api \
        node -e "const fs=require('fs'),path=require('path');const entry=fs.readFileSync('.dist-entry','utf8').trim();const dir=path.dirname(entry);Promise.all([import('./'+dir+'/db/migrate.js'),import('./'+dir+'/db/database.js')]).then(async ([m,d])=>{const db=d.createPostgresDatabase(process.env.DATABASE_URL);await m.migrate(db);await db.close();console.log('[migrate] done');})"

    # 3) Application services (images already loaded/built — never built here).
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d api worker
    wait_healthy api 240
    # The worker exits non-zero when storage/db config is wrong (fail-closed),
    # so a healthy worker proves the R2 credentials chain end-to-end.
    wait_healthy worker 240
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d jobs

    # 4) Port audit: this stack must publish ONLY the loopback API port.
    published="$(docker ps --format '{{.Names}} {{.Ports}}' | grep wallhaze-app || true)"
    echo "$published"
    if echo "$published" | grep -E '0\.0\.0\.0|\[::\]' | grep -v '127\.0\.0\.1:4000' >/dev/null; then
        die "unexpected public port mapping detected — investigate before proceeding"
    fi
    if ! echo "$published" | grep -q '127\.0\.0\.1:4000'; then
        die "api is not listening on 127.0.0.1:4000 as required"
    fi

    log "deploy complete. Next: curl http://127.0.0.1:4000/health on the VPS."
}

# --- Rollback -----------------------------------------------------------------
cmd_rollback() {
    preflight
    log "restarting app services from the previously loaded images"
    log "(image-level rollback: docker load an older wallhaze-api/worker tag,"
    log " then re-run ./deploy.sh deploy. Database schema is NOT modified;"
    log " see ROLLBACK-RUNBOOK.md for migration-level recovery.)"
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate api worker
    wait_healthy api 240
    wait_healthy worker 240
    log "rollback restart complete"
}

case "${1:-help}" in
    deploy)   cmd_deploy "$@" ;;
    rollback) cmd_rollback "$@" ;;
    status)   cmd_status ;;
    logs)     shift; cmd_logs "$@" ;;
    backup)   cmd_backup ;;
    *)        sed -n '2,15p' "$0" ;;
esac
