---
"@mmx/renderer-pixi": minor
---

Renderer sheet keys are now stable project asset ids instead of path basenames. `sheetImages` and shot sheet refs must use those logical ids; migrate filename-keyed bindings through the explicit `adaptLegacyFilenameSheetImages` / `adaptLegacyFilenameShotSheets` helpers, which reject ambiguous basenames instead of silently overwriting sheets.
