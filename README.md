# Obsidian Pocket Sync

Sync your [Obsidian](https://obsidian.md) vault across devices through a
self-hosted [PocketBase](https://pocketbase.io) server. Bidirectional,
conflict-aware sync with full support for attachments and binary files.

## Features

- **Bidirectional sync** using a 3-way merge (last-sync snapshot as the base),
  so it knows exactly which side changed.
- **Conflict handling** — `newer` / `local` / `remote` strategies, with optional
  backups of the overwritten side into `_sync_conflicts/`.
- **Any file type** — notes and binary attachments are stored as file records.
- **Manual, on-startup, and interval auto-sync**, with a status bar indicator.
- **Self-hosted** — your data stays on your own PocketBase server.

## Quick Start

1. **Run PocketBase** (locally or on a VPS via `deploy/docker-compose.yml`) and
   create a user account in the `users` collection.
2. **Build & install the plugin:**
   ```bash
   npm install
   npm run build
   node scripts/deploy.mjs "/path/to/Your Vault"
   ```
3. **Configure** in Obsidian: set the server URL, credentials, and a shared
   `Vault ID` (identical on every device), then run **Sync now**.

For a full VPS deployment guide (PocketBase + automatic HTTPS), see
[`deploy/README.md`](deploy/README.md).

## How It Works

Files are stored in a `vault_files` collection (one record per file, keyed by
`(vault, path)`). Each sync scans the vault, lists remote records, and diffs both
against the last-sync snapshot to decide what to push, pull, or delete.

## Development

```bash
npm run dev      # esbuild watch
npm run build    # type-check + production bundle
```

| Module | Responsibility |
|--------|----------------|
| `src/main.ts` | Plugin lifecycle, commands, auto-sync timer |
| `src/sync-engine.ts` | 3-way diff and operation execution |
| `src/pocketbase-client.ts` | PocketBase REST wrapper |
| `src/vault-index.ts` | Local file scan + hashing |
| `src/settings.ts` | Settings UI |

## License

[MIT](LICENSE) © Bilal Arikan
