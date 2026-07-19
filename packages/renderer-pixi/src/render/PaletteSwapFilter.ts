import { defaultFilterVert, Filter, GlProgram, UniformGroup } from "pixi.js";
import { WEAPON_PALETTE, type Palette6, type WeaponId } from "@mmx/engine/core/constants.js";

/**
 * Recolors X's body sprite per equipped weapon — port of Player.gd's
 * `change_palette` / `set_new_colors_on_shader_parameters`, which writes a
 * weapon's 6 colors into the body material's `R_MainColor1-6` uniforms
 * (charge_shader.tres does the actual per-pixel find-and-replace).
 *
 * The source colors those 6 slots replace *from* are fixed — Player_Material_
 * Shader.tres bakes in the same blue as the buster's own palette (equipping
 * the buster is an identity recolor; see WEAPON_PALETTE.buster) — so they are
 * compiled into the shader as constants rather than passed as uniforms; only
 * the 6 target colors change, on `sync()`, which the renderer calls whenever
 * the active weapon changes.
 *
 * Not ported: the armor-piece tint (only 2 of 6 colors, and this engine has no
 * armor system yet) and the indexed, animated PaletteSwap.gdshader the HUD
 * ammo bar and the Weapon Get cutscene use instead — different mechanism,
 * unrelated to X's own body recolor.
 */
export class PaletteSwapFilter extends Filter {
  private readonly targetUniforms: UniformGroup<{
    uTarget1: { value: [number, number, number]; type: "vec3<f32>" };
    uTarget2: { value: [number, number, number]; type: "vec3<f32>" };
    uTarget3: { value: [number, number, number]; type: "vec3<f32>" };
    uTarget4: { value: [number, number, number]; type: "vec3<f32>" };
    uTarget5: { value: [number, number, number]; type: "vec3<f32>" };
    uTarget6: { value: [number, number, number]; type: "vec3<f32>" };
  }>;

  private lastWeapon: WeaponId | null = null;

  constructor() {
    const [t1, t2, t3, t4, t5, t6] = WEAPON_PALETTE.buster.map(hexToVec3) as [number, number, number][];
    const targetUniforms = new UniformGroup({
      uTarget1: { value: t1, type: "vec3<f32>" },
      uTarget2: { value: t2, type: "vec3<f32>" },
      uTarget3: { value: t3, type: "vec3<f32>" },
      uTarget4: { value: t4, type: "vec3<f32>" },
      uTarget5: { value: t5, type: "vec3<f32>" },
      uTarget6: { value: t6, type: "vec3<f32>" },
    });

    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment: buildFragmentSource(WEAPON_PALETTE.buster),
        name: "palette-swap-filter",
      }),
      resources: { targetUniforms },
    });

    this.targetUniforms = targetUniforms;
  }

  /** Re-target the 6 replacement colors; a no-op once already showing `weapon`. */
  sync(weapon: WeaponId): void {
    if (weapon === this.lastWeapon) return;
    this.lastWeapon = weapon;

    const palette = WEAPON_PALETTE[weapon];
    const uniforms = this.targetUniforms.uniforms;
    uniforms.uTarget1 = hexToVec3(palette[0]);
    uniforms.uTarget2 = hexToVec3(palette[1]);
    uniforms.uTarget3 = hexToVec3(palette[2]);
    uniforms.uTarget4 = hexToVec3(palette[3]);
    uniforms.uTarget5 = hexToVec3(palette[4]);
    uniforms.uTarget6 = hexToVec3(palette[5]);
  }
}

function hexToVec3(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

/**
 * charge_shader.tres's `replace()` helper, ported as a fixed six-way
 * if/else-if chain (GLSL has no early-exit-from-loop-then-continue idiom as
 * clean as just writing the six tests out). `SRC1-6` are compiled in as
 * constants — see the class doc comment for why they never vary.
 */
function buildFragmentSource(source: Palette6): string {
  const [s1, s2, s3, s4, s5, s6] = source.map(hexToVec3);
  const glVec3 = ([r, g, b]: readonly [number, number, number]) =>
    `vec3(${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)})`;

  return `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uTarget1;
uniform vec3 uTarget2;
uniform vec3 uTarget3;
uniform vec3 uTarget4;
uniform vec3 uTarget5;
uniform vec3 uTarget6;

// Max-channel-difference match, same test as charge_shader.tres's replace().
// Tuned slightly looser than the source's 0.01 to absorb 8-bit rounding.
const float TOLERANCE = 0.02;

const vec3 SRC1 = ${glVec3(s1)};
const vec3 SRC2 = ${glVec3(s2)};
const vec3 SRC3 = ${glVec3(s3)};
const vec3 SRC4 = ${glVec3(s4)};
const vec3 SRC5 = ${glVec3(s5)};
const vec3 SRC6 = ${glVec3(s6)};

bool matches(vec3 color, vec3 src) {
  vec3 d = abs(color - src);
  return max(max(d.r, d.g), d.b) <= TOLERANCE;
}

void main(void) {
  vec4 texColor = texture(uTexture, vTextureCoord);
  vec3 rgb = texColor.rgb;

  if (matches(rgb, SRC1)) rgb = uTarget1;
  else if (matches(rgb, SRC2)) rgb = uTarget2;
  else if (matches(rgb, SRC3)) rgb = uTarget3;
  else if (matches(rgb, SRC4)) rgb = uTarget4;
  else if (matches(rgb, SRC5)) rgb = uTarget5;
  else if (matches(rgb, SRC6)) rgb = uTarget6;

  finalColor = vec4(rgb, texColor.a);
}
`;
}
