import { useEffect, useState, type ReactNode } from "react";
import { chakra } from "@chakra-ui/react";
import {
  ClipboardCopy,
  Code2,
  Copy,
  Download,
  FilePlus2,
  FolderKanban,
  FolderOpen,
  Grid3x3,
  History,
  Info,
  LayoutTemplate,
  Magnet,
  Maximize,
  Maximize2,
  Minus,
  Monitor,
  Moon,
  RotateCcw,
  Save,
  Share2,
  Square,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
  Scissors,
} from "lucide-react";
import {
  openPanel,
  PANELS,
  resetLayout,
  SLICER_PANEL,
  togglePanel,
  useOpenPanelIds,
} from "../app/dock.js";
import { editor, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import type { ThemePreference } from "../app/theme.js";
import { useUiStore } from "../store/uiStore.js";
import { hasSeenNotice, markNoticeSeen } from "../settings/studioClientSettings.js";
import { AboutDialog } from "./AboutDialog.js";

import {
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/primitives/menu.js";

const controls = () => window.studio?.window;

const dragRegion = { WebkitAppRegion: "drag" };
const noDragRegion = { WebkitAppRegion: "no-drag" };

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
    <chakra.div
      display="flex"
      alignItems="stretch"
      h="8"
      pl="3"
      bg="studio.chrome"
      borderBottom="1px solid"
      borderColor="studio.border"
      userSelect="none"
      css={dragRegion}
    >
      <chakra.div
        display="flex"
        alignItems="center"
        gap="2"
        minW="0"
        fontSize="11.5px"
        fontWeight="semibold"
        letterSpacing="0.3px"
        color="studio.fgTertiary"
      >
        <chakra.img
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt=""
          w="15px"
          h="15px"
          flex="none"
        />
        <span data-testid="app-brand">
          MMX <chakra.span color="studio.fgSecondary">Studio</chakra.span>
        </span>
      </chakra.div>

      <chakra.div display="flex" alignItems="stretch" ml="2" css={noDragRegion}>
        <FileMenu />
        <ViewMenu />
        <HelpMenu />
      </chakra.div>

      <chakra.div flex="1" />

      <chakra.div display="flex" alignItems="stretch" css={noDragRegion}>
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
        <ControlButton label="Fullscreen" onClick={() => void controls()?.toggleFullscreen()}>
          <Maximize2 size={13} />
        </ControlButton>
        <ControlButton label="Close" danger onClick={() => void controls()?.close()}>
          <X size={16} />
        </ControlButton>
      </chakra.div>
    </chakra.div>
  );
}

function FileMenu() {
  const snap = useEditorSnapshot();
  const project = useProjectSession();
  const hasRecovery = editor.hasRecoveryDraft();

  return (
    <TitleMenu label="File" ariaLabel="File menu">
      <MenuGroup label="Project">
        <MenuItem value="new-project" onSelect={() => void editor.createProject()}>
          <FolderKanban size={13} /> New Project…
        </MenuItem>
        <MenuItem value="new-from-starter" onSelect={() => void editor.createFromStarter()}>
          <LayoutTemplate size={13} /> New from MMX Starter…
        </MenuItem>
        <MenuItem value="open-project" onSelect={() => void editor.openProject()}>
          <FolderOpen size={13} /> Open Project…
        </MenuItem>
        <MenuItem value="import-steam" onSelect={() => void editor.importFromSteam()}>
          <Download size={13} /> Import from Steam installs…
        </MenuItem>
        <MenuItem
          value="export-project"
          disabled={!project.open}
          onSelect={() => void editor.exportProject()}
        >
          <Share2 size={13} /> Export Project…
        </MenuItem>
        <MenuItem
          value="slice-sheet"
          disabled={!project.open}
          onSelect={() => openPanel(SLICER_PANEL)}
        >
          <Scissors size={13} /> Slice Sheet…
        </MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuGroup label="Level">
        <MenuItem value="new-level" onSelect={() => editor.newLevel()}>
          <FilePlus2 size={13} /> New Level
          <MenuShortcut>{modLabel}+N</MenuShortcut>
        </MenuItem>
        <MenuItem value="open-level" onSelect={() => void editor.openLevel()}>
          <FolderOpen size={13} /> Open…
          <MenuShortcut>{modLabel}+O</MenuShortcut>
        </MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuItem value="save" onSelect={() => editor.save()}>
        <Save size={13} /> Save
        {snap.dirty && (
          <chakra.span
            w="1.5"
            h="1.5"
            rounded="full"
            bg="#60a5fa"
            boxShadow="0 0 8px rgba(96,165,250,0.65)"
            aria-label="Unsaved changes"
          />
        )}
        <MenuShortcut>{modLabel}+S</MenuShortcut>
      </MenuItem>
      <MenuItem value="copy-json" onSelect={() => void editor.copyDocumentJson()}>
        <ClipboardCopy size={13} /> Copy JSON
      </MenuItem>
      {hasRecovery && (
        <>
          <MenuSeparator />
          <MenuItem value="restore-recovery" onSelect={() => editor.restoreRecovery()}>
            <History size={13} /> Restore Recovery Draft…
          </MenuItem>
        </>
      )}
    </TitleMenu>
  );
}

