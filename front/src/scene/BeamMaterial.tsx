import { useMemo } from 'react'
import { AdditiveBlending, Color, DoubleSide } from 'three'

// Faisceau dans le brouillard ou la poussière : un cône dont les bords
// s'effacent, et qui disparaît quand on s'en approche. Jamais d'arête nette à l'image.

const beamVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -view.xyz;
    vAlong = uv.y;
    gl_Position = projectionMatrix * view;
  }
`

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uNear;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float near = smoothstep(uNear, uNear * 6.0, length(vView));
    gl_FragColor = vec4(uColor, uOpacity * facing * facing * facing * near * vAlong * vAlong);
  }
`

export function BeamMaterial({ color, opacity, near = 1 }: { color: string; opacity: number; near?: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new Color(color) }, uOpacity: { value: opacity }, uNear: { value: near } }), [color, opacity, near])
  return (
    <shaderMaterial
      vertexShader={beamVertex}
      fragmentShader={beamFragment}
      uniforms={uniforms}
      transparent
      depthWrite={false}
      side={DoubleSide}
      blending={AdditiveBlending}
    />
  )
}
