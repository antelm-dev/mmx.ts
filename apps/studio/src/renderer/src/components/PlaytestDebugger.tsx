import { type ReactElement, type ReactNode } from "react";
import { Crosshair, Flag, Pause, Play, RefreshCw, RotateCcw, StepForward } from "lucide-react";
import type { ActorSnapshot } from "@mmx/engine/tooling";
import { editor, usePlaytestSnapshot } from "../app/useEditor.js";
import { cx } from "../ui.js";
import {
  fmtAbilities,
  fmtHealth,
  fmtPosition,
  fmtVec,
} from "../core/playtest/format.js";

/**
 * The Playtest Debugger: a control strip plus a runtime inspector, shown over the
 * game canvas while Play mode is active. It reads the controller's
 * {@link import("../core/playtest/PlaytestController.js").PlaytestSnapshot} and
 * issues commands back through the {@link editor}; it holds no simulation state
 * of its own.
 */
export function PlaytestDebugger(): ReactElement | null {
  const snap = usePlaytestSnapshot();
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
      </div>

      {runtime && (
        <RuntimeInspector
          runtime={runtime}
          selectedRuntimeId={snap.selectedRuntimeId}
        />
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
  const selected =
    actors.find((a) => a.runtimeId === selectedRuntimeId) ?? runtime.player;

  return (
    <div className="pointer-events-auto w-[236px] p-2.5 bg-[rgba(12,17,26,0.94)] border border-[rgba(64,77,100,0.72)] rounded-xl shadow-[0_6px_20px_rgba(0,0,0,0.34)] backdrop-blur-[10px] text-[11px] text-fg-2">
      {actors.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {actors.map((a) => (
            <button
              key={a.runtimeId}
              onClick={() => editor.playtestSelect(a.runtimeId)}
              className={cx(
                "px-1.5 h-6 rounded-md text-[10.5px] font-semibold cursor-pointer border transition-colors",
                a.runtimeId === selected.runtimeId
                  ? "bg-accent/15 text-accent-fg border-accent/40"
                  : "text-fg-3 border-transparent hover:bg-hover hover:text-fg",
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
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-lg border border-border-strong text-fg-2 text-[11px] font-semibold cursor-pointer hover:bg-hover hover:text-fg transition-colors"
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
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center w-8 h-7 rounded-lg text-fg-2 cursor-pointer transition-colors enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-40 disabled:cursor-default"
    >
      {children}
    </button>
  );
}

function Divider(): ReactElement {
  return <span className="w-px h-4 mx-0.5 bg-border-strong" />;
}

function Readout({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.5px] text-fg-3">{label}</span>
      <span className="font-mono text-[11px] text-fg tabular-nums">{value}</span>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[1.5px]">
      <span className="text-[10px] uppercase tracking-[0.4px] text-fg-3 flex-none">{label}</span>
      <span className={cx("text-right truncate text-fg", mono && "font-mono text-[10.5px]")}>
        {value}
      </span>
    </div>
  );
}
