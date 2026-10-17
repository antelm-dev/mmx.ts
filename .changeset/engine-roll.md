---
"@mmx/engine": minor
---

Add the `Roll` enemy ability: a ground enemy rolls at a constant `speed` without resting, optionally turning once to face the player the first time it sees them (`facePlayer`), falls off ledges, and turns around or stops at a wall (`atWall: "turn" | "stop"`); its `conflicts` default to `["Stun"]` so a stun interrupts the roll. Config schema fields may now declare `options` (the accepted strings) and a `default` for tooling. No built-in enemy uses it, so the built-in game-data hash and existing replays are unchanged.
