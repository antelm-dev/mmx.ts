export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest(".monaco-editor, [data-mmx-ignore-play-input]") !== null;
}
