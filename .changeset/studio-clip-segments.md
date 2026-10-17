---
"@mmx/studio": minor
---

Fields that name an enemy clip offer `clip#segment` too: Death's weak-phase clip (enemy editor and Blank enemy form) and Stun's `animation`/`recoverAnimation`, now picked from the animation's clips and segments. The `enemy.clips` problem checks that both the clip and the segment of a `clip#segment` exist.
