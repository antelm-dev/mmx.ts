---
"@mmx/engine": minor
"@mmx/content-schema": minor
"@mmx/pack-mmx-starter": patch
"@mmx/studio": patch
---

Object names and descriptions live in the prefab data. `PrefabDefinition` gains an optional `description`, validated like `name` and, like it, left out of the game data hash (`ad52563298993e03` core, `36e5bb6d8c3547a6` core + MMX Starter are unchanged). The base prefabs and the MMX Starter pack's prefabs, and both Studio templates, carry the names and descriptions shown so far. The catalog reads a prefab's `name` and `description` first; `GameObjectDefinition` gains `description`. Its presentation table and Studio's `BEHAVIOUR_DESCRIPTIONS` are now fallbacks for a project whose copied prefabs have none, so such a project still shows "Metool", "Pantheon Hunter" and the same descriptions. Icons and default sizes stay in the presentation table.

A hand-written overlay prefab spread from a built-in one now inherits its `name` (and `description`) unless it sets its own; Studio's new enemies set their own name and drop the base's description.
