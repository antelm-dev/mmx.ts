import { useUiStore } from "../store/uiStore.js";

/** Bottom-right transient notifications, driven by the Zustand UI store. */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed right-[18px] bottom-[18px] z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          className="flex items-center gap-3 min-w-[220px] max-w-[380px] px-3.5 py-2.5 border border-border-strong rounded-[9px] bg-popover text-fg text-[12.5px] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          key={t.id}
          role="status"
        >
          <span>{t.message}</span>
          <button
            className="ml-auto bg-transparent text-accent font-semibold cursor-pointer"
            onClick={() => dismiss(t.id)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
