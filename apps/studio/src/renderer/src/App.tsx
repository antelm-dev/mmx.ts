import { useCallback, useEffect, type ReactElement } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import { editor } from "./app/useEditor.js";
import { buildDefaultLayout, setDockApi } from "./app/dock.js";
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
import { Toasts } from "./components/Toasts.js";
import { useUiStore } from "./store/uiStore.js";
import { cx } from "./ui.js";
import {
  ensureStudioClientSettings,
  getStudioClientSettingsStore,
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
};

/** Root layout: a fixed command toolbar above a user-configurable Dockview workspace. */
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
      if (want !== current) await api.toggleFullscreen();
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [setFullscreen, addToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => editor.handleKeydown(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onReady = useCallback(({ api }: DockviewReadyEvent) => {
    setDockApi(api);
    buildDefaultLayout(api);
  }, []);

  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <div
        className={cx(
          "grid h-screen w-screen",
          fullscreen ? "grid-rows-[36px_minmax(0,1fr)]" : "grid-rows-[32px_36px_minmax(0,1fr)]",
        )}
      >
        {!fullscreen && <TitleBar />}
        <Toolbar />
        <main className="min-h-0 min-w-0 overflow-hidden bg-bg">
          <DockviewReact
            className="dockview-theme-studio studio-workspace"
            components={dockComponents}
            onReady={onReady}
          />
        </main>
      </div>
      <Toasts />
    </RadixTooltip.Provider>
  );
}
