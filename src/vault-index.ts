import { DataAdapter } from "obsidian";
import { LocalFile } from "./types";
import { hashBytes, isIgnored, normalizePath } from "./utils";

// Recursively walk the vault through the data adapter (covers dotfiles like
// .obsidian config too) and build a path -> LocalFile index.
export async function scanVault(
  adapter: DataAdapter,
  ignorePatterns: string[]
): Promise<Map<string, LocalFile>> {
  const result = new Map<string, LocalFile>();
  await walk(adapter, "", ignorePatterns, result);
  return result;
}

async function walk(
  adapter: DataAdapter,
  dir: string,
  ignorePatterns: string[],
  out: Map<string, LocalFile>
): Promise<void> {
  const listing = await adapter.list(dir);

  for (const folder of listing.folders) {
    const rel = normalizePath(folder);
    if (isIgnored(rel + "/", ignorePatterns) || isIgnored(rel, ignorePatterns)) continue;
    await walk(adapter, folder, ignorePatterns, out);
  }

  for (const file of listing.files) {
    const rel = normalizePath(file);
    if (isIgnored(rel, ignorePatterns)) continue;
    try {
      const stat = await adapter.stat(file);
      const data = await adapter.readBinary(file);
      out.set(rel, {
        path: rel,
        mtime: stat?.mtime ?? 0,
        size: stat?.size ?? data.byteLength,
        hash: hashBytes(data),
      });
    } catch (e) {
      // File may have been removed mid-scan; skip it.
      console.warn(`[pocketbase-sync] could not read ${rel}:`, e);
    }
  }
}
