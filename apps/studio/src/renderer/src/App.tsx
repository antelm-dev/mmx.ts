import { useCallback, useEffect, type ReactElement } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { editor } from "./app/useEditor.js";
import { setDockApi } from "./app/dock.js";
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => editor.handleKeydown(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onReady = useCallback(({ api }: DockviewReadyEvent) => {
    setDockApi(api);

    const viewport = api.addPanel({
      id: "viewport",
      component: "viewport",
      title: "Level",
      renderer: "always",
      minimumWidth: 320,
      minimumHeight: 240,
    });

    const palette = api.addPanel({
      id: "palette",
      component: "palette",
      title: "Object Palette",
      initialWidth: 264,
      minimumWidth: 220,
      maximumWidth: 320,
      position: { referencePanel: viewport, direction: "left" },
    });

    api.addPanel({
      id: "scene",
      component: "scene",
      title: "Scene",
      position: { referencePanel: palette, direction: "within" },
    });

    const inspector = api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      initialWidth: 300,
      minimumWidth: 260,
      maximumWidth: 380,
      position: { referencePanel: viewport, direction: "right" },
    });

    api.addPanel({
      id: "room",
      component: "room",
      title: "Room",
      position: { referencePanel: inspector, direction: "within" },
    });

    api.addPanel({
      id: "json",
      component: "json",
      title: "Document JSON",
      position: { referencePanel: inspector, direction: "within" },
    });

    const assets = api.addPanel({
      id: "assets",
      component: "assets",
      title: "Assets",
      initialHeight: 176,
      minimumHeight: 132,
      maximumHeight: 240,
      position: { referencePanel: viewport, direction: "below" },
    });

    const problems = api.addPanel({
      id: "problems",
      component: "problems",
      title: "Problems",
      position: { referencePanel: assets, direction: "right" },
    });

    api.addPanel({
      id: "selection",
      component: "selection",
      title: "Selection",
      position: { referencePanel: problems, direction: "right" },
    });

    requestAnimationFrame(() => {
      assets.api.setSize({ height: 176 });
      inspector.api.setSize({ width: 300 });
      palette.api.setSize({ width: 264 });
    });

    palette.api.setActive();
    viewport.api.setActive();
  }, []);

  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <div className="grid grid-rows-[32px_52px_minmax(0,1fr)] h-screen w-screen">
        <TitleBar />
        <Toolbar />
        <main className="min-h-0 min-w-0 overflow-hidden bg-[#0d1017]">
          <DockviewReact
            className="dockview-theme-dark studio-workspace"
            components={dockComponents}
            onReady={onReady}
          />
        </main>
      </div>
      <Toasts />
    </RadixTooltip.Provider>
  );
}
