---
"@mmx/content-schema": minor
---

`MMX_PLAYER_X` carries X's sheets (`assets.json`) and bindings (`bindings.json`) from his pack; `MMX_PLAYER_ZERO` stays data only. `PackContent.bindings` may hold single bindings (`playerAnimation`); `mergePack` adds a pack's single bindings together or not at all, so X's sheet is never bound without his arm sheet, nor over a project that binds another player. `withStarterPack` still adds records only, never art or bindings.
