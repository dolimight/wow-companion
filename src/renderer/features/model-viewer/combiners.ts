import { Matrix3, Vector3, type MeshBasicMaterial, type MeshLambertMaterial, type Texture } from 'three'
import type { ModelLayer } from '../../../shared/model'

const coordCode = (coords: ModelLayer['coords'] | undefined) => coords === 'uv2' ? 1 : coords === 'env' ? 2 : 0

/**
 * The game's pixel combiners in GLSL. Each sets the colour (c), the alpha used for cut-outs and blending (a), and light
 * the layers add on top (add), from the layer samples t0, t1, and t2 and their weights w. Formulas follow wow.export's
 * M2 shader (MIT, Kruithne and Marlamin)
 */
const combinerGlsl = `
  vec3 c = t0.rgb; float a = 1.0; vec3 add = vec3(0.0);
  #if WOW_PS == 1 || WOW_PS == 33 || WOW_PS == 34
    a = t0.a;
  #elif WOW_PS == 2
    c = t0.rgb * t1.rgb; a = t1.a;
  #elif WOW_PS == 3
    c = t0.rgb * t1.rgb * 2.0; a = t1.a * 2.0;
  #elif WOW_PS == 4
    c = t0.rgb * t1.rgb * 2.0;
  #elif WOW_PS == 5
    c = t0.rgb * t1.rgb;
  #elif WOW_PS == 6 || WOW_PS == 36
    c = t0.rgb * t1.rgb; a = t0.a * t1.a;
  #elif WOW_PS == 7
    c = t0.rgb * t1.rgb * 2.0; a = t0.a * t1.a * 2.0;
  #elif WOW_PS == 8
    a = t0.a + t1.a; add = t1.rgb;
  #elif WOW_PS == 9
    c = t0.rgb * t1.rgb * 2.0; a = t0.a;
  #elif WOW_PS == 10
    a = t0.a; add = t1.rgb;
  #elif WOW_PS == 11
    c = t0.rgb * t1.rgb; a = t0.a;
  #elif WOW_PS == 12
    c = mix(t0.rgb * t1.rgb * 2.0, t0.rgb, t0.a);
  #elif WOW_PS == 13
    add = t1.rgb * t1.a;
  #elif WOW_PS == 14
    add = t1.rgb * t1.a * (1.0 - t0.a);
  #elif WOW_PS == 15
    c = mix(t0.rgb * t1.rgb * 2.0, t0.rgb, t0.a); add = t2.rgb * t2.a * w.b;
  #elif WOW_PS == 16
    a = t0.a; add = t1.rgb * t1.a;
  #elif WOW_PS == 17
    a = t0.a + t1.a * dot(t1.rgb, vec3(0.3, 0.59, 0.11)); add = t1.rgb * t1.a * (1.0 - t0.a);
  #elif WOW_PS == 18
    c = mix(mix(t0.rgb, t1.rgb, t1.a), t0.rgb, t0.a);
  #elif WOW_PS == 19
    c = mix(t0.rgb * t1.rgb * 2.0, t2.rgb, t2.a);
  #elif WOW_PS == 20
    add = t1.rgb * t1.a * w.g;
  #elif WOW_PS == 21
    a = t0.a + t1.a; add = t1.rgb * (1.0 - t0.a);
  #elif WOW_PS == 22
    c = mix(t0.rgb * t1.rgb, t0.rgb, t0.a);
  #elif WOW_PS == 23
    a = t0.a; add = t1.rgb * t1.a * w.g;
  #elif WOW_PS == 24
    c = mix(t0.rgb, t1.rgb, t1.a); add = t0.rgb * t0.a * w.r;
  #elif WOW_PS == 25
    float glow = clamp(t2.a * w.b, 0.0, 1.0);
    c = mix(t0.rgb * t1.rgb * 2.0, t0.rgb, t0.a) * (1.0 - glow); add = t2.rgb * glow;
  #elif WOW_PS == 26 || WOW_PS == 28
    vec4 mixed = mix(mix(t0, t1, clamp(w.g, 0.0, 1.0)), t2, clamp(w.b, 0.0, 1.0));
    c = mixed.rgb; a = mixed.a;
  #elif WOW_PS == 27
    c = mix(mix(t0.rgb * t1.rgb * 2.0, t2.rgb, t2.a), t0.rgb, t0.a);
  #elif WOW_PS == 29
    c = mix(t0.rgb, t1.rgb, t1.a);
  #elif WOW_PS == 30
    c = mix(t0.rgb * mix(vec3(1.0), t1.rgb, t1.a), t2.rgb, t2.a); a = t0.a;
  #elif WOW_PS == 31
    c = t0.rgb * mix(vec3(1.0), t1.rgb, t1.a); a = t0.a;
  #elif WOW_PS == 32
    c = mix(t0.rgb * mix(vec3(1.0), t1.rgb, t1.a), t2.rgb, t2.a);
  #elif WOW_PS == 35
    vec4 product = t0 * t1 * t2; c = product.rgb; a = product.a;
  #endif
`

