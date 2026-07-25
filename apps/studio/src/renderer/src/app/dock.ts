import { useSyncExternalStore } from "react";
import type { DockviewApi } from "dockview-react";

type Direction = "left" | "right" | "above" | "below" | "within";

/**
 * The toggleable workspace panels, in the order the View menu lists them. Each
 * spec knows how to re-dock itself when reopened: next to its preferred
 * neighbour if that panel is still open, otherwise relative to the viewport.
 * The viewport itself is intentionally absent — it's the level canvas and is
 * never closable. Ids/components/titles here must match {@link App}'s layout.
 */
export interface PanelSpec {
  id: string;
  title: string;
  component: string;
  ref: string;
  dir: Direction;
  fallbackDir: Direction;
}

export const PANELS: PanelSpec[] = [
  { id: "palette", title: "Object Palette", component: "palette", ref: "viewport", dir: "left", fallbackDir: "left" },
  { id: "scene", title: "Scene", component: "scene", ref: "palette", dir: "within", fallbackDir: "left" },
  { id: "inspector", title: "Inspector", component: "inspector", ref: "viewport", dir: "right", fallbackDir: "right" },
  { id: "room", title: "Room", component: "room", ref: "inspector", dir: "within", fallbackDir: "right" },
  { id: "json", title: "Document JSON", component: "json", ref: "inspector", dir: "within", fallbackDir: "right" },
  { id: "assets", title: "Assets", component: "assets", ref: "viewport", dir: "below", fallbackDir: "below" },
  { id: "problems", title: "Problems", component: "problems", ref: "assets", dir: "right", fallbackDir: "below" },
  { id: "selection", title: "Selection", component: "selection", ref: "problems", dir: "right", fallbackDir: "below" },
];

/**
 * Module-level handle to the live Dockview workspace API, set once the layout is
 * ready (see {@link App}). Lets non-panel code drive the dock — the Inspector
 * surfacing the Scene panel, the View menu opening/closing panels — without
 * threading the API through props.
 */
let api: DockviewApi | null = null;

/** Cached list of open panel ids; a stable snapshot for {@link useOpenPanelIds}. */
let openIds: string[] = [];
const listeners = new Set<() => void>();
let disposers: { dispose: () => void }[] = [];

function refresh(): void {
  openIds = api ? api.panels.map((p) => p.id) : [];
  for (const notify of listeners) notify();
}

export function setDockApi(next: DockviewApi | null): void {
  for (const d of disposers) d.dispose();
  disposers = [];
  api = next;
  if (api) {
    disposers.push(api.onDidAddPanel(refresh), api.onDidRemovePanel(refresh));
  }
  refresh();
}

/** Activate a dock panel by id (surfacing its tab and group), if it exists. */
export function focusPanel(id: string): void {
  api?.getPanel(id)?.api.setActive();
}

/** Open the panel if closed, or close it if open (the View-menu checkbox action). */
export function togglePanel(id: string): void {
  if (!api) return;
  const existing = api.getPanel(id);
  if (existing) {
    api.removePanel(existing);
    return;
  }
  const spec = PANELS.find((p) => p.id === id);
  if (!spec) return;
  const preferred = api.getPanel(spec.ref);
  const target = preferred ?? api.getPanel("viewport");
  api.addPanel({
    id: spec.id,
    component: spec.component,
    title: spec.title,
    position: target
      ? { referencePanel: target, direction: preferred ? spec.dir : spec.fallbackDir }
      : undefined,
  });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Reactive set of currently-open panel ids, tracking add/remove from anywhere. */
export function useOpenPanelIds(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => openIds,
    () => openIds,
  );
}
