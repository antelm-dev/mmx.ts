import { AbilityUser } from './AbilityUser.js';
import { World } from './World.js';
import { Projectile } from './Projectile.js';
import { Input, Action } from '../core/Input.js';

/**
 * Input + high-level player API — port of Character.gd (and the input-facing parts
 * of Player.gd). Owns the Input object and exposes the accessors the abilities call.
 */
export class Character extends AbilityUser {
  input: Input;
  listening_to_inputs = true;

  // Player.gd movement flags
  last_time_dashed = 0;
  dashfall = false;
  dashjumps_since_jump = 0;
  block_charging = false;

  projectiles: Projectile[] = [];

  constructor(world: World, x: number, y: number, input: Input) {
    super(world, x, y);
    this.input = input;
    this.events.on('land', () => this.on_land());
  }

  /** Spawn a buster shot from the front of the body (Shot/Charge -> weapon.fire). */
  spawnBuster(charge: number): void {
    const dir = this.get_facing_direction();
    const x = this.pos.x + dir * (this.hw + 2);
    const y = this.pos.y - 2;
    this.projectiles.push(new Projectile(x, y, dir, charge));
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) p.update(dt, this.world);
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // --- input gating (Character.get_action_*) ---
  get_action_pressed(a: Action): boolean {
    return this.listening_to_inputs && this.input.isPressed(a);
  }
  get_action_just_pressed(a: Action): boolean {
    return this.listening_to_inputs && this.input.justPressed(a);
  }
  get_action_just_released(a: Action): boolean {
    return this.listening_to_inputs && this.input.justReleased(a);
  }
  get_pressed_axis(): number {
    if (!this.listening_to_inputs) return 0;
    return this.input.axis();
  }
  has_just_pressed_left(): boolean {
    return this.get_action_just_pressed('move_left');
  }
  has_just_pressed_right(): boolean {
    return this.get_action_just_pressed('move_right');
  }

  // --- Player.gd helpers used by abilities ---
  on_land(): void {
    this.dashjumps_since_jump = 0;
    this.dashfall = false;
  }
  start_dashfall(): void {
    if (!this.is_on_floor()) this.dashfall = true;
  }
  dashjump_signal(): void {
    this.events.emit('dashjump');
    this.dashjumps_since_jump += 1;
  }
  airdash_signal(): void {
    this.events.emit('airdash');
  }

  // low walljump raycast toggles — cosmetic no-ops in this port
  activate_low_walljump_raycasts(): void {}
  deactivate_low_walljump_raycasts(): void {}
  are_low_walljump_raycasts_active(): boolean {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Main physics tick — mirrors the intended Godot frame order:
  //   abilities set velocity -> integrate/collide -> post checks -> advance input edges
  // ---------------------------------------------------------------------------
  tick(dt: number): void {
    if (this.invulnerability > 0) this.invulnerability -= dt;
    this.clockMs += dt * 1000;

    // Character.check_for_dash — publish a dash press for DashJump timing.
    if (this.get_action_just_pressed('dash')) {
      this.last_time_dashed = this.clockMs;
      this.events.emit('input_dash');
    }

    this.stepAbilities(dt);
    this.physicsStep(dt);
    this.updateProjectiles(dt);
    // Sprite last: abilities have set the clip for this frame, and any
    // `animation_finished` handoff (walk_start -> walk, recover -> idle) lands on
    // an already-settled state.
    this.stepAnimation(dt);
    this.input.newFrame();
  }
}
