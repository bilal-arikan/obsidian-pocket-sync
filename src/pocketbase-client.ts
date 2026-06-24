import PocketBase, { RecordModel } from "pocketbase";
import { COLLECTION, PluginSettings, RemoteFile } from "./types";

// Thin wrapper around the PocketBase SDK scoped to the vault_files collection.
// Handles auth, listing, content download, and create/update/delete of records.
export class PocketBaseClient {
  private pb: PocketBase;
  private settings: PluginSettings;

  constructor(settings: PluginSettings) {
    this.settings = settings;
    this.pb = new PocketBase(settings.serverUrl);
    // We manage auth manually each session; don't persist to localStorage.
    this.pb.autoCancellation(false);
  }

  get authed(): boolean {
    return this.pb.authStore.isValid;
  }

  // Authenticate as a regular collection user (users collection).
  async authenticate(): Promise<void> {
    await this.pb
      .collection("users")
      .authWithPassword(this.settings.email, this.settings.password);
  }

  // Verify the server is reachable and the collection exists.
  async healthCheck(): Promise<string> {
    const health = await this.pb.health.check();
    return health.message ?? "ok";
  }

  private toRemote(rec: RecordModel): RemoteFile {
    return {
      recordId: rec.id,
      path: rec.path as string,
      hash: rec.hash as string,
      mtime: Number(rec.mtime ?? 0),
      size: Number(rec.size ?? 0),
      deleted: Boolean(rec.deleted),
      updated: rec.updated as string,
    };
  }

  // Return every record (including tombstones) for the current vault.
  async listRemote(): Promise<Map<string, RemoteFile>> {
    const records = await this.pb.collection(COLLECTION).getFullList({
      filter: this.pb.filter("vault = {:vault}", { vault: this.settings.vaultId }),
      fields: "id,path,hash,mtime,size,deleted,updated,content",
      batch: 500,
    });
    const map = new Map<string, RemoteFile>();
    for (const rec of records) {
      const r = this.toRemote(rec);
      // Keep the file-field name around for download URL building.
      (r as RemoteFile & { _content?: string })._content = rec.content as string;
      map.set(r.path, r);
    }
    return map;
  }

  // Download the binary content of a remote file record.
  async downloadContent(remote: RemoteFile): Promise<ArrayBuffer> {
    const filename = (remote as RemoteFile & { _content?: string })._content;
    if (!filename) return new ArrayBuffer(0);
    // Protected files require a short-lived file token.
    const token = await this.pb.files.getToken();
    const url = this.pb.files.getURL(
      { id: remote.recordId, collectionId: COLLECTION, collectionName: COLLECTION },
      filename,
      { token }
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${remote.path}`);
    return await res.arrayBuffer();
  }

  private buildForm(
    path: string,
    data: ArrayBuffer,
    hash: string,
    mtime: number,
    deleted: boolean
  ): FormData {
    const form = new FormData();
    form.set("vault", this.settings.vaultId);
    form.set("path", path);
    form.set("hash", hash);
    form.set("mtime", String(mtime));
    form.set("size", String(data.byteLength));
    form.set("deleted", deleted ? "true" : "false");
    // Use a stable, filesystem-safe filename for the stored blob.
    const safeName = path.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
    form.set("content", new Blob([data]), safeName);
    return form;
  }

  // Create a new record with content. Returns the record id.
  async createFile(
    path: string,
    data: ArrayBuffer,
    hash: string,
    mtime: number
  ): Promise<string> {
    const form = this.buildForm(path, data, hash, mtime, false);
    const rec = await this.pb.collection(COLLECTION).create(form);
    return rec.id;
  }

  // Update an existing record's content/metadata. Returns the record id.
  async updateFile(
    recordId: string,
    path: string,
    data: ArrayBuffer,
    hash: string,
    mtime: number
  ): Promise<string> {
    const form = this.buildForm(path, data, hash, mtime, false);
    const rec = await this.pb.collection(COLLECTION).update(recordId, form);
    return rec.id;
  }

  // Mark a record as deleted (tombstone) so other clients remove it locally.
  async tombstone(recordId: string, mtime: number): Promise<void> {
    await this.pb.collection(COLLECTION).update(recordId, {
      deleted: true,
      mtime,
    });
  }
}
