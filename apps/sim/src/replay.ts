import { readFileSync } from "node:fs";
import { decodeReplay, describeInput } from "@mmx/engine/core/Replay.js";
import { Recorder } from "@mmx/engine/game/Recorder.js";
import { Scene } from "@mmx/engine/game/Scene.js";

/**
 * Replay a recording captured in the browser, headlessly.
 *
 *   pnpm replay <file.replay.json> [--trace] [--expect <digest>]
 *
 * This is the other half of the debug HUD's recorder. A bug that reproduces once
 * in fifty attempts is not something you can iterate against; the same bug as a
 * replay file runs in a fraction of a second, in a debugger, as many times as you
 * like — and once it is fixed, the file goes in tests/ and stays fixed.
 *
 * `--expect` turns the run into an assertion: the digest printed by a previous
 * run is compared against this one, so a replay committed alongside a fix fails
 * loudly if a later change moves the simulation, even by a fraction of a pixel.
 *
 * Note that no clip data is loaded here, exactly as in run.ts — with no frames
 * every clip reports itself finished on the next tick, so animation-gated
 * transitions resolve in one frame instead of several. A recording made in the
 * browser therefore diverges from its headless replay wherever an ability waits
 * on an animation. That is a real limitation and not a rounding error: see
 * tests/replay.test.ts, which replays headless-captured input where it does not
 * apply.
 */

interface Options {
  file: string;
  trace: boolean;
  expect: string | null;
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: pnpm replay <file.replay.json> [--trace] [--expect <digest>]");
    process.exit(2);
  }
  const expectIndex = args.indexOf("--expect");
  return {
    file,
    trace: args.includes("--trace"),
    expect: expectIndex >= 0 ? (args[expectIndex + 1] ?? null) : null,
  };
}

function main(): void {
  const options = parseArgs(process.argv);
  const replay = decodeReplay(readFileSync(options.file, "utf8"));

  console.log(`replay: ${options.file}`);
  console.log(
    `  level ${replay.level}   seed 0x${replay.seed.toString(16)}   ${replay.frames.length} frames`,
  );
  if (replay.tainted) {
    console.log("  WARNING: recorded with a debug cheat active — it will not reproduce faithfully");
  }
  console.log("");

  const started = performance.now();
  let scene: Scene;

  if (options.trace) {
    // Stepped by hand rather than through Recorder.replay so the trace can be
    // printed as it goes; the state sequence is identical either way.
    scene = Scene.create({ seed: replay.seed });
    console.log("frame |    posX |    posY |   velX |   velY | floor | hp | input      | state");
    console.log(
      "------+---------+---------+--------+--------+-------+----+------------+--------------",
    );
    for (const [i, mask] of replay.frames.entries()) {
      scene.step(mask);
      if (i % 5 !== 0) continue;
      const p = scene.player;
      console.log(
        `${String(scene.frame).padStart(5)} | ${n(p.pos.x)} | ${n(p.pos.y)} | ` +
          `${n(p.velocity.x)} | ${n(p.velocity.y)} | ` +
          `${(p.is_on_floor() ? "yes" : "no").padStart(5)} | ` +
          `${String(p.current_health).padStart(2)} | ${describeInput(mask).padEnd(10)} | ${p.stateString()}`,
      );
    }
    console.log("");
  } else {
    scene = Recorder.replay(replay);
  }

  const elapsed = performance.now() - started;
  const digest = scene.digest();
  const player = scene.player;

  console.log(`final frame  ${scene.frame}`);
  console.log(`position     ${player.pos.x.toFixed(3)}, ${player.pos.y.toFixed(3)}`);
  console.log(`velocity     ${player.velocity.x.toFixed(3)}, ${player.velocity.y.toFixed(3)}`);
  console.log(`health       ${player.current_health} / ${player.max_health}`);
  console.log(`state        ${player.stateString()}`);
  console.log(
    `enemies      ${scene.stage.enemies.map((e) => `${e.kind} ${e.current_health}hp`).join(", ") || "none"}`,
  );
  console.log(`digest       ${digest}`);
  console.log(
    `replayed in  ${elapsed.toFixed(1)}ms (${((replay.frames.length / elapsed) * 1000).toFixed(0)} ticks/sec)`,
  );

  if (options.expect !== null && options.expect !== digest) {
    console.error(`\nFAIL: expected digest ${options.expect}, got ${digest}`);
    process.exit(1);
  }
  if (options.expect !== null) console.log("\nOK: digest matches");
}

function n(v: number): string {
  return v.toFixed(1).padStart(7);
}

main();
