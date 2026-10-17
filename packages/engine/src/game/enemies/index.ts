import { Enemy } from "../Enemy.js";
import type { AIEvents } from "../EnemyAI.js";
import type { World } from "../World.js";
import type { EnemyAbility } from "../enemy/EnemyAbility.js";
import { shotStats } from "../../core/constants.js";
import { COMPILED_GAME_DATA } from "../../data/index.js";
import type { CompiledEnemy, CompiledGameData } from "../../data/types.js";
import {
  effectRegistry,
  enemyBehaviorRegistry,
  type EnemyBehaviorConfig,
  type RuntimeContext,
} from "../../behaviors/index.js";
import { Death, type DeathConfig } from "../enemy/Death.js";
import { Hide, type HideConfig } from "../enemy/Hide.js";
import { Hover, type HoverConfig } from "../enemy/Hover.js";
import { Patrol, type PatrolConfig } from "../enemy/Patrol.js";
import { Pursuit, type PursuitConfig } from "../enemy/Pursuit.js";
import { Recoil, type RecoilConfig } from "../enemy/Recoil.js";
import { Roll, type RollConfig } from "../enemy/Roll.js";
import { Shoot, type ShootConfig } from "../enemy/Shoot.js";
import { Stun, type StunConfig } from "../enemy/Stun.js";

/**
 * Enemy runtime wiring — the counterpart of loadout/PlayerLoadout for enemies.
 *
 * An enemy is composed from its compiled definition (game data `enemies`): each
 * ability id is instantiated through {@link enemyBehaviorRegistry} with that
 * enemy's `abilityConfig` entry, the reaction table becomes the AI's event
 * lists, and each hook is wired to a registered effect. The registry entries
 * are declared (with their config schemas) in behaviors/; the real `create`
 * bodies are attached here, where the ability classes live.
 *
 * Read side by side, the definitions are the argument for keeping AI.gd's event
 * lists instead of hard-coding transitions: the enemies share every piece of
 * machinery and differ only in which ability answers which event.
 */

type Ctor = (owner: Enemy, config: EnemyBehaviorConfig, ctx: RuntimeContext) => EnemyAbility;

const FACTORIES: Readonly<Record<string, Ctor>> = {
  Patrol: (o, c) => new Patrol(o, c as unknown as PatrolConfig),
  Hide: (o, c) => new Hide(o, c as unknown as HideConfig),
  Stun: (o, c) => new Stun(o, c as unknown as StunConfig),
  Death: (o, c) => new Death(o, c as unknown as DeathConfig),
  Hover: (o, c) => new Hover(o, c as unknown as HoverConfig),
  Pursuit: (o, c) => new Pursuit(o, c as unknown as PursuitConfig),
  Recoil: (o, c) => new Recoil(o, c as unknown as RecoilConfig),
  Roll: (o, c) => new Roll(o, c as unknown as RollConfig),
  Shoot: (o, c, ctx) => {
    const config = c as unknown as ShootConfig;
    return new Shoot(o, config, shotStats(ctx.gameData.projectiles.get(config.projectile)!));
  },
};

// Attach each real create to the registry entry declared in behaviors/.
for (const [id, make] of Object.entries(FACTORIES)) {
  enemyBehaviorRegistry.replace({
    ...enemyBehaviorRegistry.get(id),
    create: (owner, config, ctx) => make(owner as Enemy, config, ctx),
  });
}

/**
 * BeePatrol.ability_who_updates_patrol_area = BatJump: the bat re-centres its
 * wandering wherever the recoil left it, so a bat that has been chasing the
 * player does not spring back to where it originally spawned. `create` returns
 * the action the hook runs.
 */
effectRegistry.replace({
  ...effectRegistry.get("enemy.reanchor-hover"),
  create: (owner) => {
    const enemy = owner as Enemy;
    const hover = enemy.get_ability("Hover");
    if (!(hover instanceof Hover)) {
      throw new Error(`${enemy.kind}: enemy.reanchor-hover needs a Hover ability`);
    }
    return () => hover.reanchor();
  },
});

/**
 * Build an enemy from its compiled definition — used by the level loader.
 *
 * The order is the scenes' and is load-bearing: abilities are added in
 * definition order (it is the AI's start order and the RNG draw order), hooks are
 * wired after them, then the initial clip plays — the AI raises the idle ability
 * on the first frame, which is what actually puts the enemy in motion.
 */
export function spawnEnemy(
  def: CompiledEnemy,
  world: World,
  x: number,
  y: number,
  facing = -1,
  seed?: number,
  gameData: CompiledGameData = COMPILED_GAME_DATA,
): Enemy {
  const enemy = new Enemy(def, world, x, y, facing, seed);
  const ctx: RuntimeContext = { gameData };

  for (const id of def.abilities) {
    const config = def.abilityConfig[id] ?? {};
    enemy.add(enemyBehaviorRegistry.get(id).create(enemy, config, ctx) as EnemyAbility);
  }
  for (const hook of def.hooks) {
    const run = effectRegistry.get(hook.effect).create(enemy, hook.config ?? {}, ctx) as () => void;
    enemy.events.on(hook.on, (name: string) => {
      if (hook.ability === undefined || name === hook.ability) run();
    });
  }

  enemy.play_animation(def.initialAnimation);
  const events: AIEvents = {};
  for (const [event, names] of Object.entries(def.reactions)) {
    events[`on_${event}` as keyof AIEvents] = [...names];
  }
  enemy.ai.configure(events);
  return enemy;
}
