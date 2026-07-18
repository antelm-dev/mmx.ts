const SAMPLE_COUNT = 240;
const GRAPH_WIDTH = 240;
const GRAPH_HEIGHT = 64;
const UPDATE_INTERVAL_MS = 250;

export interface FrameProfile {
  frameTime: number;
  simulation: number;
  rendering: number;
  frameWork: number;
  simulationSteps: number;
}

interface Summary {
  median: number;
  p95: number;
  worst: number;
}

function summarize(values: readonly number[]): Summary {
  if (values.length === 0) return { median: 0, p95: 0, worst: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => sorted[Math.ceil((sorted.length - 1) * p)]!;
  return { median: percentile(0.5), p95: percentile(0.95), worst: sorted.at(-1)! };
}

function format(summary: Summary): string {
  return `${summary.median.toFixed(1)} / ${summary.p95.toFixed(1)} / ${summary.worst.toFixed(1)}`;
}

/** Lightweight, allocation-bounded frame timings for the browser debug HUD. */
export class FrameProfiler {
  private readonly samples: FrameProfile[] = [];
  private readonly root = document.createElement("aside");
  private readonly graph = document.createElement("canvas");
  private readonly values = document.createElement("pre");
  private lastUpdate = 0;
  private visible = false;

  constructor() {
    this.root.id = "debug-profiler";
    this.root.setAttribute("aria-label", "Frame profiler");
    this.root.innerHTML = "<strong>FRAME TIMES</strong><small>median / p95 / worst (ms)</small>";
    this.graph.width = GRAPH_WIDTH;
    this.graph.height = GRAPH_HEIGHT;
    this.root.append(this.graph, this.values);
    document.body.append(this.root);

    this.setVisible(new URLSearchParams(location.search).has("profile"));
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.hidden = !visible;
    if (visible) this.paint();
  }

  record(sample: FrameProfile, now: number): void {
    this.samples.push(sample);
    if (this.samples.length > SAMPLE_COUNT) this.samples.shift();
    if (!this.visible || now - this.lastUpdate < UPDATE_INTERVAL_MS) return;
    this.lastUpdate = now;
    this.paint();
  }

  snapshot(): Readonly<{ samples: readonly FrameProfile[]; frameTime: Summary }> {
    return { samples: this.samples, frameTime: summarize(this.samples.map((s) => s.frameTime)) };
  }

  private paint(): void {
    const frame = summarize(this.samples.map((s) => s.frameTime));
    const simulation = summarize(this.samples.map((s) => s.simulation));
    const rendering = summarize(this.samples.map((s) => s.rendering));
    const work = summarize(this.samples.map((s) => s.frameWork));
    const latest = this.samples.at(-1);

    this.values.textContent =
      `frame  ${format(frame)}\n` +
      `sim    ${format(simulation)}\n` +
      `render ${format(rendering)}\n` +
      `work   ${format(work)}\n` +
      `steps  ${latest?.simulationSteps ?? 0}   F2: hide`;

    const ctx = this.graph.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    ctx.fillStyle = "#071018";
    ctx.fillRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);

    const y = (milliseconds: number): number =>
      GRAPH_HEIGHT - Math.min(GRAPH_HEIGHT, (milliseconds / 33.34) * GRAPH_HEIGHT);
    for (const [budget, color] of [
      [16.67, "#395564"],
      [33.34, "#6a3940"],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y(budget));
      ctx.lineTo(GRAPH_WIDTH, y(budget));
      ctx.stroke();
    }

    ctx.strokeStyle = "#61dafb";
    ctx.beginPath();
    this.samples.forEach((sample, index) => {
      const x = GRAPH_WIDTH - this.samples.length + index + 0.5;
      const py = y(sample.frameTime);
      if (index === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    });
    ctx.stroke();
  }
}
