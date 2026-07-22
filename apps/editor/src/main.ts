import "./style.css";
import { Shell } from "./ui/Shell.js";

/**
 * MMX Studio bootstrap. Builds the editor shell into #app and opens Stage 1 by
 * default. Everything else is driven from the {@link Shell}.
 */
const root = document.getElementById("app");
if (!root) throw new Error("MMX Studio: #app root element missing.");

Shell.mount(root).catch((error) => {
  root.textContent = `MMX Studio failed to start: ${error instanceof Error ? error.message : String(error)}`;
});
