---
"@mmx/studio": minor
---

Compose a rolling enemy that falls over before exploding (MMX1's Spiky). A blank enemy with `Roll` answers idle with it. Under Death, the Blank enemy form gains "Fall before exploding": the health it starts at (below the enemy's), a clip of the animation, and how long it lasts (1 s by default, also when the weak phase is turned on in the Enemy editor). Adding an ability now puts it back in the conflicts another ability's default config lists, so a Stun added after Roll interrupts the roll. The Enemy editor shows option fields such as Roll's `atWall`, and Death's weak clip, as selects. The missing-clip note and the `enemy.clips` warning cover `roll` and the weak clip.
