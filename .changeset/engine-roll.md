---
"@mmx/engine": minor
---

Add the `Roll` enemy ability: a ground enemy rolls at a constant `speed` without resting, optionally turning to face the player when it starts (`facePlayer`), falls off ledges, and turns around or stops at a wall (`atWall: "turn" | "stop"`). Config schema fields may now declare `options` (the accepted strings) and a `default` for tooling. No built-in enemy uses it, so the built-in game-data hash and existing replays are unchanged.
