import { useEffect, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ClipboardCopy,
  Copy,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  History,
  LayoutTemplate,
  Magnet,
  Maximize,
  Maximize2,
  Minus,
  Moon,
  RotateCcw,
  Save,
  Square,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PANELS, resetLayout, togglePanel, useOpenPanelIds } from "../app/dock.js";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { cx, ctxItemCls, menu, menuLabel, menuSep, menuShortcut } from "../ui.js";

const controls = () => window.studio?.window;

const modLabel = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘" : "Ctrl";

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
        <ControlButton
          label="Fullscreen"
          onClick={() => void controls()?.toggleFullscreen()}
        >
          <Maximize2 size={13} />
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
  const hasRecovery = editor.hasRecoveryDraft();

  return (
    <MenuRoot label="File" ariaLabel="File menu">
      <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.newLevel()}>
        <FilePlus2 size={13} /> New Level
        <span className={menuShortcut}>{modLabel}+N</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={ctxItemCls(false)}
        onSelect={() => void editor.openLevel()}
      >
        <FolderOpen size={13} /> Open…
        <span className={menuShortcut}>{modLabel}+O</span>
      </DropdownMenu.Item>
      <DropdownMenu.Separator className={menuSep} />
      <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.save()}>
        <Save size={13} /> Save
        {snap.dirty && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] shadow-[0_0_8px_rgba(96,165,250,0.65)]"
            aria-label="Unsaved changes"
          />
        )}
        <span className={menuShortcut}>{modLabel}+S</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={ctxItemCls(false)}
        onSelect={() => void editor.copyDocumentJson()}
      >
        <ClipboardCopy size={13} /> Copy JSON
      </DropdownMenu.Item>
      {hasRecovery && (
        <>
          <DropdownMenu.Separator className={menuSep} />
          <DropdownMenu.Item
            className={ctxItemCls(false)}
            onSelect={() => editor.restoreRecovery()}
          >
            <History size={13} /> Restore Recovery Draft…
          </DropdownMenu.Item>
        </>
      )}
    </MenuRoot>
  );
}

function ViewMenu() {
  const snap = useEditorSnapshot();
  const open = useOpenPanelIds();
  const colorTheme = useUiStore((s) => s.colorTheme);
  const setColorTheme = useUiStore((s) => s.setColorTheme);
  const fullscreen = useUiStore((s) => s.fullscreen);
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <MenuRoot label="View" ariaLabel="View menu">
      <DropdownMenu.Label className={menuLabel}>Appearance</DropdownMenu.Label>
      <DropdownMenu.CheckboxItem
        className={ctxItemCls(false)}
        checked={colorTheme === "dark"}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={(checked) => setColorTheme(checked ? "dark" : "light")}
      >
        <CheckSlot />
        <Moon size={13} /> Dark theme
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.CheckboxItem
        className={ctxItemCls(false)}
        checked={fullscreen}
        onCheckedChange={() => void controls()?.toggleFullscreen()}
      >
        <CheckSlot />
        <Maximize2 size={13} /> Fullscreen
        <span className={menuShortcut}>F11</span>
      </DropdownMenu.CheckboxItem>

      <DropdownMenu.Separator className={menuSep} />
      <DropdownMenu.Label className={menuLabel}>Canvas</DropdownMenu.Label>
      <DropdownMenu.CheckboxItem
        className={ctxItemCls(false)}
        checked={snap.state.gridVisible}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={() => editor.toggleGrid()}
      >
        <CheckSlot />
        <Grid3x3 size={13} /> Grid
        <span className={menuShortcut}>G</span>
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.CheckboxItem
        className={ctxItemCls(false)}
        checked={snap.state.snapEnabled}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={() => editor.toggleSnap()}
      >
        <CheckSlot />
        <Magnet size={13} /> Snap
        <span className={menuShortcut}>⇧G</span>
      </DropdownMenu.CheckboxItem>

      <DropdownMenu.Separator className={menuSep} />
      <DropdownMenu.Label className={menuLabel}>Zoom · {zoomPercent}%</DropdownMenu.Label>
      <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.zoomIn()}>
        <ZoomIn size={13} /> Zoom In
        <span className={menuShortcut}>{modLabel}+=</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.zoomOut()}>
        <ZoomOut size={13} /> Zoom Out
        <span className={menuShortcut}>{modLabel}+−</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.setZoom(1)}>
        <RotateCcw size={13} /> Zoom 100%
        <span className={menuShortcut}>{modLabel}+0</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.fit()}>
        <Maximize size={13} /> Fit to View
        <span className={menuShortcut}>F</span>
      </DropdownMenu.Item>

      <DropdownMenu.Separator className={menuSep} />
      <DropdownMenu.Label className={menuLabel}>Panels</DropdownMenu.Label>
      {PANELS.map((p) => (
        <DropdownMenu.CheckboxItem
          key={p.id}
          className={ctxItemCls(false)}
          checked={open.includes(p.id)}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={() => togglePanel(p.id)}
        >
          <CheckSlot />
          {p.title}
        </DropdownMenu.CheckboxItem>
      ))}

      <DropdownMenu.Separator className={menuSep} />
      <DropdownMenu.Item
        className={ctxItemCls(false)}
        onSelect={() => {
          resetLayout();
          editor.toast("Layout reset.");
        }}
      >
        <LayoutTemplate size={13} /> Reset Layout
      </DropdownMenu.Item>
    </MenuRoot>
  );
}

function MenuRoot({
  label,
  ariaLabel,
  children,
}: Readonly<{
  label: string;
  ariaLabel: string;
  children: ReactNode;
}>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="inline-flex items-center h-full px-2.5 text-[11.5px] font-medium text-fg-3 hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg transition-colors duration-100"
          aria-label={ariaLabel}
        >
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menu} sideOffset={2} align="start">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function CheckSlot() {
  return (
    <span className="inline-flex w-3.5 justify-center flex-none">
      <DropdownMenu.ItemIndicator>
        <Check size={13} />
      </DropdownMenu.ItemIndicator>
    </span>
  );
}

function ControlButton({
  label,
  danger,
  onClick,
  children,
}: Readonly<{
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}>) {
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
