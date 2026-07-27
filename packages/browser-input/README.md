# @mmx/browser-input

Keyboard and gamepad input adapter for the MMX engine. It converts browser
events and polled gamepads into the engine's deterministic packed input mask
without adding UI or settings persistence.

## Public API

- `BrowserInput` owns keyboard listeners, virtual actions, gamepad polling, and
  menu-navigation callbacks.
- `GamepadInput` exposes the lower-level gamepad adapter.
- `DEFAULT_BINDINGS`, `DEFAULT_TOOLING_BINDINGS`, and the binding helpers
  provide the supported action maps.
- `isEditableKeyTarget` helps hosts avoid capturing keys from editable UI.

```ts
import { BrowserInput, DEFAULT_BINDINGS } from "@mmx/browser-input";

const input = new BrowserInput({
  getBindings: () => DEFAULT_BINDINGS,
});

input.attach();
input.poll(frameSeconds);
runtime.step(input.packedMask());

// On host shutdown:
input.detach();
```

Bindings use `KeyboardEvent.code` values, so they represent physical keys
rather than localized characters. `poll()` must be called for gamepad state;
keyboard state is updated by events. `detach()` removes listeners and clears
held actions.

Persisted user bindings belong in `@mmx/client-settings`. Browser scheduling
and runtime composition belong in `@mmx/runtime/browser` and
`@mmx/runtime/player`.

## Development

```bash
pnpm --filter @mmx/browser-input test
pnpm --filter @mmx/browser-input build
```
