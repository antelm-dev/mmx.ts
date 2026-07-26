import { useEffect, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  Copy,
  FilePlus2,
  FolderOpen,
  Minus,
  Moon,
  Save,
  Square,
  Sun,
  X,
} from "lucide-react";
import { PANELS, togglePanel, useOpenPanelIds } from "../app/dock.js";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { cx, ctxItemCls, menu } from "../ui.js";

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
  const colorTheme = useUiStore((s) => s.colorTheme);
  const toggleColorTheme = useUiStore((s) => s.toggleColorTheme);

  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      void controls()
        ?.isMaximized()
        .then((v) => !cancelled && setMaximized(v));
    sync();
    window.addEventListener("resize", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="flex items-stretch h-8 pl-3 bg-chrome border-b border-border select-none [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 min-w-0 text-[11.5px] font-semibold tracking-[0.3px] text-fg-3">
        <img
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt=""
          className="w-[15px] h-[15px] flex-none"
        />
        <span data-testid="app-brand">
          MMX <span className="text-fg-2">Studio</span>
        </span>
      </div>

      <div className="flex items-stretch ml-2 [-webkit-app-region:no-drag]">
        <FileMenu />
        <ViewMenu />
      </div>

      <div className="flex-1" />

      <div className="flex items-stretch [-webkit-app-region:no-drag]">
        <ControlButton
          label={colorTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleColorTheme}
        >
          {colorTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </ControlButton>
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

function FileMenu() {
  const snap = useEditorSnapshot();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="inline-flex items-center h-full px-2.5 text-[11.5px] font-medium text-fg-3 hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg transition-colors duration-100"
          aria-label="File menu"
        >
          File
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menu} sideOffset={2} align="start">
          <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.newLevel()}>
            <FilePlus2 size={13} /> New
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={ctxItemCls(false)}
            onSelect={() => void editor.importJson()}
          >
            <FolderOpen size={13} /> Import…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.save()}>
            <Save size={13} /> Save
            {snap.dirty && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] shadow-[0_0_8px_rgba(96,165,250,0.65)]"
                aria-label="Unsaved changes"
              />
            )}
            <span className="ml-auto text-[10.5px] text-fg-3 tracking-wide">Ctrl+S</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Menubar "View" dropdown: a checkbox per workspace panel that opens it when
 * closed and closes it when open. Checks stay in sync with the live dock, so
 * closing a panel via its tab × also unticks it here. Selecting an item keeps
 * the menu open (preventDefault) so several panels can be toggled in one go.
 */
function ViewMenu() {
  const open = useOpenPanelIds();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="inline-flex items-center h-full px-2.5 text-[11.5px] font-medium text-fg-3 hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg transition-colors duration-100"
          aria-label="View menu"
        >
          View
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menu} sideOffset={2} align="start">
          {PANELS.map((p) => (
            <DropdownMenu.CheckboxItem
              key={p.id}
              className={ctxItemCls(false)}
              checked={open.includes(p.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => togglePanel(p.id)}
            >
              <span className="inline-flex w-3.5 justify-center flex-none">
                <DropdownMenu.ItemIndicator>
                  <Check size={13} />
                </DropdownMenu.ItemIndicator>
              </span>
              {p.title}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
