import { Effect } from 'postprocessing'
import { Uniform } from 'three'

// Image de caméra de surveillance : objectif fish-eye, couleurs lavées tirant
// sur le vert, lignes et bande de balayage qui roule. Seul le rouge vif (le
// sang, les yeux) garde sa couleur. `amount` = 0 : image intacte (l'effet reste
// monté en permanence, sans recompilation au moment de la coupe).

const fragment = /* glsl */ `
uniform float amount;
uniform float time;

void mainUv(inout vec2 uv) {
  // Distorsion en barillet, recadrée pour que les coins restent pleins.
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  float k = 0.55 * amount;
  uv = 0.5 + c * (1.0 + k * r2) / (1.0 + k * 0.5);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 mono = vec3(luma) * vec3(0.8, 1.04, 0.84) + vec3(0.012, 0.02, 0.012);
  // Rouge franc (sang, yeux fâchés) : il traverse le gris.
  float red = smoothstep(0.015, 0.1, c.r - max(c.g, c.b) * 1.35);
  vec3 graded = mix(mono, c * vec3(1.2, 0.7, 0.7), red * 0.85);
  // Trame fine, et une bande plus claire qui remonte lentement l'image.
  float lines = 0.9 + 0.1 * sin(uv.y * 820.0);
  float band = smoothstep(0.08, 0.0, abs(fract(uv.y * 0.7 + time * 0.09) - 0.5));
  graded = graded * lines * (1.0 + band * 0.12) * 1.12;
  outputColor = vec4(mix(c, graded, amount), inputColor.a);
}
`

export class CctvEffect extends Effect {
  constructor() {
    super('CctvEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['amount', new Uniform(0)],
        ['time', new Uniform(0)],
      ]),
    })
  }
}

/** Règle l'effet (hors rendu React). */
export function driveCctv(effect: CctvEffect, amount: number, time: number): void {
  effect.uniforms.get('amount')!.value = amount
  effect.uniforms.get('time')!.value = time
}
