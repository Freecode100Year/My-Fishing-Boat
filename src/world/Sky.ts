import * as THREE from 'three';
import { WORLD } from '../config/balance';
import { makeGlowTexture } from '../utils/textures';
import { seededRandom } from '../utils/math';

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  varying vec3 vDirection;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 d = normalize(vDirection);
    float h = clamp(d.y, -0.15, 1.0);
    vec3 color = mix(uHorizon, uTop, pow(max(h, 0.0), 0.58));

    float sun = max(dot(d, normalize(uSunDirection)), 0.0);
    color += uSunColor * pow(sun, 340.0) * 2.4;
    color += uSunColor * pow(sun, 12.0) * 0.24;

    float horizonGlow = exp(-abs(d.y) * 10.0);
    color += vec3(0.12, 0.14, 0.13) * horizonGlow;

    vec2 cloudUv = d.xz / max(d.y + 0.3, 0.16);
    float n = noise(cloudUv * 2.0 + vec2(2.0, 0.0)) * 0.68;
    n += noise(cloudUv * 4.8 + vec2(-1.3, 2.2)) * 0.32;
    float cloud = smoothstep(0.48, 0.7, n) * smoothstep(0.015, 0.22, d.y) * 0.48;
    vec3 cloudColor = mix(vec3(0.79, 0.86, 0.88), uSunColor, 0.16 * sun);
    color = mix(color, cloudColor, cloud);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeCloudTexture(): THREE.Texture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rng = seededRandom(9931);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 28; i++) {
    const x = 35 + rng() * (w - 70);
    const y = 45 + rng() * 38;
    const rx = 20 + rng() * 45;
    const ry = 9 + rng() * 18;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rx);
    grad.addColorStop(0, `rgba(214,223,215,${0.16 + rng() * 0.13})`);
    grad.addColorStop(1, 'rgba(214,223,215,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export class Sky {
  readonly group = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly sunDirection = new THREE.Vector3(-0.35, 0.68, -0.65).normalize();
  private dome: THREE.Mesh;
  private clouds: THREE.Group;

  constructor(scene: THREE.Scene) {
    scene.fog = new THREE.FogExp2(WORLD.fogColor, WORLD.fogDensity);

    const geo = new THREE.SphereGeometry(1100, 40, 24);
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(WORLD.skyTop) },
        uHorizon: { value: new THREE.Color(WORLD.skyHorizon) },
        uSunColor: { value: new THREE.Color(WORLD.sunColor) },
        uSunDirection: { value: this.sunDirection },
      },
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.name = 'sky-dome';
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture('#ffe4b5'),
        color: 0xffd7a0,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    sunSprite.scale.setScalar(175);
    sunSprite.position.copy(this.sunDirection).multiplyScalar(870);
    this.group.add(sunSprite);

    this.clouds = new THREE.Group();
    const cloudTex = makeCloudTexture();
    const rng = seededRandom(343);
    for (let i = 0; i < 16; i++) {
      const mat2 = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.24 + rng() * 0.16,
        depthWrite: false,
        color: 0xb7c4c2,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat2);
      const angle = rng() * Math.PI * 2;
      const radius = 470 + rng() * 340;
      sprite.position.set(Math.cos(angle) * radius, 100 + rng() * 130, Math.sin(angle) * radius);
      sprite.scale.set(220 + rng() * 260, 46 + rng() * 68, 1);
      this.clouds.add(sprite);
    }
    this.group.add(this.clouds);

    scene.add(this.group);

    this.hemiLight = new THREE.HemisphereLight(0xc5e4f5, 0x34483f, 1.7);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffe1b7, 3.0);
    this.sunLight.position.set(-95, 170, -130);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 330;
    this.sunLight.shadow.camera.left = -95;
    this.sunLight.shadow.camera.right = 95;
    this.sunLight.shadow.camera.top = 95;
    this.sunLight.shadow.camera.bottom = -95;
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.normalBias = 0.035;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    const fill = new THREE.DirectionalLight(0x4b8395, 0.55);
    fill.position.set(70, 45, 90);
    scene.add(fill);
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    this.dome.position.set(focus.x, 0, focus.z);
    this.sunLight.position.set(focus.x - 95, 145, focus.z - 130);
    this.sunLight.target.position.set(focus.x, 0, focus.z);
    this.sunLight.target.updateMatrixWorld();
    this.clouds.rotation.y += dt * 0.0012;
    this.clouds.position.x = camera.position.x * 0.2;
    this.clouds.position.z = camera.position.z * 0.2;
  }
}
