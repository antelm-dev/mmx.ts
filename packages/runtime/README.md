# @mmx/runtime

Shared lifecycle and scheduling layer between the deterministic engine and its
player or tooling hosts. It coordinates scene replacement, replay/checkpoint
state, presentation, audio, fixed-step browser scheduling, and debugger
adapters without depending on PixiJS or a concrete UI.

## Entry points

| Import                 | Purpose                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `@mmx/runtime`         | `RuntimeSession` and presentation/audio adapter contracts                        |
| `@mmx/runtime/browser` | `FixedStepLoop` plus browser keyboard/gamepad exports                            |
| `@mmx/runtime/player`  | Player-facing runtime facade and loop factory                                    |
| `@mmx/runtime/tooling` | Tooling runtime, bindings, snapshots, and replay access                          |
| `@mmx/runtime/debug`   | Debug controller, runtime/recorder hosts, and time-scale contracts               |
| `@mmx/runtime/host`    | Window, clipboard, replay-file, storage, and application metadata host contracts |

```ts
import { createPlayerRuntime } from "@mmx/runtime/player";

const runtime = createPlayerRuntime({
  scene,
  presentation,
  audio,
});

const loop = runtime.createLoop({
  onStep: () => runtime.step(input.packedMask()),
  onRender: () => runtime.render(),
});

loop.start();

// On host shutdown:
loop.stop();
runtime.dispose();
```

Exact `RuntimeSessionOptions` depend on the scene being hosted; use the exported
types to keep host adapters explicit. Stop the loop, detach the input owner, and
call `runtime.dispose()` when the host shuts down.

Use `@mmx/runtime/tooling` for pause, seek, step, and inspection workflows. The
engine remains the source of simulation truth; the runtime only coordinates it.

## Development

```bash
pnpm --filter @mmx/runtime test
pnpm --filter @mmx/runtime build
```
