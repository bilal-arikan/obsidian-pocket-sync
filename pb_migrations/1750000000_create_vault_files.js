/// <reference path="../pb_data/types.d.ts" />

// Creates the `vault_files` collection used by the Obsidian PocketBase Sync
// plugin. One record per file per vault; binary content stored in a file field.
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "vault_files",
      // Only authenticated users may read/write their synced files.
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        { name: "vault", type: "text", required: true, max: 255 },
        { name: "path", type: "text", required: true, max: 1024 },
        { name: "hash", type: "text", required: false, max: 64 },
        { name: "mtime", type: "number", required: false },
        { name: "size", type: "number", required: false },
        { name: "deleted", type: "bool", required: false },
        {
          name: "content",
          type: "file",
          required: false,
          maxSelect: 1,
          maxSize: 104857600, // 100 MB per file
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_vault_files_vault_path ON vault_files (vault, path)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("vault_files");
    app.delete(collection);
  }
);
