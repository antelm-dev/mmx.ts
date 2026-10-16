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
  /** Listed in the activity bar; `icon` names an entry of its icon map. */
  activity?: { label: string; icon: string; order: number };
}

export const PANELS: PanelSpec[] = [
  {
    id: "palette",
    title: "Object Palette",
    component: "palette",
    ref: "viewport",
    dir: "left",
    fallbackDir: "left",
    activity: { label: "Objects", icon: "objects", order: 10 },
  },
  {
    id: "assets-browser",
    title: "Assets",
    component: "assets-browser",
    ref: "palette",
    dir: "within",
    fallbackDir: "left",
    activity: { label: "Assets", icon: "assets", order: 15 },
  },
  {
    id: "scene",
    title: "Scene",
    component: "scene",
    ref: "palette",
    dir: "within",
    fallbackDir: "left",
    activity: { label: "Scene", icon: "scene", order: 20 },
  },
  {
    id: "inspector",
    title: "Inspector",
    component: "inspector",
    ref: "viewport",
    dir: "right",
    fallbackDir: "right",
  },
  {
    id: "room",
    title: "Room",
    component: "room",
    ref: "inspector",
    dir: "within",
    fallbackDir: "right",
  },
  {
    id: "json",
    title: "Document JSON",
    component: "json",
    ref: "inspector",
    dir: "within",
    fallbackDir: "right",
  },
  {
    id: "assets",
    title: "Decorations",
    component: "assets",
    ref: "viewport",
    dir: "below",
    fallbackDir: "below",
  },
  {
    id: "problems",
    title: "Problems",
    component: "problems",
    ref: "assets",
    dir: "right",
    fallbackDir: "below",
    activity: { label: "Problems", icon: "problems", order: 90 },
  },
  {
    id: "selection",
    title: "Selection",
    component: "selection",
    ref: "problems",
    dir: "right",
    fallbackDir: "below",
  },
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
/** Cached ids of each group's shown tab; a stable snapshot for {@link useVisiblePanelIds}. */
let visibleIds: string[] = [];
const listeners = new Set<() => void>();
let disposers: { dispose: () => void }[] = [];

function refresh(): void {
  openIds = api ? api.panels.map((p) => p.id) : [];
  visibleIds = api ? api.groups.flatMap((g) => (g.activePanel ? [g.activePanel.id] : [])) : [];
  for (const notify of listeners) notify();
}

export function setDockApi(next: DockviewApi | null): void {
  for (const d of disposers) d.dispose();
  disposers = [];
  api = next;
  if (api) {
    disposers.push(
      api.onDidAddPanel(refresh),
      api.onDidRemovePanel(refresh),
      // Also fires on tab switches and moves, which change the shown tab of a group.
      api.onDidLayoutChange(refresh),
    );
  }
  refresh();
}

/** Activate a dock panel by id (surfacing its tab and group), if it exists. */
export function focusPanel(id: string): void {
  api?.getPanel(id)?.api.setActive();
}

/** Workspace start page: opened over the level at launch and from Help → Start Page. */
export const START_PANEL: PanelSpec = {
  id: "start",
  title: "Start",
  component: "start",
  ref: "viewport",
  dir: "within",
  fallbackDir: "within",
};

/**
 * An asset's document tab (contract C-DOC). `id` is one per asset (`tileset:<assetId>`,
 * `enemy:<id>`, `clips:<assetId>`, `slicer:<assetId>`) so reopening an asset reuses its
 * tab; `component` is its {@link App} `dockComponents` key; the panel reads the asset
 * from its `props.params`.
 */
export interface DocumentSpec {
  id: string;
  component: string;
  title: string;
  params: Record<string, unknown>;
}

/**
 * Open a document as a tab in the level view's group, or surface the tab of the same id
 * with fresh params and title. Dockview's `updateParameters` merges into the existing
 * params rather than replacing them, so keys left out of `params` persist. Not listed
 * under View → Panels. Play re-activates the level tab itself (see
 * `EditorController.togglePlay`), so documents may cover it.
 */
export function openDocument(doc: DocumentSpec): void {
  if (!api) return;
  const existing = api.getPanel(doc.id);
  if (existing) {
    existing.api.updateParameters(doc.params);
    existing.api.setTitle(doc.title);
    existing.api.setActive();
    return;
  }
  const viewport = api.getPanel("viewport");
  api.addPanel({
    id: doc.id,
    component: doc.component,
    title: doc.title,
    params: doc.params,
    position: viewport ? { referencePanel: viewport, direction: "within" } : undefined,
  });
}

/** Open (or surface) the tileset editor for a `tileset` asset; its id is the tab title. */
export function openTilesetDocument(assetId: string): void {
  openDocument({
    id: `tileset:${assetId}`,
    component: "tileset",
    title: assetId,
    params: { assetId },
  });
}

/** Open (or surface) the Enemy editor on an enemy, by its palette definition (prefab) id. */
export function openEnemyDocument(prefabId: string, name: string): void {
  openDocument({
    id: `enemy:${prefabId}`,
    component: "enemy",
    title: name,
    params: { enemyId: prefabId },
  });
}

/**
 * Open (or surface) the Clip Editor on an `animation` asset, or without one the
 * "New animation" document (`clips:new`), which picks the sheet of the animation it creates.
 */
export function openClipsDocument(assetId?: string): void {
  openDocument(
    assetId
      ? { id: `clips:${assetId}`, component: "clips", title: assetId, params: { assetId } }
      : { id: "clips:new", component: "clips", title: "New animation", params: {} },
  );
}

/** Open (or surface) the Sheet Slicer on a `sprite` or `image` asset. */
export function openSlicerDocument(assetId: string): void {
  openDocument({
    id: `slicer:${assetId}`,
    component: "slicer",
    title: assetId,
    params: { assetId },
  });
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
  if (spec) openPanel(spec);
}

/** Surface a panel, docking it next to its preferred neighbour first if it is closed. */
export function openPanel(spec: PanelSpec): void {
  if (!api) return;
  const existing = api.getPanel(spec.id);
  if (existing) {
    existing.api.setActive();
    return;
  }
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

/** Build the default Studio workspace layout on a fresh Dockview API. */
export function buildDefaultLayout(dock: DockviewApi): void {
  const viewport = dock.addPanel({
    id: "viewport",
    component: "viewport",
    title: "Level",
    renderer: "always",
    minimumWidth: 320,
    minimumHeight: 240,
  });

  const palette = dock.addPanel({
    id: "palette",
    component: "palette",
    title: "Object Palette",
    initialWidth: 264,
    minimumWidth: 220,
    maximumWidth: 320,
    position: { referencePanel: viewport, direction: "left" },
  });

  dock.addPanel({
    id: "scene",
    component: "scene",
    title: "Scene",
    position: { referencePanel: palette, direction: "within" },
  });

  const inspector = dock.addPanel({
    id: "inspector",
    component: "inspector",
    title: "Inspector",
    initialWidth: 300,
    minimumWidth: 260,
    maximumWidth: 380,
    position: { referencePanel: viewport, direction: "right" },
  });

  dock.addPanel({
    id: "room",
    component: "room",
    title: "Room",
    position: { referencePanel: inspector, direction: "within" },
  });

  dock.addPanel({
    id: "json",
    component: "json",
    title: "Document JSON",
    position: { referencePanel: inspector, direction: "within" },
  });

  const assets = dock.addPanel({
    id: "assets",
    component: "assets",
    title: "Decorations",
    initialHeight: 176,
    minimumHeight: 132,
    maximumHeight: 240,
    position: { referencePanel: viewport, direction: "below" },
  });

  const problems = dock.addPanel({
    id: "problems",
    component: "problems",
    title: "Problems",
    position: { referencePanel: assets, direction: "right" },
  });

  dock.addPanel({
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
}

/** Tear down the current dock and restore the default panel arrangement. */
export function resetLayout(): void {
  if (!api) return;
  for (const panel of [...api.panels]) {
    api.removePanel(panel);
  }
  buildDefaultLayout(api);
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

/** Reactive ids of the panels whose tab is shown in their group (one per group). */
export function useVisiblePanelIds(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => visibleIds,
    () => visibleIds,
  );
}
