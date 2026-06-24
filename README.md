# Obsidian Pocket Sync

Sync your [Obsidian](https://obsidian.md) vault across devices through a
self-hosted [PocketBase](https://pocketbase.io) server. Bidirectional,
conflict-aware sync with full support for attachments and binary files.

## Quick Install

[![Install in Obsidian via BRAT](https://img.shields.io/badge/Obsidian-Install%20via%20BRAT-7C3AED?style=for-the-badge&logo=obsidian&logoColor=white)](https://bilal-arikan.github.io/obsidian-pocket-sync/install.html)

The button opens Obsidian and asks **BRAT** to add this repo. It needs the
[BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin installed and a
published GitHub release. If your browser blocks the redirect, paste this into the
address bar instead:

```
obsidian://brat?plugin=bilal-arikan/obsidian-pocket-sync
```

> GitHub strips custom-scheme (`obsidian://`) links in markdown, so the button
> points to a tiny HTTPS redirect page ([`install.html`](install.html) on GitHub
> Pages) that forwards to the Obsidian URI. The official
> `obsidian://show-plugin?id=` deep link only works for store-listed plugins.

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

## Installing on Other Devices (macOS, iOS, Android)

The plugin is three files — `main.js`, `manifest.json`, `styles.css` — that must live
in `<Vault>/.obsidian/plugins/pocketbase-sync/` on each device. There are two ways:

### Option A — BRAT (recommended for mobile)

1. In Obsidian, install the **BRAT** community plugin.
2. BRAT → *Add beta plugin* → enter `bilal-arikan/obsidian-pocket-sync`.
3. BRAT downloads the latest GitHub release and keeps it updated.
4. Enable **PocketBase Sync** in *Community plugins* and configure it.

> Requires a GitHub release that includes `main.js`, `manifest.json`, `styles.css`.

### Option B — Manual copy

- **macOS:** copy the three built files into
  `<Vault>/.obsidian/plugins/pocketbase-sync/`, then enable the plugin.
- **Android:** use a file manager to create the same folder inside your vault and
  copy the three files in.
- **iOS:** place the files via the Files app (vault must be under *On My iPhone →
  Obsidian* or iCloud Drive), then enable the plugin.

> **Server reachability:** mobile/macOS devices cannot reach `127.0.0.1`. Point the
> plugin's *Server URL* at your public HTTPS endpoint (e.g. `https://pb.example.com`)
> or the server's Tailscale IP if all devices share a tailnet.

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

## Author

**Bilal Arikan**
- GitHub: [@bilal-arikan](https://github.com/bilal-arikan)
- Email: bilal1993arikan@gmail.com

## License

[MIT](LICENSE) © Bilal Arikan
