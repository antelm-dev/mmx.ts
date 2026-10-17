---
"@mmx/studio": patch
"@mmx/engine": patch
"@mmx/content-schema": patch
---

Studio and the object catalog no longer depend on the built-in MMX objects: new enemy abilities take their config from the engine's ability schema `default`s (unchanged values), LevelData entities import as the catalog's definition for their engine id and Kind (an unknown Kind shows as a missing object instead of a Metool), the moving-platform gizmo reads the catalog's game data (`catalogGameData`), and the Assets panel's built-in badge follows the Enemy editor's project-enemy test.