function ViewMenu() {
  const snap = useEditorSnapshot();
  const open = useOpenPanelIds();
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const fullscreen = useUiStore((s) => s.fullscreen);
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <TitleMenu label="View" ariaLabel="View menu">
      <MenuGroup label="Appearance">
        <MenuRadioItemGroup
          value={themePreference}
          onValueChange={({ value }) => setThemePreference(value as ThemePreference)}
        >
          <MenuRadioItem value="light" closeOnSelect={false}>
            <Sun size={13} /> Light theme
          </MenuRadioItem>
          <MenuRadioItem value="dark" closeOnSelect={false}>
            <Moon size={13} /> Dark theme
          </MenuRadioItem>
          <MenuRadioItem value="system" closeOnSelect={false}>
            <Monitor size={13} /> System theme
          </MenuRadioItem>
        </MenuRadioItemGroup>
        <MenuCheckboxItem
          value="fullscreen"
          checked={fullscreen}
          onCheckedChange={() => void controls()?.toggleFullscreen()}
        >
          <Maximize2 size={13} /> Fullscreen
          <MenuShortcut>F11</MenuShortcut>
        </MenuCheckboxItem>
      </MenuGroup>

      <MenuSeparator />
      <MenuGroup label="Canvas">
        <MenuCheckboxItem
          value="grid"
          closeOnSelect={false}
          checked={snap.state.gridVisible}
          onCheckedChange={() => editor.toggleGrid()}
        >
          <Grid3x3 size={13} /> Grid
          <MenuShortcut>G</MenuShortcut>
        </MenuCheckboxItem>
        <MenuCheckboxItem
          value="snap"
          closeOnSelect={false}
          checked={snap.state.snapEnabled}
          onCheckedChange={() => editor.toggleSnap()}
        >
          <Magnet size={13} /> Snap
          <MenuShortcut>⇧G</MenuShortcut>
        </MenuCheckboxItem>
      </MenuGroup>

      <MenuSeparator />
      <MenuGroup label={`Zoom · ${zoomPercent}%`}>
        <MenuItem value="zoom-in" onSelect={() => editor.zoomIn()}>
          <ZoomIn size={13} /> Zoom In
          <MenuShortcut>{modLabel}+=</MenuShortcut>
        </MenuItem>
        <MenuItem value="zoom-out" onSelect={() => editor.zoomOut()}>
          <ZoomOut size={13} /> Zoom Out
          <MenuShortcut>{modLabel}+−</MenuShortcut>
        </MenuItem>
        <MenuItem value="zoom-100" onSelect={() => editor.setZoom(1)}>
          <RotateCcw size={13} /> Zoom 100%
          <MenuShortcut>{modLabel}+0</MenuShortcut>
        </MenuItem>
        <MenuItem value="fit" onSelect={() => editor.fit()}>
          <Maximize size={13} /> Fit to View
          <MenuShortcut>F</MenuShortcut>
        </MenuItem>
      </MenuGroup>

      <MenuSeparator />
      <MenuGroup label="Panels">
        {PANELS.map((p) => (
          <MenuCheckboxItem
            key={p.id}
            value={`panel-${p.id}`}
            closeOnSelect={false}
            checked={open.includes(p.id)}
            onCheckedChange={() => togglePanel(p.id)}
          >
            {p.title}
          </MenuCheckboxItem>
        ))}
      </MenuGroup>

      <MenuSeparator />
      <MenuItem
        value="reset-layout"
        onSelect={() => {
          resetLayout();
          editor.toast("Layout reset.");
        }}
      >
        <LayoutTemplate size={13} /> Reset Layout
      </MenuItem>
    </TitleMenu>
  );
}

function HelpMenu() {
  // First launch opens About once so the fan-content notice is seen.
  const [aboutOpen, setAboutOpen] = useState(() => !hasSeenNotice());
  return (
    <>
      <TitleMenu label="Help" ariaLabel="Help menu">
        <MenuItem value="toggle-devtools" onSelect={() => void controls()?.toggleDevTools()}>
          <Code2 size={13} /> Toggle Developer Tools
          <MenuShortcut>{modLabel}+Shift+I</MenuShortcut>
        </MenuItem>
        <MenuItem value="about" onSelect={() => setAboutOpen(true)}>
          <Info size={13} /> About MMX Studio
        </MenuItem>
      </TitleMenu>
      <AboutDialog
        open={aboutOpen}
        onClose={() => {
          markNoticeSeen();
          setAboutOpen(false);
        }}
      />
    </>
  );
}

// Plain dropdowns, not a menubar: as before, hovering another trigger while one is open does not switch menus.
function TitleMenu({
  label,
  ariaLabel,
  children,
}: Readonly<{
  label: string;
  ariaLabel: string;
  children: ReactNode;
}>) {
  return (
    <MenuRoot positioning={{ placement: "bottom-start", gutter: 2 }}>
      <MenuTrigger asChild>
        <chakra.button
          display="inline-flex"
          alignItems="center"
          h="full"
          px="2.5"
          fontSize="11.5px"
          fontWeight="medium"
          color="studio.fgTertiary"
          transition="colors"
          transitionDuration="100ms"
          _hover={{ bg: "studio.hover", color: "studio.fg" }}
          _open={{ bg: "studio.hover", color: "studio.fg" }}
          aria-label={ariaLabel}
        >
          {label}
        </chakra.button>
      </MenuTrigger>
      <MenuContent overflowY="auto">{children}</MenuContent>
    </MenuRoot>
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
    <chakra.button
      aria-label={label}
      title={label}
      onClick={onClick}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      w="46px"
      h="full"
      color="studio.fgTertiary"
      transition="colors"
      transitionDuration="100ms"
      _hover={danger ? { bg: "studio.danger", color: "white" } : { bg: "studio.hover", color: "studio.fg" }}
    >
      {children}
    </chakra.button>
  );
}