/** What a draw's frame update changes: the extra layers' scroll matrices and every layer's weight */
export type CombinerUniforms = { wowT1: { value: Matrix3 }; wowT2: { value: Matrix3 }; wowWeights: { value: Vector3 } }

/**
 * Teaches a standard three.js material the game's multi-layer textures: the extra layers sample their own coordinates
 * (the first or second set, or a reflection of the view), and the combiner mixes them before lighting, with added light
 * going to the emissive term so it glows. `map` stays the first layer, so skinning, lighting, and fog are unchanged
 */
export function applyCombiner(material: MeshBasicMaterial | MeshLambertMaterial, combiner: number, layers: ModelLayer[], extra: Array<Texture | null>, blank: Texture): CombinerUniforms {
  const lit = material.type === 'MeshLambertMaterial'
  const uniforms = {
    wowMap1: { value: extra[0] ?? blank }, wowMap2: { value: extra[1] ?? blank },
    wowT1: { value: new Matrix3() }, wowT2: { value: new Matrix3() }, wowWeights: { value: new Vector3(1, 1, 1) },
  }
  const codes = [0, 1, 2].map(i => coordCode(layers[i]?.coords))
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.defines = { ...shader.defines, WOW_PS: combiner, WOW_C0: codes[0], WOW_C1: codes[1], WOW_C2: codes[2], ...(lit ? { WOW_LIT: 1 } : {}) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 wowUv2;
varying vec2 vWowUv0;
varying vec2 vWowUv1;
varying vec2 vWowEnv;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
  vWowUv0 = uv;
  vWowUv1 = wowUv2;
  #ifdef WOW_LIT
    vec3 wowNormal = normalize(transformedNormal);
  #else
    vec3 wowNormal = normalize(normalMatrix * normal);
  #endif
  // The game's sphere-mapped reflection coordinates
  vec3 wowReflect = reflect(normalize(mvPosition.xyz), wowNormal);
  float wowM = 2.0 * sqrt(wowReflect.x * wowReflect.x + wowReflect.y * wowReflect.y + (wowReflect.z + 1.0) * (wowReflect.z + 1.0));
  vWowEnv = wowReflect.xy / wowM + 0.5;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D wowMap1;
uniform sampler2D wowMap2;
uniform mat3 wowT1;
uniform mat3 wowT2;
uniform vec3 wowWeights;
varying vec2 vWowUv0;
varying vec2 vWowUv1;
varying vec2 vWowEnv;
vec3 wowAdd = vec3(0.0);
vec2 wowCoords(int code, mat3 scroll) {
  if (code == 2) return vWowEnv;
  return (scroll * vec3(code == 1 ? vWowUv1 : vWowUv0, 1.0)).xy;
}`)
      .replace('#include <map_fragment>', `
  vec4 t0 = vec4(1.0);
  #ifdef USE_MAP
    #if WOW_C0 == 2
      t0 = texture2D(map, vWowEnv);
    #else
      t0 = texture2D(map, vMapUv);
    #endif
  #endif
  vec4 t1 = texture2D(wowMap1, wowCoords(WOW_C1, wowT1));
  vec4 t2 = texture2D(wowMap2, wowCoords(WOW_C2, wowT2));
  vec3 w = wowWeights;
  ${combinerGlsl}
  diffuseColor.rgb *= c;
  diffuseColor.a *= clamp(a, 0.0, 1.0);
  #ifdef WOW_LIT
    wowAdd = add;
  #else
    diffuseColor.rgb += add;
  #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += wowAdd;`)
  }
  material.customProgramCacheKey = () => `wow-${combiner}-${codes.join('')}-${lit ? 1 : 0}`
  return uniforms
}
