import type { DockviewApi } from "dockview-react";

/**
 * Module-level handle to the live Dockview workspace API, set once the layout is
 * ready (see {@link App}). Lets non-panel code drive the dock — e.g. the Inspector
 * bringing the Scene panel to the front — without threading the API through props.
 */
let api: DockviewApi | null = null;

export function setDockApi(next: DockviewApi | null): void {
  api = next;
}

/** Activate a dock panel by id (surfacing its tab and group), if it exists. */
export function focusPanel(id: string): void {
  api?.getPanel(id)?.api.setActive();
}
