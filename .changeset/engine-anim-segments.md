---
"@mmx/contracts": minor
"@mmx/engine": minor
"@mmx/project-schema": minor
"@mmx/renderer-pixi": minor
---

Animation clips can carry named segments (`segments: { name, start, end, loop }[]`) that partition their frames, so transition frames live inside one clip: a one-shot segment chains to the next, a looping one wraps on itself, and the clip finishes after its last one-shot segment. `play("clip#segment")` starts at a segment. Segments replace `loop`/`loopStart` when present, are validated (`animation.segments`), survive project serialization, and enter the scene hash only when present, so clips without segments keep their hash and replays.
