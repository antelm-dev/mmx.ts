import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { parseDocument, serializeDocument } from "../core/persistence.js";
import { useUiStore } from "../store/uiStore.js";
import { actionBtn, actions, cx, panel } from "../ui.js";
import { setupMonaco } from "./monacoSetup.js";

setupMonaco();

/**
 * A Monaco-backed live view of the current {@link LevelDocument} as JSON. Edits
 * stay in a local buffer until "Apply" parses + migrates them and opens the
 * result as a fresh document (which clears history, like Import). The buffer
 * re-syncs whenever the underlying document identity changes.
 */
export function JsonPanel() {
  const snap = useEditorSnapshot();
  const colorTheme = useUiStore((s) => s.colorTheme);
  const doc = snap.state.document;
  const serialized = useMemo(() => serializeDocument(doc), [doc]);
  const [buffer, setBuffer] = useState(serialized);

  // Re-sync when the document changes underneath us (undo/redo/open/edit).
  useEffect(() => setBuffer(serialized), [serialized]);

  const dirty = buffer !== serialized;

  const apply = (): void => {
    try {
      const next = parseDocument(buffer);
      editor.store.open(next);
      editor.toast("Applied JSON changes.");
    } catch (error) {
      editor.toast(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className={panel}>
      <div className={cx(actions, "border-b border-border")}>
        <button className={actionBtn} disabled={!dirty} onClick={apply}>
          Apply changes
        </button>
        <button className={actionBtn} disabled={!dirty} onClick={() => setBuffer(serialized)}>
          Revert
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-surface">
        <Editor
          height="100%"
          language="json"
          theme={colorTheme === "dark" ? "vs-dark" : "light"}
          value={buffer}
          onChange={(v) => setBuffer(v ?? "")}
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
