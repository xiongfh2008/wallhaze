# Private media quarantine

This directory is **outside `public/`** and is never served by Next.js.

- `review-pending/styles/` holds the 31 legacy style-preview JPEGs moved out
  of `public/images/styles/` on 2026-10-24.
- `manifest.json` is the reversible mapping: original public path, private
  path, SHA-256, byte size, move time and reason.
- `audit-log.jsonl` records takedown/restore decisions.

Do not delete these files. To publish one again, a human reviewer must record
evidence and run:

```bash
node scripts/media/rights-admin.mjs restore \
  --asset style.<id> \
  --reviewer <name> \
  --decision verified \
  --license CC0-1.0 \
  --license-url <url> \
  --evidence "<what was checked and where>" \
  --reason "<why it is safe to republish>"
```

Pending files must not be copied back into `public/` manually; that would
bypass the registry and fail `node scripts/media/check-rights.mjs`.
