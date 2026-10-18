---
"@mmx/content-schema": minor
---

`MMX_PLAYER_X` and `MMX_PLAYER_ZERO` are the X and Zero packs as `PackContent` (X with his sheets and bindings, Zero data only). `PackContent.bindings` may hold single bindings (`playerAnimation`); `mergePack` adds a pack's single bindings together or not at all, so X's sheet is never bound without his arm sheet, nor over a project that binds another player. `withStarterPack` is unchanged.
