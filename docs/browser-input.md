# Browser input host boundaries

`@mmx/browser-input` owns physical keyboard and gamepad → engine action masks.
Hosts (Web, Studio) own routing policy on top of that package.

## Package responsibilities

- Configurable key bindings via a live `getBindings()` getter
- Multiple physical codes per action
- Separate keyboard and gamepad held state, ORed into `packedMask()`
- Attach / detach lifecycle, blur clearing, gamepad disconnect clearing
- Optional `onActivity`, `onNavigation`, and host key hooks
- Binding helpers (`KeyBindings`, defaults, `assignBinding`, `mergeBindings`)
- Injectable `target` and `getGamepads` for tests (no `window` / `navigator` at
  module evaluation)

## Host responsibilities

The package does **not** decide:

- whether a settings menu, home screen, debugger, Monaco, or gameplay receives a key
- whether blur should pause the simulation
- whether activity should unlock audio
- settings persistence / desktop window control

### Web (`apps/web`)

`InputBinding` wraps `BrowserInput` and keeps:

- settings / home menu precedence (`beforeKeyDown`)
- debug unbound-key commands (`afterUnboundKeyDown`)
- pause-on-blur policy (`onBlur` / `onFocus`)
- sound unlock (`onActivity` + pad menu path)
- gamepad notices
- synthesized pad menu navigation via `takeMenuCodes()`

Binding types and defaults live in `@mmx/browser-input`. Persistence stays in
`DesktopBridge` / `SettingsModel` until a dedicated settings package lands
(prompt 04).

### Studio / tooling

`PlaytestInput` and `createToolingRuntime` consume `@mmx/browser-input` with
`DEFAULT_TOOLING_BINDINGS`. Live Play attaches only while the tooling runtime
browser loop is running and detaches on stop/dispose.

Editable targets (inputs, textareas, contenteditable, `.monaco-editor`) are
ignored by default through `isEditableKeyTarget`, so typing in the editor does
not drive gameplay. Hosts may still supply an extra `beforeKeyDown`.

`getBindings` can be overridden later for user rebinds without replacing the
input class.

## Integration notes

- `@mmx/runtime/browser` re-exports `BrowserInput` / `GamepadInput` for
  compatibility with the unified-runtime branch.
- If a parallel runtime branch still owns copies of these files, prefer
  `@mmx/browser-input` as the source of truth and keep runtime as a thin
  re-export.
- Prompt 04 (`client-settings`) may later own persistence of `KeyBindings`;
  keep importing the binding *types* from `@mmx/browser-input` so input and
  settings stay aligned after merge.
