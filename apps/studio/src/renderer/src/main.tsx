// Patch Pixi to avoid `new Function` shader generation — the renderer runs under
// a strict `script-src 'self'` CSP that forbids unsafe-eval. Must load before any
// Pixi Application is created.
import "pixi.js/unsafe-eval";
import { createRoot } from "react-dom/client";
import "dockview-react/dist/styles/dockview.css";
import "./styles.css";
import { App } from "./App.js";

/**
 * MMX Studio (Electron edition) bootstrap. React 19 + Dockview shell; all editor
 * state lives in the shared `EditorController`, mirrored into components through
 * a `useSyncExternalStore` snapshot, with ephemeral chrome in a Zustand store.
 *
 * Deliberately not wrapped in <StrictMode>: the viewport mounts a single Pixi
 * `Application`, and StrictMode's double-invoked effects would create (and leak)
 * a second WebGL context in development.
 */
const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(<App />);
