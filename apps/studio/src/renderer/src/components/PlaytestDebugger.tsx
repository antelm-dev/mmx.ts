import { type ReactElement, type ReactNode } from "react";
import {
  Bug,
  ClipboardCopy,
  Crosshair,
  FastForward,
  Flag,
  FolderOpen,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  Rewind,
  RotateCcw,
  Save,
  Shield,
  StepForward,
} from "lucide-react";
import type { ActorSnapshot, FrameStatsSnapshot, PlaytestDebugInfo } from "@mmx/editor-runtime";
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
  const debug = snap.debug;

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
        <IconButton label="Slower ([)" onClick={() => editor.playtestNudgeTimeScale(-1)}>
          <Rewind size={14} />
        </IconButton>
        <Readout label="speed" value={`x${debug.timeScale}`} />
        <IconButton label="Faster (])" onClick={() => editor.playtestNudgeTimeScale(1)}>
          <FastForward size={14} />
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
        <IconButton
          label={
            debug.invulnerable
              ? "Disable invulnerability (Ctrl+I)"
              : "Enable invulnerability (Ctrl+I)"
          }
          active={debug.invulnerable}
          onClick={() => editor.playtestSetInvulnerable(!debug.invulnerable)}
        >
          <Shield size={14} />
        </IconButton>
        <IconButton label="Save replay (Ctrl+U)" onClick={() => editor.playtestSaveReplay()}>
          <Save size={14} />
        </IconButton>
        <IconButton label="Load replay (Ctrl+O)" onClick={() => editor.playtestLoadReplay()}>
          <FolderOpen size={14} />
        </IconButton>
        <IconButton
          label="Copy diagnostics (Ctrl+Y)"
          onClick={() => editor.playtestCopyDiagnostics()}
        >
          <ClipboardCopy size={14} />
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

      <TimelineStrip
        frame={snap.frame}
        recordedLength={debug.recordedLength}
        checkpointFrame={snap.checkpointFrame}
        paused={paused}
      />

      <PerformanceReadout stats={snap.frameStats} debug={debug} />

      {debug.notice && (
        <div className="pointer-events-none px-2.5 py-1 bg-[rgba(12,17,26,0.94)] border border-[rgba(64,77,100,0.72)] rounded-lg text-[11px] text-[#d8e7ff]">
          {debug.notice}
        </div>
      )}

      {inspectorVisible && runtime && (
        <RuntimeInspector runtime={runtime} selectedRuntimeId={snap.selectedRuntimeId} />
      )}
    </div>
  );
}

function TimelineStrip({
  frame,
  recordedLength,
  checkpointFrame,
  paused,
}: {
  frame: number;
  recordedLength: number;
  checkpointFrame: number;
  paused: boolean;
}): ReactElement {
  const max = Math.max(recordedLength, frame, 1);
  return (
    <div className="pointer-events-auto flex items-center gap-2 max-w-[520px] w-[min(520px,92vw)] px-2.5 py-1.5 bg-[rgba(12,17,26,0.94)] border border-[rgba(64,77,100,0.72)] rounded-xl shadow-[0_6px_20px_rgba(0,0,0,0.34)] backdrop-blur-[10px]">
      <Gauge size={12} className="text-[#7c8da7] flex-none" />
      <input
        type="range"
        min={0}
        max={max}
        value={frame}
        disabled={!paused && recordedLength === 0}
        onChange={(e) => editor.playtestSeek(Number(e.target.value))}
        className="flex-1 accent-[#4b8eff] h-1.5 cursor-pointer disabled:opacity-40"
        aria-label="Seek timeline"
        title={`Seek to frame (ckpt ${checkpointFrame})`}
      />
      <span className="font-mono text-[10.5px] text-[#edf3fc] tabular-nums flex-none">
        {frame}/{max}
      </span>
    </div>
  );
}

function PerformanceReadout({
  stats,
  debug,
}: {
  stats: FrameStatsSnapshot;
  debug: PlaytestDebugInfo;
}): ReactElement {
  return (
    <div className="pointer-events-none flex flex-col items-stretch gap-1 max-w-[520px] px-2.5 py-1.5 bg-[rgba(12,17,26,0.94)] border border-[rgba(64,77,100,0.72)] rounded-xl shadow-[0_6px_20px_rgba(0,0,0,0.34)] backdrop-blur-[10px] text-[10.5px] text-[#b4c1d4]">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Readout label="fps" value={stats.fps.toFixed(1)} />
        <TimingReadout label="sim" summary={stats.simulation} />
        <TimingReadout label="ren" summary={stats.rendering} />
        <Readout label="catch-up" value={String(stats.catchUpFrames)} />
        <Readout label="discarded" value={`${fmtMs(stats.discardedSimulationTime)} ms`} />
        <Readout label="rec" value={String(debug.recordedLength)} />
        {debug.tainted && <Readout label="replay" value="tainted" />}
      </div>
      <div className="text-center text-[8.5px] uppercase tracking-[0.4px] text-[#5f7088]">
        timing median / p95 / worst (ms)
      </div>
    </div>
  );
}

function TimingReadout({
  label,
  summary,
}: {
  label: string;
  summary: FrameStatsSnapshot["simulation"];
}): ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-0.5" title="median / p95 / worst (ms)">
      <span className="text-[9.5px] uppercase tracking-[0.5px] text-[#7c8da7]">{label}</span>
      <span className="font-mono text-[11px] text-[#edf3fc] tabular-nums">
        {fmtMs(summary.median)} / {fmtMs(summary.p95)} / {fmtMs(summary.worst)}
      </span>
    </div>
  );
}

function fmtMs(ms: number): string {
  if (ms >= 100) return ms.toFixed(0);
  if (ms >= 10) return ms.toFixed(1);
  return ms.toFixed(2);
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
