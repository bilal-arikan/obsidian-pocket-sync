// Shared type definitions for the PocketBase Sync plugin.

export type ConflictStrategy = "newer" | "local" | "remote";

export interface PluginSettings {
  // Connection
  serverUrl: string;
  email: string;
  password: string;
  // Identifies which logical vault these files belong to on the server.
  vaultId: string;

  // Behavior
  autoSync: boolean;
  syncIntervalSeconds: number;
  syncOnStartup: boolean;
  conflictStrategy: ConflictStrategy;
  // Glob-like prefixes/patterns to skip (one per line).
  ignorePatterns: string[];
  // Back up the overwritten side of a conflict into _sync_conflicts/.
  backupConflicts: boolean;

  // Internal state (not user facing).
  // Map of vault-relative path -> hash recorded at the last successful sync.
  // This is the "base" used for 3-way conflict detection.
  lastSyncState: Record<string, SyncSnapshotEntry>;
  lastSyncAt: number;
}

export interface SyncSnapshotEntry {
  hash: string;
  mtime: number;
  // PocketBase record id, when known, to allow targeted updates/deletes.
  recordId?: string;
}

// A local file as discovered while scanning the vault.
export interface LocalFile {
  path: string;
  mtime: number;
  size: number;
  hash: string;
}

// A file record as stored on the PocketBase server.
export interface RemoteFile {
  recordId: string;
  path: string;
  hash: string;
  mtime: number;
  size: number;
  deleted: boolean;
  // Server's own updated timestamp (ISO string).
  updated: string;
}

export type SyncAction =
  | "push-create"
  | "push-update"
  | "push-delete"
  | "pull-create"
  | "pull-update"
  | "pull-delete"
  | "conflict-resolved"
  | "skip";

export interface SyncResult {
  pushed: number;
  pulled: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: number;
  errors: string[];
  durationMs: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "http://127.0.0.1:8095",
  email: "",
  password: "",
  vaultId: "default",
  autoSync: false,
  syncIntervalSeconds: 120,
  syncOnStartup: false,
  conflictStrategy: "newer",
  // Device-specific files are excluded by default. The plugin also always
  // excludes its own folder in code, regardless of these patterns.
  ignorePatterns: [
    ".obsidian/workspace.json",
    ".obsidian/workspace-mobile.json",
    ".trash/",
    "_sync_conflicts/",
  ],
  backupConflicts: true,
  lastSyncState: {},
  lastSyncAt: 0,
};

// Name of the PocketBase collection holding vault files.
export const COLLECTION = "vault_files";
