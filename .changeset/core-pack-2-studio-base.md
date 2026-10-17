---
"@mmx/studio": minor
"@mmx/content-schema": patch
"@mmx/engine": patch
---

Studio is ready for an engine base without the MMX objects. The Object Palette lists a "Base" section first, the definitions neither the project's `data/game.json` nor its objects add (`isBaseDefinition`, fed by `setCatalogGameData(data, overlay)`), then the project's own by category. Adding Shoot anywhere (the New object form, the Enemy editor, a blank enemy) picks one of the project's projectiles when it lacks `pantheon_shot`. The moving-platform gizmo falls back to the project's environment defaults (`debugGeometry`'s new `defaults` argument) instead of the engine's built-in record. No gameplay change.
