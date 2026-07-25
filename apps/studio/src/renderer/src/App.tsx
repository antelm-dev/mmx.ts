import { useCallback, useEffect, type ReactElement } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { editor } from "./app/useEditor.js";
import { Toolbar } from "./components/Toolbar.js";
import { LeftSidebar } from "./components/LeftSidebar.js";
import { Viewport } from "./components/Viewport.js";
import { Inspector } from "./components/Inspector.js";
import { BottomPanel } from "./components/BottomPanel.js";
import { JsonPanel } from "./components/JsonPanel.js";
import { Toasts } from "./components/Toasts.js";

/** Dockview panel registry. Panels read the shared controller; props are unused. */
const dockComponents: Record<string, (props: IDockviewPanelProps) => ReactElement> = {
  viewport: () => <Viewport />,
  palette: () => <LeftSidebar />,
  inspector: () => <Inspector />,
  bottom: () => <BottomPanel />,
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
      title: "Objects",
      initialWidth: 264,
      minimumWidth: 220,
      maximumWidth: 320,
      position: { referencePanel: viewport, direction: "left" },
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
      id: "json",
      component: "json",
      title: "Document JSON",
      position: { referencePanel: inspector, direction: "within" },
    });

    const bottom = api.addPanel({
      id: "bottom",
      component: "bottom",
      title: "Project details",
      initialHeight: 176,
      minimumHeight: 132,
      maximumHeight: 240,
      position: { referencePanel: viewport, direction: "below" },
    });

    requestAnimationFrame(() => {
      bottom.api.setSize({ height: 176 });
      inspector.api.setSize({ width: 300 });
      palette.api.setSize({ width: 264 });
    });

    viewport.api.setActive();
  }, []);

  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <div className="grid grid-rows-[56px_minmax(0,1fr)] h-screen w-screen">
        <Toolbar />
        <main className="min-h-0 min-w-0 overflow-hidden bg-[#0d1017]">
          <DockviewReact
            className="dockview-theme-dark"
            components={dockComponents}
            onReady={onReady}
          />
        </main>
      </div>
      <Toasts />
    </RadixTooltip.Provider>
  );
}
