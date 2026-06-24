// End-to-end smoke test for the PocketBase client logic against a live server.
// Validates: auth, create (FormData/Blob), list+filter, protected download.
//
//   node scripts/smoke-test.mjs http://127.0.0.1:8095 obsidian@local.sync <password>
import PocketBase from "pocketbase";

const [, , url, email, password] = process.argv;
if (!url || !email || !password) {
  console.error("usage: node smoke-test.mjs <url> <email> <password>");
  process.exit(1);
}

const COLLECTION = "vault_files";
const VAULT = "smoke-test";
const pb = new PocketBase(url);
pb.autoCancellation(false);

const ok = (m) => console.log("  ✓ " + m);

await pb.collection("users").authWithPassword(email, password);
ok("authenticated as " + email);

// clean any prior test record
const prior = await pb.collection(COLLECTION).getFullList({
  filter: pb.filter("vault = {:v}", { v: VAULT }),
});
for (const r of prior) await pb.collection(COLLECTION).delete(r.id);
if (prior.length) ok(`cleaned ${prior.length} prior test record(s)`);

// create
const text = "hello pocketbase " + new Date().toISOString();
const data = new TextEncoder().encode(text).buffer;
const form = new FormData();
form.set("vault", VAULT);
form.set("path", "notes/smoke.md");
form.set("hash", "deadbeef");
form.set("mtime", "123456");
form.set("size", String(data.byteLength));
form.set("deleted", "false");
form.set("content", new Blob([data]), "notes_smoke.md");
const rec = await pb.collection(COLLECTION).create(form);
ok("created record id=" + rec.id + " content=" + rec.content);

// list + filter
const list = await pb.collection(COLLECTION).getFullList({
  filter: pb.filter("vault = {:v}", { v: VAULT }),
  fields: "id,path,hash,mtime,size,deleted,content",
});
ok("listed " + list.length + " record(s), path=" + list[0].path);

// protected download
const token = await pb.files.getToken();
const dlUrl = pb.files.getURL(rec, rec.content, { token });
const res = await fetch(dlUrl);
const got = await res.text();
if (got !== text) throw new Error(`download mismatch: '${got}' != '${text}'`);
ok("downloaded content matches (" + got.length + " bytes)");

// tombstone update
await pb.collection(COLLECTION).update(rec.id, { deleted: true, mtime: 999 });
ok("tombstoned record");

// cleanup
await pb.collection(COLLECTION).delete(rec.id);
ok("cleaned up test record");

console.log("\nALL CHECKS PASSED ✓");
