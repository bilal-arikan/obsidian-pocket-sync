import { DataAdapter } from "obsidian";
import { PocketBaseClient } from "./pocketbase-client";
import {
  LocalFile,
  PluginSettings,
  RemoteFile,
  SyncResult,
  SyncSnapshotEntry,
} from "./types";
import { scanVault } from "./vault-index";
import { normalizePath } from "./utils";

// Live progress reported during a sync pass (for the status bar / notices).
export interface SyncProgress {
  phase: "scan" | "list" | "apply" | "done";
  done: number;
  total: number;
  pushed: number;
  pulled: number;
}

// A single resolved operation to perform during a sync pass.
interface Op {
  path: string;
  kind:
    | "push-create"
    | "push-update"
    | "push-delete"
    | "pull-create"
    | "pull-update"
    | "pull-delete";
  local?: LocalFile;
  remote?: RemoteFile;
  isConflict?: boolean;
}

// Orchestrates a full bidirectional sync using a last-sync snapshot as the
// merge base (3-way diff), then persists a fresh snapshot.
export class SyncEngine {
  constructor(
    private adapter: DataAdapter,
    private client: PocketBaseClient,
    private settings: PluginSettings,
    private onProgress?: (p: SyncProgress) => void
  ) {}

  private report(p: SyncProgress): void {
    try {
      this.onProgress?.(p);
    } catch {
      /* progress sink must never break a sync */
    }
  }

  async sync(): Promise<SyncResult> {
    const start = Date.now();
    const result: SyncResult = {
      pushed: 0,
      pulled: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: 0,
      errors: [],
      durationMs: 0,
    };

    if (!this.client.authed) {
      await this.client.authenticate();
    }

    this.report({ phase: "scan", done: 0, total: 0, pushed: 0, pulled: 0 });
    const local = await scanVault(this.adapter, this.settings.ignorePatterns);

    this.report({ phase: "list", done: 0, total: 0, pushed: 0, pulled: 0 });
    const remote = await this.client.listRemote();
    const base = this.settings.lastSyncState;

    const ops = this.computeOps(local, remote, base);
    const total = ops.length;

    // Fresh snapshot we build as operations succeed. Start from current
    // converged state (both sides equal) and mutate per op.
    const newSnapshot: Record<string, SyncSnapshotEntry> = {};
    this.seedConverged(local, remote, base, newSnapshot);

    let done = 0;
    this.report({ phase: "apply", done, total, pushed: 0, pulled: 0 });
    for (const op of ops) {
      try {
        await this.applyOp(op, newSnapshot, result);
        if (op.isConflict) result.conflicts++;
      } catch (e) {
        const msg = `${op.kind} ${op.path}: ${(e as Error).message}`;
        console.error("[pocketbase-sync]", msg, e);
        result.errors.push(msg);
      }
      done++;
      this.report({
        phase: "apply",
        done,
        total,
        pushed: result.pushed,
        pulled: result.pulled,
      });
    }

    this.settings.lastSyncState = newSnapshot;
    this.settings.lastSyncAt = Date.now();
    result.durationMs = Date.now() - start;
    this.report({
      phase: "done",
      done,
      total,
      pushed: result.pushed,
      pulled: result.pulled,
    });
    return result;
  }

  // Paths that are identical on both sides (and need no op) are recorded
  // straight into the new snapshot so they survive into the next base.
  private seedConverged(
    local: Map<string, LocalFile>,
    remote: Map<string, RemoteFile>,
    base: Record<string, SyncSnapshotEntry>,
    snapshot: Record<string, SyncSnapshotEntry>
  ): void {
    for (const [path, l] of local) {
      const r = remote.get(path);
      if (r && !r.deleted && r.hash === l.hash) {
        snapshot[path] = { hash: l.hash, mtime: l.mtime, recordId: r.recordId };
      }
    }
    void base;
  }

