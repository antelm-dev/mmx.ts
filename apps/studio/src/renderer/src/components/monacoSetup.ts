import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";

/**
 * Self-host Monaco instead of loading it from a CDN. The Electron renderer runs
 * under a strict `script-src 'self'` CSP, so both the editor core and its JSON
 * language worker are bundled locally by Vite (`?worker`) and handed to
 * `@monaco-editor/react`'s loader.
 */
let configured = false;

export function setupMonaco(): void {
  if (configured) return;
  configured = true;
  self.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === "json") return new jsonWorker();
      return new editorWorker();
    },
  };
  loader.config({ monaco });
}
