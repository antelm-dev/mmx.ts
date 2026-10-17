---
"@mmx/engine": minor
---

`Death` gains an optional weak phase (MMX1 Spiky): with `weakHealth` set, a hit that leaves the enemy at or below it stops the enemy, switches its AI off and plays `weakAnimation`, then the enemy self-destructs after `weakDuration` through the normal zero-health blast; a killing hit during the phase ends it at once. Schema fields can now be `optional`; the built-in data and its hash are unchanged.
