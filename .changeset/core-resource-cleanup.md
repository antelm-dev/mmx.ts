---
"@mmx/renderer-pixi": major
"@mmx/browser-audio": major
---

Remove built-in MMX game assets from core. Renderer and browser-audio now require project-injected manifests and sound resolvers; root `resources/`, sync-assets scripts, and generator importers are deleted. Game content is owned by the Studio starter project.
