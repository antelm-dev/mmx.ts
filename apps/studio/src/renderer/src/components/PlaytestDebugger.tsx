import { type ReactElement, type ReactNode } from "react";
import { Bug, Crosshair, Flag, Pause, Play, RefreshCw, RotateCcw, StepForward } from "lucide-react";
import type { ActorSnapshot } from "@mmx/editor-runtime";
import { editor, usePlaytestSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { cx } from "../ui.js";
import { fmtAbilities, fmtHealth, fmtPosition, fmtVec } from "../core/playtest/format.js";

/**
 * The Playtest Debugger: a control strip plus a runtime inspector, shown over the
 * game canvas while Play mode is active. It reads the editor-runtime
 * {@link PlaytestSnapshot} and issues commands back through the {@link editor};
 * it holds no simulation state of its own.
 */
export function PlaytestDebugger(): ReactElement | null {
  const snap = usePlaytestSnapshot();
  const inspectorVisible = useUiStore((s) => s.playtestInspectorVisible);
  const toggleInspector = useUiStore((s) => s.togglePlaytestInspector);
  if (snap.status === "stopped") return null;

  const paused = snap.status === "paused";
  const runtime = snap.runtime;

  return (
    <div className="absolute z-[4] top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 h-9 px-1.5 bg-[rgba(12,17,26,0.94)] border border-[rgba(64,77,100,0.72)] rounded-xl shadow-[0_6px_20px_rgba(0,0,0,0.34)] backdrop-blur-[10px]">
        <IconButton
          label={paused ? "Resume (F8)" : "Pause (F8)"}
          onClick={() => editor.playtestTogglePause()}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </IconButton>
        <IconButton
          label="Step one frame (F10)"
          disabled={!paused}
          onClick={() => editor.playtestStep()}
        >
          <StepForward size={14} />
        </IconButton>
        <Divider />
        <IconButton label="Set checkpoint (Ctrl+F8)" onClick={() => editor.playtestSetCheckpoint()}>
          <Flag size={14} />
        </IconButton>
        <IconButton
          label="Restart from checkpoint (Shift+F8)"
          onClick={() => editor.playtestRestartCheckpoint()}
        >
          <RotateCcw size={14} />
        </IconButton>
        <IconButton label="Restart level" onClick={() => editor.playtestRestartLevel()}>
          <RefreshCw size={14} />
        </IconButton>
        <Divider />
        <Readout label="frame" value={String(snap.frame)} />
        <Readout label="ckpt" value={String(snap.checkpointFrame)} />
        <Readout label="digest" value={runtime?.digest ?? "········"} />
        <Divider />
        <IconButton
          label={inspectorVisible ? "Hide inspector (F9)" : "Show inspector (F9)"}
          active={inspectorVisible}
          onClick={toggleInspector}
        >
          <Bug size={14} />
        </IconButton>
      </div>

      {inspectorVisible && runtime && (
        <RuntimeInspector runtime={runtime} selectedRuntimeId={snap.selectedRuntimeId} />
      )}
    </div>
  );
}

function RuntimeInspector({
  runtime,
  selectedRuntimeId,
}: {
  runtime: NonNullable<ReturnType<typeof usePlaytestSnapshot>["runtime"]>;
  selectedRuntimeId: string | null;
}): ReactElement {
  const actors: ActorSnapshot[] = [runtime.player, ...runtime.actors];
  const selected = actors.find((a) => a.runtimeId === selectedRuntimeId) ?? runtime.player;

  return (
    <div className="pointer-events-auto w-[236px] p-2.5 bg-[rgba(12,17,26,0.94)] border border-[rgba(64,77,100,0.72)] rounded-xl shadow-[0_6px_20px_rgba(0,0,0,0.34)] backdrop-blur-[10px] text-[11px] text-[#b4c1d4]">
      {actors.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {actors.map((a) => (
            <button
              key={a.runtimeId}
              onClick={() => editor.playtestSelect(a.runtimeId)}
              className={cx(
                "px-1.5 h-6 rounded-md text-[10.5px] font-semibold cursor-pointer border transition-colors",
                a.runtimeId === selected.runtimeId
                  ? "bg-[rgba(75,142,255,0.15)] text-[#d8e7ff] border-[rgba(75,142,255,0.4)]"
                  : "text-[#7c8da7] border-transparent hover:bg-[#1b2636] hover:text-[#edf3fc]",
              )}
            >
              {a.kind}
            </button>
          ))}
        </div>
      )}

      <Field label="kind" value={selected.kind} />
      <Field label="runtimeId" value={selected.runtimeId} mono />
      {selected.sourceEntityId && <Field label="source" value={selected.sourceEntityId} mono />}
      <Field label="position" value={fmtPosition(selected)} />
      <Field label="velocity" value={fmtVec(selected.velocity)} />
      <Field label="health" value={fmtHealth(selected.health, selected.maxHealth)} />
      <Field label="state" value={selected.state} />
      <Field label="abilities" value={fmtAbilities(selected.abilities)} />

      {selected.sourceEntityId && (
        <button
          onClick={() => editor.playtestFocusSource()}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-lg border border-[#3a4960] text-[#b4c1d4] text-[11px] font-semibold cursor-pointer hover:bg-[#1b2636] hover:text-[#edf3fc] transition-colors"
        >
          <Crosshair size={12} /> Focus authored object
        </button>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center w-8 h-7 rounded-lg cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default",
        active
          ? "bg-[rgba(75,142,255,0.15)] text-[#d8e7ff]"
          : "text-[#b4c1d4] enabled:hover:bg-[#1b2636] enabled:hover:text-[#edf3fc]",
      )}
    >
      {children}
    </button>
  );
}

function Divider(): ReactElement {
  return <span className="w-px h-4 mx-0.5 bg-[#3a4960]" />;
}

function Readout({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.5px] text-[#7c8da7]">{label}</span>
      <span className="font-mono text-[11px] text-[#edf3fc] tabular-nums">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[1.5px]">
      <span className="text-[10px] uppercase tracking-[0.4px] text-[#7c8da7] flex-none">
        {label}
      </span>
      <span className={cx("text-right truncate text-[#edf3fc]", mono && "font-mono text-[10.5px]")}>
        {value}
      </span>
    </div>
  );
}
