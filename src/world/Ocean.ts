import * as THREE from 'three';
import { WORLD, OCEAN } from '../config/balance';

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec3 vNormalW;
  varying float vHeight;
  varying vec2 vWaveUv;

  float waveHeight(vec2 p) {
    float h = 0.0;
    h += sin(p.x * ${OCEAN.waveA.freqX.toFixed(5)} + p.y * ${OCEAN.waveA.freqZ.toFixed(5)} + uTime * ${OCEAN.waveA.speed.toFixed(4)}) * ${OCEAN.waveA.amp.toFixed(3)};
    h += sin(p.x * ${OCEAN.waveB.freqX.toFixed(5)} + p.y * ${OCEAN.waveB.freqZ.toFixed(5)} + uTime * ${OCEAN.waveB.speed.toFixed(4)}) * ${OCEAN.waveB.amp.toFixed(3)};
    h += sin(p.x * ${OCEAN.waveC.freqX.toFixed(5)} + p.y * ${OCEAN.waveC.freqZ.toFixed(5)} + uTime * ${OCEAN.waveC.speed.toFixed(4)}) * ${OCEAN.waveC.amp.toFixed(3)};
    h += sin(p.x * ${OCEAN.waveD.freqX.toFixed(5)} + p.y * ${OCEAN.waveD.freqZ.toFixed(5)} + uTime * ${OCEAN.waveD.speed.toFixed(4)}) * ${OCEAN.waveD.amp.toFixed(3)};
    return h;
  }

  void main() {
    vec3 pos = position;
    float h = waveHeight(pos.xz);
    pos.y += h;

    float eps = 1.4;
    float hx = waveHeight(pos.xz + vec2(eps, 0.0)) - waveHeight(pos.xz - vec2(eps, 0.0));
    float hz = waveHeight(pos.xz + vec2(0.0, eps)) - waveHeight(pos.xz - vec2(0.0, eps));
    vec3 n = normalize(vec3(-hx / (2.0 * eps), 1.0, -hz / (2.0 * eps)));

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vHeight = h;
    vWaveUv = pos.xz;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCameraPosition;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorldPosition;
  varying vec3 vNormalW;
  varying float vHeight;
  varying vec2 vWaveUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCameraPosition - vWorldPosition);
    vec3 L = normalize(uSunDirection);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 220.0);
    float glint = pow(max(dot(reflect(-L, N), V), 0.0), 24.0) * 0.12;

    float variation = noise(vWaveUv * 0.045 + uTime * 0.02) * 0.6
                    + noise(vWaveUv * 0.18 - uTime * 0.05) * 0.4;

    vec3 water = mix(uDeep, uShallow, 0.28 + variation * 0.28 + N.y * 0.2);
    water += uShallow * max(vHeight, 0.0) * 0.035;

    float crest = smoothstep(0.62, 1.32, vHeight + variation * 0.34);
    float streak = smoothstep(0.62, 0.92, noise(vWaveUv * vec2(0.34, 0.055) + vec2(uTime * 0.08, 0.0)));
    float foam = crest * streak * 0.55;
    foam += smoothstep(0.98, 1.28, vHeight) * 0.15;

    vec3 color = water + fresnel * vec3(0.13, 0.29, 0.31);
    color += uSunColor * (spec * 2.4 + glint);
    color = mix(color, uFoam, clamp(foam, 0.0, 0.62));

    float dist = length(uCameraPosition - vWorldPosition);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    fog = clamp(fog, 0.0, 1.0);
    color = mix(color, uFogColor, fog);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(WORLD.oceanSize, WORLD.oceanSize, WORLD.oceanSegments, WORLD.oceanSegments);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uCameraPosition: { value: new THREE.Vector3() },
        uSunDirection: { value: new THREE.Vector3(0.35, 0.8, -0.45).normalize() },
        uSunColor: { value: new THREE.Color(WORLD.sunColor) },
        uDeep: { value: new THREE.Color(OCEAN.waterDeep) },
        uShallow: { value: new THREE.Color(OCEAN.waterShallow) },
        uFoam: { value: new THREE.Color(OCEAN.waterFoam) },
        uFogColor: { value: new THREE.Color(WORLD.fogColor) },
        uFogDensity: { value: WORLD.fogDensity },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = false;
    this.mesh.name = 'ocean';
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.elapsed += dt;
    this.material.uniforms.uTime.value = this.elapsed;
    this.material.uniforms.uCameraPosition.value.copy(camera.position);
  }

  /** Matches the GLSL wave function exactly. */
  getHeight(x: number, z: number, time = this.elapsed): number {
    return (
      Math.sin(x * OCEAN.waveA.freqX + z * OCEAN.waveA.freqZ + time * OCEAN.waveA.speed) * OCEAN.waveA.amp +
      Math.sin(x * OCEAN.waveB.freqX + z * OCEAN.waveB.freqZ + time * OCEAN.waveB.speed) * OCEAN.waveB.amp +
      Math.sin(x * OCEAN.waveC.freqX + z * OCEAN.waveC.freqZ + time * OCEAN.waveC.speed) * OCEAN.waveC.amp +
      Math.sin(x * OCEAN.waveD.freqX + z * OCEAN.waveD.freqZ + time * OCEAN.waveD.speed) * OCEAN.waveD.amp
    );
  }

  get time(): number {
    return this.elapsed;
  }
}