  // The 3-way diff. For each path across all three sources, decide the action.
  private computeOps(
    local: Map<string, LocalFile>,
    remote: Map<string, RemoteFile>,
    base: Record<string, SyncSnapshotEntry>
  ): Op[] {
    const ops: Op[] = [];
    const paths = new Set<string>([
      ...local.keys(),
      ...remote.keys(),
      ...Object.keys(base),
    ]);

    for (const path of paths) {
      const l = local.get(path);
      const r = remote.get(path);
      const b = base[path];

      const remoteAlive = r && !r.deleted;
      const localChanged = l ? !b || b.hash !== l.hash : !!b; // changed or deleted
      const remoteChanged = r
        ? !b || b.hash !== r.hash || (r.deleted && (!b || true))
        : !!b;

      // Case: nothing on either side anymore.
      if (!l && !remoteAlive) {
        // Both gone (or remote tombstoned and local absent) -> drop from base.
        continue;
      }

      // Case: only local exists (no remote record at all, no base).
      if (l && !r) {
        ops.push({ path, kind: "push-create", local: l });
        continue;
      }

      // Case: only remote exists alive (no local, no base).
      if (!l && remoteAlive && !b) {
        ops.push({ path, kind: "pull-create", remote: r });
        continue;
      }

      // From here, at least a base or both sides are involved.

      // Local deleted (was in base, gone now).
      if (!l && b) {
        if (remoteAlive && r && r.hash !== b.hash) {
          // delete vs edit conflict
          this.resolveDeleteEdit(ops, path, undefined, r, b, "local-deleted");
        } else if (remoteAlive && r) {
          // remote unchanged -> propagate deletion
          ops.push({ path, kind: "push-delete", remote: r });
        }
        // else remote already deleted -> nothing
        continue;
      }

      // Remote deleted (tombstone), local still present.
      if (l && r && r.deleted) {
        if (b && b.hash === l.hash) {
          // local unchanged since base -> honor remote deletion
          ops.push({ path, kind: "pull-delete", local: l });
        } else {
          // local changed vs a remote deletion -> conflict
          this.resolveDeleteEdit(ops, path, l, r, b, "remote-deleted");
        }
        continue;
      }

      // Both present and alive from here.
      if (l && remoteAlive && r) {
        if (l.hash === r.hash) {
          continue; // converged, seeded already
        }
        if (!localChanged && remoteChanged) {
          ops.push({ path, kind: "pull-update", remote: r });
        } else if (localChanged && !remoteChanged) {
          ops.push({ path, kind: "push-update", local: l, remote: r });
        } else {
          // both changed -> conflict
          this.resolveEditEdit(ops, path, l, r);
        }
      }
    }

    return ops;
  }

  // edit/edit conflict: pick winner by configured strategy.
  private resolveEditEdit(ops: Op[], path: string, l: LocalFile, r: RemoteFile): void {
    const localWins =
      this.settings.conflictStrategy === "local" ||
      (this.settings.conflictStrategy === "newer" && l.mtime >= r.mtime);
    if (localWins) {
      ops.push({ path, kind: "push-update", local: l, remote: r, isConflict: true });
    } else {
      ops.push({ path, kind: "pull-update", remote: r, local: l, isConflict: true });
    }
  }

  // delete/edit conflict resolution.
  private resolveDeleteEdit(
    ops: Op[],
    path: string,
    l: LocalFile | undefined,
    r: RemoteFile,
    b: SyncSnapshotEntry | undefined,
    which: "local-deleted" | "remote-deleted"
  ): void {
    const strat = this.settings.conflictStrategy;
    // "newer": a side that changed after base wins over a deletion.
    if (which === "local-deleted") {
      // local removed, remote edited
      const remoteWins =
        strat === "remote" || (strat === "newer" && (!b || r.mtime >= b.mtime));
      if (remoteWins) {
        ops.push({ path, kind: "pull-create", remote: r, isConflict: true });
      } else {
        ops.push({ path, kind: "push-delete", remote: r, isConflict: true });
      }
    } else {
      // remote deleted, local edited
      const localWins =
        strat === "local" || (strat === "newer" && l !== undefined && (!b || l.mtime >= b.mtime));
      if (localWins && l) {
        ops.push({ path, kind: "push-update", local: l, remote: r, isConflict: true });
      } else if (l) {
        ops.push({ path, kind: "pull-delete", local: l, isConflict: true });
      }
    }
  }

