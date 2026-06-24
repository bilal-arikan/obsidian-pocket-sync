import { Notice, Plugin } from "obsidian";
import { PocketBaseClient } from "./pocketbase-client";
import { PocketBaseSyncSettingTab } from "./settings";
import { SyncEngine } from "./sync-engine";
import { DEFAULT_SETTINGS, PluginSettings, SyncResult } from "./types";
import { formatTime } from "./utils";

export default class PocketBaseSyncPlugin extends Plugin {
  settings!: PluginSettings;
  private statusBar?: HTMLElement;
  private autoSyncTimer: number | null = null;
  private syncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.statusBar = this.addStatusBarItem();
    this.updateStatus("idle");

    this.addRibbonIcon("refresh-cw", "PocketBase Sync now", () => {
      void this.runSync("manual");
    });

    this.addCommand({
      id: "pocketbase-sync-now",
      name: "Sync now",
      callback: () => void this.runSync("manual"),
    });

    this.addSettingTab(new PocketBaseSyncSettingTab(this.app, this));

    if (this.settings.syncOnStartup) {
      // Defer until the workspace is ready to avoid racing initial indexing.
      this.app.workspace.onLayoutReady(() => void this.runSync("startup"));
    }

    this.restartAutoSync();
  }

  onunload(): void {
    this.stopAutoSync();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  restartAutoSync(): void {
    this.stopAutoSync();
    if (!this.settings.autoSync) return;
    const ms = Math.max(30, this.settings.syncIntervalSeconds) * 1000;
    this.autoSyncTimer = window.setInterval(() => {
      void this.runSync("auto");
    }, ms);
    this.registerInterval(this.autoSyncTimer);
  }

  private stopAutoSync(): void {
    if (this.autoSyncTimer !== null) {
      window.clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  async runSync(trigger: "manual" | "auto" | "startup"): Promise<void> {
    if (this.syncing) {
      if (trigger === "manual") new Notice("PocketBase Sync: already syncing…");
      return;
    }
    if (!this.settings.serverUrl || !this.settings.email) {
      if (trigger === "manual") {
        new Notice("PocketBase Sync: configure server and credentials first.");
      }
      return;
    }

    this.syncing = true;
    this.updateStatus("syncing");
    try {
      const client = new PocketBaseClient(this.settings);
      const engine = new SyncEngine(this.app.vault.adapter, client, this.settings);
      const result = await engine.sync();
      await this.saveSettings();
      this.reportResult(result, trigger);
      this.updateStatus("idle");
    } catch (e) {
      console.error("[pocketbase-sync] sync failed:", e);
      new Notice(`PocketBase Sync failed: ${(e as Error).message}`);
      this.updateStatus("error");
    } finally {
      this.syncing = false;
    }
  }

  private reportResult(r: SyncResult, trigger: string): void {
    const changed =
      r.pushed + r.pulled + r.deletedLocal + r.deletedRemote + r.conflicts;
    if (trigger !== "auto" || changed > 0 || r.errors.length) {
      const parts = [
        `↑${r.pushed}`,
        `↓${r.pulled}`,
        `⌫local ${r.deletedLocal}`,
        `⌫remote ${r.deletedRemote}`,
      ];
      if (r.conflicts) parts.push(`⚠ ${r.conflicts} conflicts`);
      if (r.errors.length) parts.push(`✗ ${r.errors.length} errors`);
      new Notice(`PocketBase Sync: ${parts.join("  ")}`);
    }
  }

  private updateStatus(state: "idle" | "syncing" | "error"): void {
    if (!this.statusBar) return;
    const last = formatTime(this.settings.lastSyncAt);
    const labels: Record<typeof state, string> = {
      idle: `PB ✓ ${last}`,
      syncing: "PB ⟳ syncing…",
      error: "PB ✗ error",
    };
    this.statusBar.setText(labels[state]);
    this.statusBar.title = `PocketBase Sync — last: ${last}`;
  }
}
