// Small helpers shared across the plugin.

// 64-bit content hash built from two independent 32-bit FNV-1a style
// accumulators, returned as a 16-char hex string. Fast, dependency-free,
// and collision-resistant enough to detect file content changes.
export function hashBytes(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let h1 = 0x811c9dc5; // FNV offset basis
  let h2 = 0x01000193 ^ bytes.length; // second accumulator seeded with length
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

// Normalize a vault path to forward slashes, no leading slash.
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

// Returns true if the given vault-relative path matches any ignore pattern.
// Patterns ending in "/" match directories (prefix match); otherwise exact
// or simple "*" wildcard match.
export function isIgnored(path: string, patterns: string[]): boolean {
  const p = normalizePath(path);
  for (const raw of patterns) {
    const pat = raw.trim();
    if (!pat) continue;
    if (pat.endsWith("/")) {
      if (p === pat.slice(0, -1) || p.startsWith(pat)) return true;
    } else if (pat.includes("*")) {
      const re = new RegExp(
        "^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
      );
      if (re.test(p)) return true;
    } else if (p === pat) {
      return true;
    }
  }
  return false;
}

export function formatTime(ts: number): string {
  if (!ts) return "never";
  const d = new Date(ts);
  return d.toLocaleString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
