import { type ReactElement, type ReactNode } from "react";
import { chakra } from "@chakra-ui/react";
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
import { OverlayButton, OverlayCard, OverlayLabel, OverlayValue } from "../ui/editor/overlay.js";
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
    <chakra.div
      position="absolute"
      zIndex="4"
      top="3"
      left="50%"
      transform="translateX(-50%)"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="2"
      pointerEvents="none"
    >
      <OverlayCard pointerEvents="auto" display="flex" alignItems="center" gap="1" h="9" px="1.5">
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
      </OverlayCard>

      <TimelineStrip
        frame={snap.frame}
        recordedLength={debug.recordedLength}
        checkpointFrame={snap.checkpointFrame}
        paused={paused}
      />

      <PerformanceReadout stats={snap.frameStats} debug={debug} />

      {debug.notice && (
        <OverlayCard
          pointerEvents="none"
          px="2.5"
          py="1"
          rounded="lg"
          boxShadow="none"
          backdropFilter="none"
          fontSize="11px"
          color="#d8e7ff"
        >
          {debug.notice}
        </OverlayCard>
      )}

      {inspectorVisible && runtime && (
        <RuntimeInspector runtime={runtime} selectedRuntimeId={snap.selectedRuntimeId} />
      )}
    </chakra.div>
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
    <OverlayCard
      pointerEvents="auto"
      display="flex"
      alignItems="center"
      gap="2"
      maxW="520px"
      w="min(520px,92vw)"
      px="2.5"
      py="1.5"
    >
      <OverlayLabel display="inline-flex" flex="none">
        <Gauge size={12} />
      </OverlayLabel>
      <chakra.input
        type="range"
        min={0}
        max={max}
        value={frame}
        disabled={!paused && recordedLength === 0}
        onChange={(e) => editor.playtestSeek(Number(e.target.value))}
        flex="1"
        h="1.5"
        bg="transparent"
        cursor="pointer"
        _disabled={{ opacity: 0.4 }}
        style={{ accentColor: "#4b8eff" }}
        aria-label="Seek timeline"
        title={`Seek to frame (ckpt ${checkpointFrame})`}
      />
      <OverlayValue fontSize="10.5px" flex="none">
        {frame}/{max}
      </OverlayValue>
    </OverlayCard>
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
    <OverlayCard
      pointerEvents="none"
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      gap="1"
      maxW="520px"
      px="2.5"
      py="1.5"
      fontSize="10.5px"
      color="#b4c1d4"
    >
      <chakra.div
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="center"
        columnGap="3"
        rowGap="1"
      >
        <Readout label="fps" value={stats.fps.toFixed(1)} />
        <TimingReadout label="sim" summary={stats.simulation} />
        <TimingReadout label="ren" summary={stats.rendering} />
        <Readout label="catch-up" value={String(stats.catchUpFrames)} />
        <Readout label="discarded" value={`${fmtMs(stats.discardedSimulationTime)} ms`} />
        <Readout label="rec" value={String(debug.recordedLength)} />
        {debug.tainted && <Readout label="replay" value="tainted" />}
      </chakra.div>
      <OverlayLabel
        display="block"
        textAlign="center"
        fontSize="8.5px"
        letterSpacing="0.4px"
        color="#5f7088"
      >
        timing median / p95 / worst (ms)
      </OverlayLabel>
    </OverlayCard>
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
    <chakra.div display="flex" alignItems="center" gap="1.5" px="0.5" title="median / p95 / worst (ms)">
      <OverlayLabel>{label}</OverlayLabel>
      <OverlayValue>
        {fmtMs(summary.median)} / {fmtMs(summary.p95)} / {fmtMs(summary.worst)}
      </OverlayValue>
    </chakra.div>
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
    <OverlayCard pointerEvents="auto" w="236px" p="2.5" fontSize="11px" color="#b4c1d4">
      {actors.length > 1 && (
        <chakra.div display="flex" flexWrap="wrap" gap="1" mb="2">
          {actors.map((a) => (
            <OverlayButton
              key={a.runtimeId}
              onClick={() => editor.playtestSelect(a.runtimeId)}
              active={a.runtimeId === selected.runtimeId}
              h="6"
              px="1.5"
              rounded="md"
              fontSize="10.5px"
              {...(a.runtimeId === selected.runtimeId
                ? { borderColor: "rgba(75,142,255,0.4)" }
                : { color: "#7c8da7" })}
            >
              {a.kind}
            </OverlayButton>
          ))}
        </chakra.div>
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
        <OverlayButton
          onClick={() => editor.playtestFocusSource()}
          mt="2"
          w="full"
          borderColor="#3a4960"
          fontSize="11px"
        >
          <Crosshair size={12} /> Focus authored object
        </OverlayButton>
      )}
    </OverlayCard>
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
    <OverlayButton
      aria-label={label}
      title={label}
      disabled={disabled}
      active={active}
      onClick={onClick}
      w="8"
    >
      {children}
    </OverlayButton>
  );
}

function Divider(): ReactElement {
  return <chakra.span w="1px" h="4" mx="0.5" bg="#3a4960" />;
}

function Readout({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <chakra.div display="flex" alignItems="center" gap="1.5" px="1.5">
      <OverlayLabel>{label}</OverlayLabel>
      <OverlayValue>{value}</OverlayValue>
    </chakra.div>
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
    <chakra.div display="flex" alignItems="baseline" justifyContent="space-between" gap="2" py="1.5px">
      <OverlayLabel fontSize="10px" letterSpacing="0.4px" flex="none">
        {label}
      </OverlayLabel>
      <OverlayValue
        textAlign="right"
        truncate
        {...(mono ? { fontSize: "10.5px" } : { fontFamily: "inherit", fontSize: "inherit" })}
      >
        {value}
      </OverlayValue>
    </chakra.div>
  );
}
