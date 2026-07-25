import { useEffect, useState, type ReactNode } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { cx } from "../ui.js";

/** Shorthand for the frameless-window IPC surface exposed by the preload. */
const controls = () => window.studio?.window;

/**
 * Custom window title bar for the frameless window (`frame: false` in the main
 * process). The strip itself is a drag region (`-webkit-app-region: drag`); the
 * control buttons opt back out so they stay clickable.
 *
 * The maximize/restore glyph is re-synced from the OS on every window resize,
 * which covers changes made outside our buttons (OS snap, Win+Up, etc.).
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = () => void controls()?.isMaximized().then((v) => !cancelled && setMaximized(v));
    sync();
    window.addEventListener("resize", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="flex items-stretch h-8 pl-3 bg-[#0b0e15] border-b border-border select-none [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 flex-1 min-w-0 text-[11.5px] font-semibold tracking-[0.3px] text-fg-3">
        <img
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt=""
          className="w-[15px] h-[15px] flex-none"
        />
        <span>
          MMX <span className="text-fg-2">Studio</span>
        </span>
      </div>

      <div className="flex items-stretch [-webkit-app-region:no-drag]">
        <ControlButton label="Minimize" onClick={() => void controls()?.minimize()}>
          <Minus size={15} />
        </ControlButton>
        <ControlButton
          label={maximized ? "Restore" : "Maximize"}
          onClick={() => void controls()?.toggleMaximize().then(setMaximized)}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </ControlButton>
        <ControlButton label="Close" danger onClick={() => void controls()?.close()}>
          <X size={16} />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center w-[46px] h-full text-fg-3 transition-colors duration-100",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
