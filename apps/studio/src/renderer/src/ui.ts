/**
 * Shared Tailwind class strings for the primitives that recur across the studio
 * chrome (buttons, inputs, list rows, popover menus). Co-locating them here keeps
 * component JSX readable and the styling consistent without a bespoke stylesheet.
 *
 * Stateful primitives are exposed as functions that *swap* the variant classes
 * (idle vs. active) rather than layering them, so there's never a same-property
 * Tailwind conflict whose winner depends on stylesheet order.
 *
 * `cx` is a tiny classnames joiner — falsy parts are dropped.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Shared button geometry; the color/hover variant is layered on by {@link btnCls}. */
const btnBase =
  "inline-flex items-center gap-1.5 h-7 px-2 border border-transparent rounded-md text-[11.5px] " +
  "font-semibold cursor-pointer transition-colors duration-100 disabled:opacity-40 disabled:cursor-default";
const btnIdle = "text-fg-2 enabled:hover:bg-hover enabled:hover:text-fg";
const btnActive = "bg-accent/15 text-accent-fg";

/** Generic toolbar/action button. `active` toggles the selected look; `icon` squares it. */
export function btnCls(opts: { active?: boolean; icon?: boolean } = {}): string {
  return cx(btnBase, opts.active ? btnActive : btnIdle, opts.icon && "w-7 px-0 justify-center");
}

/** Text/number input field; `bad` swaps to the invalid-outline variant. */
export function inputCls(bad = false): string {
  return cx(
    "w-full h-8 px-[9px] border rounded-[7px] bg-raised text-fg text-xs outline-none " +
      "focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]",
    bad ? "border-danger-fg focus:border-danger-fg" : "border-border-strong focus:border-accent",
  );
}

/** Sidebar list row (palette / scene); `active` marks selection. `group` reveals the add icon. */
export function itemCls(active: boolean): string {
  return cx(
    "group relative flex items-center gap-2.5 w-[calc(100%-16px)] min-h-[38px] mx-2 my-px px-2 py-[5px] " +
      "rounded-lg border text-left cursor-pointer text-[12.5px] transition-[color,background-color,border-color,transform] duration-100",
    active
      ? "bg-accent/15 text-accent-fg border-accent/40"
      : "text-fg-2 border-transparent hover:bg-hover hover:text-fg hover:border-border hover:translate-x-px",
  );
}

/** Popover / dropdown menu row (Radix menu or context menu); `selected` marks the current item. */
export function ctxItemCls(selected = false): string {
  return cx(
    "flex items-center gap-[9px] w-full bg-transparent text-[12.5px] text-left px-3 py-1.5 " +
      "cursor-pointer outline-none data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
    selected
      ? "bg-selected text-menu-fg-hover"
      : "text-menu-fg hover:bg-popover-hover hover:text-menu-fg-hover " +
          "data-[highlighted]:bg-popover-hover data-[highlighted]:text-menu-fg-hover",
  );
}

/** Footer action-button row (Inspector, JSON panel). */
export const actions = "flex gap-2 p-3";
const actionBase =
  "inline-flex items-center justify-center flex-1 h-8 px-2.5 border border-border-strong rounded-lg " +
  "text-[12.5px] font-semibold cursor-pointer transition-colors duration-100 enabled:hover:bg-hover " +
  "enabled:hover:text-fg disabled:opacity-40 disabled:cursor-default";
/** Bordered, full-width action button. */
export const actionBtn = cx(actionBase, "text-fg-2");
/** Destructive variant of {@link actionBtn}. */
export const actionBtnDanger = cx(actionBase, "text-danger-fg");

/** Full-height panel column with the surface background. */
export const panel = "flex flex-col h-full bg-surface";
/** Vertically scrolling flex child. */
export const scroll = "overflow-y-auto min-h-0 flex-1";

/** Uppercase section heading. Compose with {@link sectionTitleSub} for a top divider. */
export const sectionTitle =
  "uppercase tracking-[0.6px] text-[10.5px] font-semibold text-fg-2 px-3.5 pt-[11px] pb-[7px]";
export const sectionTitleSub = "border-t border-border mt-2";
/** Small caption above a form control. */
export const fieldLabel = "block text-[10.5px] text-fg-3 mb-[3px]";

/** Popover / dropdown surface (Radix menu content, context menu). */
export const menu =
  "z-[41] min-w-[220px] max-w-[300px] flex flex-col bg-popover border border-popover-border " +
  "rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.45)] py-1.5 overflow-hidden";
export const menuSep = "h-px my-1.5 mx-2 bg-popover-border";
export const menuLabel =
  "px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.6px] text-fg-3";
export const menuShortcut = "ml-auto pl-5 text-[10.5px] text-fg-3 tracking-wide tabular-nums";
