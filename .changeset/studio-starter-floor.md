---
"@mmx/studio": patch
---

Fix the MMX starter template's entry level: it shipped with an empty `tiles` array, so a project made with "New from MMX starter…" opened on a level with a `tiles.length` error that kept Play from starting. The level now has a full 64×24 grid, solid from the row under the spawn to the bottom.
