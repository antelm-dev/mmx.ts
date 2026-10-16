import { useCallback, useEffect, type ReactElement } from "react";
import { chakra } from "@chakra-ui/react";
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import { editor } from "./app/useEditor.js";
import { buildDefaultLayout, openPanel, setDockApi, START_PANEL } from "./app/dock.js";
import { TitleBar } from "./components/TitleBar.js";
import { Toolbar } from "./components/Toolbar.js";
import { PalettePanel } from "./components/PalettePanel.js";
import { ScenePanel } from "./components/ScenePanel.js";
import { Viewport } from "./components/Viewport.js";
import { Inspector } from "./components/Inspector.js";
import { RoomPanel } from "./components/RoomPanel.js";
import { AssetsPanel } from "./components/AssetsPanel.js";
import { ProblemsPanel } from "./components/ProblemsPanel.js";
import { SelectionPanel } from "./components/SelectionPanel.js";
import { JsonPanel } from "./components/JsonPanel.js";
import { SheetSlicerPanel } from "./components/SheetSlicerPanel.js";
import { ClipEditorPanel } from "./components/ClipEditorPanel.js";
import { EnemyEditorPanel } from "./components/EnemyEditorPanel.js";
import { TilesetDocument } from "./components/TilesetDocument.js";
import { Toasts } from "./components/Toasts.js";
import { ActivityBar } from "./components/ActivityBar.js";
import { StartPage } from "./components/StartPage.js";
import { useUiStore } from "./store/uiStore.js";

import {
  ensureStudioClientSettings,
  getStudioClientSettingsStore,
  showStartPageAtLaunch,
} from "./settings/studioClientSettings.js";

/** Dockview panel registry. Panels read the shared controller; props are unused. */
const dockComponents: Record<string, (props: IDockviewPanelProps) => ReactElement> = {
  viewport: () => <Viewport />,
  palette: () => <PalettePanel />,
  scene: (props) => <ScenePanel api={props.api} />,
  inspector: () => <Inspector />,
  room: () => <RoomPanel />,
  assets: () => <AssetsPanel />,
  problems: (props) => <ProblemsPanel api={props.api} />,
  selection: () => <SelectionPanel />,
  json: () => <JsonPanel />,
  slicer: () => <SheetSlicerPanel />,
  clips: () => <ClipEditorPanel />,
  enemy: () => <EnemyEditorPanel />,
  start: (props) => <StartPage api={props.api} />,
  tileset: (props) => <TilesetDocument params={props.params} />,
};

/** Root layout: a fixed command toolbar above the activity bar and a user-configurable Dockview workspace. */
export function App() {
  const fullscreen = useUiStore((s) => s.fullscreen);
  const setFullscreen = useUiStore((s) => s.setFullscreen);
  const addToast = useUiStore((s) => s.addToast);

  useEffect(() => {
    const api = window.studio?.window;
    if (!api) return;
    let cancelled = false;
    let eventSeen = false;
    const unsub = api.onFullscreenChanged((v) => {
      eventSeen = true;
      if (cancelled) return;
      setFullscreen(v);
      try {
        getStudioClientSettingsStore().patch({ window: { fullscreen: v } });
      } catch {
        /* store not ready yet */
      }
    });
    void (async () => {
      const settings = await ensureStudioClientSettings().catch((error: unknown) => {
        addToast(`settings load failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
      if (cancelled || !settings) return;
      const want = settings.snapshot().window.fullscreen;
      const current = await api.isFullscreen();
      if (cancelled) return;
      if (!eventSeen) setFullscreen(current);
      if (want && !current) await api.toggleFullscreen();
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [setFullscreen, addToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => editor.handleKeydown(e);
    // Captured, so a surface that stops propagation (the viewport) still claims undo.
    const onFocus = (e: Event) => editor.noteUndoScope(e.target);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onFocus, true);
    window.addEventListener("focusin", onFocus, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onFocus, true);
      window.removeEventListener("focusin", onFocus, true);
    };
  }, []);

  const onReady = useCallback(({ api }: DockviewReadyEvent) => {
    setDockApi(api);
    buildDefaultLayout(api);
    if (showStartPageAtLaunch()) openPanel(START_PANEL);
  }, []);

  return (
    <>
      <chakra.div
        display="grid"
        h="100vh"
        w="100vw"
        gridTemplateRows={fullscreen ? "36px minmax(0,1fr)" : "32px 36px minmax(0,1fr)"}
      >
        {!fullscreen && <TitleBar />}
        <Toolbar />
        <chakra.div display="grid" gridTemplateColumns="40px minmax(0,1fr)" minH="0">
          <ActivityBar />
          <chakra.main minH="0" minW="0" overflow="hidden" bg="studio.bg">
            <DockviewReact
              className="dockview-theme-studio studio-workspace"
              components={dockComponents}
              onReady={onReady}
            />
          </chakra.main>
        </chakra.div>
      </chakra.div>
      <Toasts />
    </>
  );
}
