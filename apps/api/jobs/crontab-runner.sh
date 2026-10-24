#!/bin/sh
# =============================================================================
# WallHaze scheduled jobs runner (Alpine + busybox crond).
#
# Schedules (UTC):
#   03:15 daily   pg_dump -> /backups/daily/ (gzip), keep 7
#   04:15 Sunday  weekly copy, keep 4
#   */30min       30-day retention dry-run scan (ops CLI semantics, log only)
#   01:00 daily   backup integrity check (gzip -t) + failure log
#
# DANGEROUS COMMANDS ARE DELIBERATELY ABSENT: this script never runs
#   docker compose down -v / docker volume prune / docker system prune
#   --volumes / rm -rf of any data directory. Deletion is limited to the
#   backup rotation below (count-based, backups only).
#
# The container has NO docker socket; it talks to PostgreSQL over the
# internal network with psql/pg_dump client tools installed at startup.
# =============================================================================
set -u

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-wallhaze}"
PGUSER="${PGUSER:-wallhaze}"
# alpine's postgresql17-client installs into /usr/libexec/postgresql17/
# without replacing /usr/bin/pg_dump (still v16) — prefer the matching binary.
if [ -x /usr/libexec/postgresql17/pg_dump ]; then
    PG_DUMP=/usr/libexec/postgresql17/pg_dump
else
    PG_DUMP=pg_dump
fi
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
LOG="${BACKUP_ROOT}/jobs.log"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG"; }

rotate() {
    # $1 = directory, $2 = keep count
    dir="$1"; keep="$2"
    ls -1t "$dir" 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
        rm -f -- "$dir/$old"
        log "rotated old backup $dir/$old"
    done
}

daily_backup() {
    mkdir -p "$BACKUP_ROOT/daily"
    stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    target="$BACKUP_ROOT/daily/wallhaze-$stamp.sql.gz"
    tmp="$target.part"
    log "daily backup start -> $target"
    if $PG_DUMP -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
            --no-owner --no-privileges | gzip > "$tmp"; then
        sync
        mv "$tmp" "$target"
        size="$(du -h "$target" | cut -f1)"
        log "daily backup ok ($size)"
        rotate "$BACKUP_ROOT/daily" "$DAILY_KEEP"
    else
        rm -f -- "$tmp"
        log "ERROR: daily backup FAILED (pg_dump exit non-zero)"
        return 1
    fi
}

weekly_backup() {
    mkdir -p "$BACKUP_ROOT/weekly"
    stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    target="$BACKUP_ROOT/weekly/wallhaze-weekly-$stamp.sql.gz"
    log "weekly backup start -> $target"
    if $PG_DUMP -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
            --no-owner --no-privileges | gzip > "$target"; then
        log "weekly backup ok"
        rotate "$BACKUP_ROOT/weekly" "$WEEKLY_KEEP"
    else
        rm -f -- "$target"
        log "ERROR: weekly backup FAILED"
        return 1
    fi
}

verify_backups() {
    failed=0
    for f in "$BACKUP_ROOT"/daily/*.gz "$BACKUP_ROOT"/weekly/*.gz; do
        [ -f "$f" ] || continue
        if ! gzip -t "$f" 2>/dev/null; then
            log "ERROR: backup integrity check FAILED: $f"
            failed=1
        fi
    done
    [ "$failed" -eq 0 ] && log "backup integrity check ok"
    return "$failed"
}

retention_dry_run() {
    # The ops CLI is inside the api image; run it through the internal network
    # using a one-shot container exec from the HOST cron instead is cleaner,
    # but this container has no docker socket by design. Until the retention
    # switch is enabled the dry run is a Postgres-side SELECT summary that
    # mirrors media-lifecycle selection criteria (temporary_30d + expired).
    expired="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc \
        "SELECT count(*) FROM image_assets
         WHERE retention_policy='temporary_30d'
           AND expires_at IS NOT NULL AND expires_at <= now()
           AND storage_status IN ('active','deleting','delete_failed')" 2>&1)"
    if [ $? -eq 0 ]; then
        log "retention dry-run: $expired expired temporary_30d asset(s) would be scanned (deletion switch is OFF)"
    else
        log "ERROR: retention dry-run query failed: $expired"
    fi
}

case "${1:-}" in
    --daily)   daily_backup; exit $? ;;
    --weekly)  weekly_backup; exit $? ;;
    --verify)  verify_backups; exit $? ;;
    --retention-dry-run) retention_dry_run; exit $? ;;
esac

# Install client tools on start. postgresql17-client ships the v17 binaries
# under /usr/libexec/postgresql17/ but leaves /usr/bin/pg_dump symlinked at
# the default v16 \u2014 re-point the symlinks so plain pg_dump matches the 17.x
# server (verified locally: without this, every dump aborts).
apk update >/dev/null 2>&1
apk add --force-overwrite --no-cache postgresql17-client >/dev/null 2>&1 || \
    apk add --no-cache postgresql16-client >/dev/null 2>&1 || \
    log "WARN: postgresql client install failed; is the network up?"
if [ -x /usr/libexec/postgresql17/pg_dump ]; then
    ln -sf /usr/libexec/postgresql17/pg_dump /usr/bin/pg_dump
    ln -sf /usr/libexec/postgresql17/pg_dumpall /usr/bin/pg_dumpall
    [ -x /usr/libexec/postgresql17/psql ] && ln -sf /usr/libexec/postgresql17/psql /usr/bin/psql
fi

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"
log "jobs runner started (PGHOST=$PGHOST db=$PGDATABASE)"

log "pg_dump: $($PG_DUMP --version)"

# Run one backup immediately so a fresh deployment is never unprotected.
daily_backup || true

# busybox crond with a generated crontab.
cat > /etc/crontabs/root <<CRON
# daily backup 03:15 UTC
15 3 * * * /bin/sh /etc/wallhaze/crontab-runner.sh --daily
# weekly backup Sunday 04:15 UTC
15 4 * * 0 /bin/sh /etc/wallhaze/crontab-runner.sh --weekly
# integrity check 01:00 UTC daily
0 1 * * * /bin/sh /etc/wallhaze/crontab-runner.sh --verify
# retention dry-run every 30 minutes (log only; deletion switch stays OFF)
*/30 * * * * /bin/sh /etc/wallhaze/crontab-runner.sh --retention-dry-run
CRON

exec crond -f -l 8
