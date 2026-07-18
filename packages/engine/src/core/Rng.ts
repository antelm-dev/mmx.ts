/**
 * Seeded PRNG (mulberry32).
 *
 * The Godot original calls the global `randf_range` in a few cosmetic places —
 * a shot's vertical spawn jitter, the lemon's starting animation frame, fire-sound
 * pitch, the hit particle's vertical flip. Reaching for `Math.random` here would
 * quietly cost the port the one property the rest of it is built on: the headless
 * sim (apps/sim/src/run.ts) and the tests replay a scripted input timeline and expect
 * the same trace every run.
 *
 * So randomness is owned, not ambient: one generator per World, seeded explicitly,
 * and every roll goes through it. Same seed, same run.
 */
export class Rng {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Godot's `randf_range(from, to)` — uniform float in [from, to). */
  range(from: number, to: number): number {
    return from + this.next() * (to - from);
  }

  /** Godot's `randi_range`-style integer draw, inclusive of both ends. */
  int(from: number, to: number): number {
    return from + Math.floor(this.next() * (to - from + 1));
  }
}
