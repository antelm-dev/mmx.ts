---
"@mmx/browser-audio": minor
"@mmx/build-tools": minor
"@mmx/web": patch
---

Carry Studio `bindings.sounds` (runtime name → logical asset ID) through the browser project bundle as `soundBindings`. Preload only resolved logical asset IDs. Required gameplay sounds must be mapped at build time; optional/custom sounds are extra runtime aliases in the same map (never raw asset IDs used as play names). Canonical projects without Studio bindings keep identity (`soundBindings: null`, runtime names are asset IDs).
