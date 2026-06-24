import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type PocketBaseSyncPlugin from "./main";
import { PocketBaseClient } from "./pocketbase-client";
import { ConflictStrategy } from "./types";
import { formatTime } from "./utils";

export class PocketBaseSyncSettingTab extends PluginSettingTab {
  plugin: PocketBaseSyncPlugin;

  constructor(app: App, plugin: PocketBaseSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "PocketBase Sync" });

    // ---- Connection ----
    containerEl.createEl("h3", { text: "Connection" });

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("Base URL of your PocketBase server, e.g. http://127.0.0.1:8090")
      .addText((t) =>
        t
          .setPlaceholder("http://127.0.0.1:8090")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (v) => {
            this.plugin.settings.serverUrl = v.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Email")
      .setDesc("Account in the PocketBase 'users' collection.")
      .addText((t) =>
        t
          .setPlaceholder("you@example.com")
          .setValue(this.plugin.settings.email)
          .onChange(async (v) => {
            this.plugin.settings.email = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Password")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.password).onChange(async (v) => {
          this.plugin.settings.password = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Vault ID")
      .setDesc(
        "Logical name shared by all devices syncing the same vault. Keep it identical everywhere."
      )
      .addText((t) =>
        t
          .setPlaceholder("default")
          .setValue(this.plugin.settings.vaultId)
          .onChange(async (v) => {
            this.plugin.settings.vaultId = v.trim() || "default";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify the server is reachable and credentials work.")
      .addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          b.setDisabled(true);
          try {
            const client = new PocketBaseClient(this.plugin.settings);
            await client.healthCheck();
            await client.authenticate();
            new Notice("PocketBase Sync: connection OK ✓");
          } catch (e) {
            new Notice(`PocketBase Sync: connection failed — ${(e as Error).message}`);
          } finally {
            b.setDisabled(false);
          }
        })
      );

    // ---- Behavior ----
    containerEl.createEl("h3", { text: "Behavior" });

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("Run a sync automatically when Obsidian loads.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Auto sync")
      .setDesc("Periodically sync in the background.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoSync).onChange(async (v) => {
          this.plugin.settings.autoSync = v;
          await this.plugin.saveSettings();
          this.plugin.restartAutoSync();
        })
      );

    new Setting(containerEl)
      .setName("Auto sync interval (seconds)")
      .setDesc("How often to sync when auto sync is enabled. Minimum 30.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.syncIntervalSeconds))
          .onChange(async (v) => {
            const n = Math.max(30, parseInt(v, 10) || 120);
            this.plugin.settings.syncIntervalSeconds = n;
            await this.plugin.saveSettings();
            this.plugin.restartAutoSync();
          })
      );

    new Setting(containerEl)
      .setName("Conflict strategy")
      .setDesc("How to resolve files changed on both sides since the last sync.")
      .addDropdown((d) =>
        d
          .addOption("newer", "Newer wins (by modified time)")
          .addOption("local", "Local always wins")
          .addOption("remote", "Remote always wins")
          .setValue(this.plugin.settings.conflictStrategy)
          .onChange(async (v) => {
            this.plugin.settings.conflictStrategy = v as ConflictStrategy;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Back up conflicts")
      .setDesc("Save the overwritten side into _sync_conflicts/ before resolving.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.backupConflicts).onChange(async (v) => {
          this.plugin.settings.backupConflicts = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Ignore patterns")
      .setDesc(
        "One per line. End with / for folders, use * as wildcard. e.g. .obsidian/workspace.json"
      )
      .addTextArea((t) => {
        t.inputEl.rows = 5;
        t.inputEl.style.width = "100%";
        t.setValue(this.plugin.settings.ignorePatterns.join("\n")).onChange(async (v) => {
          this.plugin.settings.ignorePatterns = v
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
        });
      });

    // ---- Maintenance ----
    containerEl.createEl("h3", { text: "Maintenance" });

    new Setting(containerEl)
      .setName("Last sync")
      .setDesc(formatTime(this.plugin.settings.lastSyncAt));

    new Setting(containerEl)
      .setName("Reset sync state")
      .setDesc(
        "Clears the local snapshot. Next sync treats all files as new and merges by content (no data loss, but slower)."
      )
      .addButton((b) =>
        b
          .setButtonText("Reset")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.lastSyncState = {};
            this.plugin.settings.lastSyncAt = 0;
            await this.plugin.saveSettings();
            new Notice("PocketBase Sync: sync state reset.");
            this.display();
          })
      );
  }
}
