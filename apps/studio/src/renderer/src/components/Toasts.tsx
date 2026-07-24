import { useUiStore } from "../store/uiStore.js";

/** Bottom-right transient notifications, driven by the Zustand UI store. */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div className="toast" key={t.id} role="status">
          <span>{t.message}</span>
          <button onClick={() => dismiss(t.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}
