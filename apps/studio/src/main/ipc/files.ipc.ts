import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { dialog } from "electron";
import { defineIpcModule, handle } from "electron-ipc-module";

/**
 * The `files` IPC module: native open/save dialogs for level documents.
 *
 * `defineIpcModule` registers each channel under the `files:` prefix
 * (`files:save-file`, `files:open-file`). The `electron-ipc-module` Rollup
 * plugin reads this file and generates the typed preload bridge, so the renderer
 * calls `window.studio.files.saveFile(...)` / `.openFile()` with full type
 * inference — no hand-written channel strings on either side.
 */
export function createFilesIpc() {
  return defineIpcModule("files", {
    "save-file": handle(
      async (_event, suggestedName: string, json: string): Promise<string | null> => {
        const name = suggestedName.endsWith(".json") ? suggestedName : `${suggestedName}.json`;
        const result = await dialog.showSaveDialog({
          title: "Save Level",
          defaultPath: name,
          filters: [{ name: "MMX Level", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return null;
        await writeFile(result.filePath, json, "utf8");
        return basename(result.filePath);
      },
    ),
    "open-file": handle(async (): Promise<{ name: string; json: string } | null> => {
      const result = await dialog.showOpenDialog({
        title: "Open Level",
        properties: ["openFile"],
        filters: [{ name: "MMX Level", extensions: ["json"] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0];
      const json = await readFile(filePath, "utf8");
      return { name: basename(filePath), json };
    }),
  });
}
