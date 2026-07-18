# mmx-core-ts

A faithful **TypeScript / Node** port of the *core player gameplay* from the
[Mega Man X8 16-bit](../Mega-Man-X8-16-bit) Godot project — the movement state
machine (walk / dash / variable jump / air-dash / wall-slide / wall-jump /
dash-jump) plus buster shooting and charge shots.

The engine is **pure TypeScript** with no runtime dependencies. It runs two ways:

- **Headless** in Node (deterministic, scripted input) — `npm run sim`
- **In the browser** on a canvas with real keyboard input — `npm run play`

---

## Quick start

```bash
npm install

npm run sim      # deterministic headless simulation, prints a state trace
npm test         # unit tests (node:test) for the movement/shooting behaviour
npm run play     # build + serve -> open http://localhost:8080 and play
```

Controls (browser): **← →** / **A D** move · **Space** jump (hold for height) ·
**Shift** / **L** dash · **J** fire (tap = lemon, hold+release = charged) ·
hold *into* a wall while falling to wall-slide, then **Space** to wall-kick.

---

## How the original works (analysis)

The Godot player **X** is a chain of classes, each adding one concern:

```
CharacterBody2D
 └ Actor.gd         physics body: velocity + bonus_velocity, gravity 900,
 │                  max fall 375, floor snap, health, facing
 └ AbilityUser.gd   moveset of ability nodes; each frame it tries to start every
 │                  eligible ability and updates the ones already running
 └ Character.gd     input reading, wall/land/headbump detection (RayCast2D columns)
 └ Player.gd        armor, dashfall, dashjump counters, hazards
```

**Movement is not a classic exclusive FSM.** Each move is a child node
(`BaseAbility`) in `moveset`. Every physics frame:

1. every ability tests `_StartCondition()` + `Should_Execute()` (input);
2. if it passes it `ExecuteOnce()` → `Initialize` → `_Setup`, interrupting
   conflicting moves;
3. running moves call `_Update` until `_EndCondition()` fires (`EndAbility` →
   `Finalize` → `_Interrupt`).

Conflicts between moves are handled by per-ability `conflicting_moves` arrays and
priorities. Independent moves (Shot, Charge — configured "Nothing") run
*concurrently* with movement, which is why you can walk-and-charge.

Ability lifecycle (`BaseAbility.gd`):

```
ExecuteOnce ─ Initialize ─ _Setup ─┐
                                    ├─ each frame: BeforeEveryFrame ─┬ _ResetCondition → ResetAbility
                                    │                                ├ _EndCondition   → EndAbility
                                    └────────────────────────────────┴ else            → _Update
EndAbility ─ Finalize ─ _Interrupt
```

Key numbers (all reproduced in [`src/core/constants.ts`](src/core/constants.ts)):
gravity `900`, max fall `375`, walk `90`, jump `320`, dash `~200`, dash duration
`0.55s`, jump max time `0.625s`, jump coyote/buffer `0.1s`, charge thresholds
`0.5 / 1.75 / 2.75s`.

---

## How this port maps to it

| Godot source | This project |
|---|---|
| `Actor.gd` (physics, health, sensors) | [`src/engine/Actor.ts`](src/engine/Actor.ts) |
| `move_and_slide()` + `RayCast2D` columns | [`src/engine/World.ts`](src/engine/World.ts) AABB tile collision + edge sensors |
| `AbilityUser.gd` (moveset + runtime) | [`src/engine/AbilityUser.ts`](src/engine/AbilityUser.ts) |
| `Character.gd` (input, wall/land) | [`src/engine/Character.ts`](src/engine/Character.ts) |
| `Player.gd` / `Player.tscn` node list | [`src/engine/Player.ts`](src/engine/Player.ts) |
| `BaseAbility.gd` / `Ability.gd` / `Movement.gd` | [`src/engine/ability/`](src/engine/ability/) |
| `Idle/Walk/Fall/Jump/Dash/AirDash/Wallslide/Walljump/DashWallJump/DashJump.gd` | [`src/engine/abilities/`](src/engine/abilities/) |
| `Shot.gd` (PrimaryShot) / `Charge.gd` | [`src/engine/abilities/Shot.ts`](src/engine/abilities/Shot.ts), [`Charge.ts`](src/engine/abilities/Charge.ts) |
| `Lemon.gd` / `WeaponShot.gd` | [`src/engine/Projectile.ts`](src/engine/Projectile.ts) |
| Godot `Input` singleton | [`src/core/Input.ts`](src/core/Input.ts) |
| Godot signals | [`src/core/Events.ts`](src/core/Events.ts) |

The per-state logic (`_StartCondition` / `_Update` / `_EndCondition`) and every
tuning constant are ported line-for-line so the *feel* matches.

### Deliberate divergences

- **Conflict resolution.** The `conflicting_moves` arrays live in `Player.tscn`,
  which is binary scene data, not source. Instead each ability carries
  `independent` (Shot/Charge run concurrently) and a `priority`; `AbilityUser`
  keeps exactly one locomotion state active, with a higher-priority candidate (or
  the current state's `_EndCondition`) driving transitions. This reproduces the
  intended ordering **Idle < Walk/Fall < WallSlide < Dash/AirDash < Jump <
  DashJump < WallJump/DashWallJump** (wall context outranks ground-coyote moves).
- **Collision** is flat-tile AABB (no slopes / moving platforms / conveyors); the
  raycast wall/reach queries become edge samples.
- **Cosmetics dropped**: sprites/animation frames (animation is kept as a *string*
  only where gameplay logic reads it), particles, sounds, shaders, camera.

### Not ported (extension points)

Documented but out of scope for the movement core: armor sets (Hermes / Icarus and
their gameplay modifiers), boss weapons, Ride Armor, the damage/knockback/death
pipeline, sub-tanks, and the AirJump double-jump. The ability framework is built to
accept these as additional `BaseAbility` subclasses exactly as the original does.

---

## Project layout

```
src/
  core/        Vec2, Input, EventBus, constants
  engine/
    World.ts        tile collision world
    Actor.ts        physics body + sensors
    AbilityUser.ts  state-machine driver
    Character.ts    input + player API
    Player.ts       assembles the moveset ("X")
    Projectile.ts   buster shots
    level.ts        a test chamber exercising every state
    ability/        BaseAbility / Ability / Movement
    abilities/      Idle, Walk, Fall, Jump, Dash, AirDash, WallSlide,
                    WallJump, DashWallJump, DashJump, Shot, Charge
  sim/run.ts   deterministic headless simulation
  web/main.ts  canvas renderer + keyboard input
  server.ts    zero-dependency static server
tests/         node:test behaviour tests
```
