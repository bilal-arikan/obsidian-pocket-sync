// Copies the built plugin into an Obsidian vault's plugins folder.
//
//   node scripts/deploy.mjs "C:\\path\\to\\Vault"
//
// If no path is given, defaults to the main vault below.
import { copyFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_VAULT = "C:\\Users\\Bilal\\Documents\\Obsidian Vault";
const PLUGIN_ID = "pocketbase-sync";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const vault = process.argv[2] || DEFAULT_VAULT;
const dest = join(vault, ".obsidian", "plugins", PLUGIN_ID);

const files = ["main.js", "manifest.json"];
const optional = ["styles.css"];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(dest, { recursive: true });

for (const f of files) {
  await copyFile(join(projectDir, f), join(dest, f));
  console.log(`copied ${f}`);
}
for (const f of optional) {
  if (await exists(join(projectDir, f))) {
    await copyFile(join(projectDir, f), join(dest, f));
    console.log(`copied ${f}`);
  }
}

console.log(`\nDeployed '${PLUGIN_ID}' to:\n  ${dest}`);
console.log("Reload Obsidian (or toggle the plugin) to pick up changes.");