  private async applyOp(
    op: Op,
    snapshot: Record<string, SyncSnapshotEntry>,
    result: SyncResult
  ): Promise<void> {
    switch (op.kind) {
      case "push-create": {
        const data = await this.adapter.readBinary(op.path);
        const id = await this.client.createFile(
          op.path,
          data,
          op.local!.hash,
          op.local!.mtime
        );
        snapshot[op.path] = { hash: op.local!.hash, mtime: op.local!.mtime, recordId: id };
        result.pushed++;
        break;
      }
      case "push-update": {
        const data = await this.adapter.readBinary(op.path);
        if (op.isConflict && this.settings.backupConflicts && op.remote) {
          await this.backupRemote(op.remote);
        }
        const id = await this.client.updateFile(
          op.remote!.recordId,
          op.path,
          data,
          op.local!.hash,
          op.local!.mtime
        );
        snapshot[op.path] = { hash: op.local!.hash, mtime: op.local!.mtime, recordId: id };
        result.pushed++;
        break;
      }
      case "push-delete": {
        await this.client.tombstone(op.remote!.recordId, Date.now());
        delete snapshot[op.path];
        result.deletedRemote++;
        break;
      }
      case "pull-create":
      case "pull-update": {
        if (
          op.kind === "pull-update" &&
          op.isConflict &&
          this.settings.backupConflicts &&
          op.local
        ) {
          await this.backupLocal(op.path);
        }
        const data = await this.client.downloadContent(op.remote!);
        await this.writeLocal(op.path, data);
        snapshot[op.path] = {
          hash: op.remote!.hash,
          mtime: op.remote!.mtime,
          recordId: op.remote!.recordId,
        };
        result.pulled++;
        break;
      }
      case "pull-delete": {
        if (this.settings.backupConflicts && op.isConflict) {
          await this.backupLocal(op.path);
        }
        if (await this.adapter.exists(op.path)) {
          await this.adapter.remove(op.path);
        }
        delete snapshot[op.path];
        result.deletedLocal++;
        break;
      }
    }
  }

  // Write a remote blob to a local path, creating parent folders as needed.
  private async writeLocal(path: string, data: ArrayBuffer): Promise<void> {
    await this.ensureDir(path);
    await this.adapter.writeBinary(path, data);
  }

  private async ensureDir(path: string): Promise<void> {
    const norm = normalizePath(path);
    const idx = norm.lastIndexOf("/");
    if (idx < 0) return;
    const dir = norm.slice(0, idx);
    const parts = dir.split("/");
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!(await this.adapter.exists(cur))) {
        await this.adapter.mkdir(cur);
      }
    }
  }

  // Copy current local content into _sync_conflicts before it is overwritten.
  private async backupLocal(path: string): Promise<void> {
    try {
      if (!(await this.adapter.exists(path))) return;
      const data = await this.adapter.readBinary(path);
      const dest = this.conflictPath(path, "local");
      await this.writeLocal(dest, data);
    } catch (e) {
      console.warn("[pocketbase-sync] backupLocal failed:", e);
    }
  }

  // Save the remote version into _sync_conflicts before pushing over it.
  private async backupRemote(remote: RemoteFile): Promise<void> {
    try {
      const data = await this.client.downloadContent(remote);
      const dest = this.conflictPath(remote.path, "remote");
      await this.writeLocal(dest, data);
    } catch (e) {
      console.warn("[pocketbase-sync] backupRemote failed:", e);
    }
  }

  private conflictPath(path: string, side: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `_sync_conflicts/${path}.${side}.${stamp}`;
  }
}
