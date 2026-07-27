# @mmx/engine

Deterministic, renderer-independent gameplay simulation for MMX. It owns world
physics, actors, abilities, enemies, projectiles, pickups, scene state, replay
data, cameras, and data-driven gameplay compilation.

The engine has no browser, PixiJS, audio, DOM, or filesystem dependency. Hosts
provide an input mask and fixed simulation steps, then render or inspect the
resulting scene state.

## Entry points

| Import                  | Purpose                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `@mmx/engine`           | Runtime simulation types, scene model, input/replay primitives, constants, and tooling snapshots |
| `@mmx/engine/content`   | Compile authored level data into engine runtime data and diagnostics                             |
| `@mmx/engine/data`      | Define and compile typed gameplay data                                                           |
| `@mmx/engine/behaviors` | Behavior registries, configuration validation, and extension types                               |
| `@mmx/engine/tooling`   | `ToolingSession` and serializable simulation snapshots                                           |

```ts
import { Input, packInput } from "@mmx/engine";

const input = new Input();
input.setDown("move_right", true);
const mask = packInput(input);

// A runtime host passes the mask to its scene/session at the fixed engine step.
```

For normal player and tooling hosts, prefer `@mmx/runtime` over assembling the
fixed-step loop and lifecycle directly. Authoring tools should use
`@mmx/engine/content` instead of importing engine source paths.

## Determinism and boundaries

- Simulation advances at the fixed engine timestep; do not feed render-frame
  deltas directly into gameplay.
- Replay input is represented as packed action masks.
- Random gameplay uses the engine RNG and explicit seeds.
- Cross-package consumers must use the exported entry points above. Paths such
  as `@mmx/engine/game/*` and `@mmx/engine/core/*` are private.

The root README documents the gameplay port, movement model, enemies, and
deliberate differences from the source Godot project.

## Development

```bash
pnpm --filter @mmx/engine test
pnpm --filter @mmx/engine build
```
