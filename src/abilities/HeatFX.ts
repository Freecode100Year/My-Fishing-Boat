import * as THREE from 'three';

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float n = noise(vUv * 14.0 + vec2(uTime * 0.38, -uTime * 0.22));
    float bands = smoothstep(0.48, 0.86, n) * 0.75;
    float front = smoothstep(0.0, 0.13, 1.0 - abs(r - 0.74 - sin(uTime * 1.2) * 0.04));
    float inner = smoothstep(0.98, 0.72, r) * smoothstep(0.2, 0.55, r);
    float alpha = front * (0.5 + bands) * 0.75 + inner * bands * 0.16;
    alpha *= smoothstep(1.0, 0.9, r);
    alpha *= 0.8 + sin(uTime * 7.0) * 0.2;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const pillarVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const pillarFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    float h = vUv.y;
    float alpha = pow(1.0 - h, 2.2) * 0.16;
    float bands = 0.55 + 0.45 * sin(vUv.y * 90.0 - uTime * 6.0);
    float streak = smoothstep(0.74, 0.98, sin(vUv.x * 44.0 + sin(vUv.y * 8.0 + uTime * 2.0) * 2.0) * 0.5 + 0.5);
    alpha *= 0.6 + bands * 0.4 + streak * 0.5;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const particleVertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.04, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

interface Ember {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  rise: number;
  size: number;
  life: number;
}

export class HeatFX {
  readonly group = new THREE.Group();
  active = false;
  private ring: THREE.Mesh;
  private secondaryRing: THREE.Mesh;
  private pillar: THREE.Mesh;
  private light: THREE.PointLight;
  private points: THREE.Points;
  private pointGeo: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private embers: Ember[] = [];
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.group.visible = false;
    scene.add(this.group);

    const ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uColor: { value: new THREE.Color(0xff8a2d) },
      },
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.ring);

    const ringMat2 = ringMat.clone();
    ringMat2.uniforms.uColor = { value: new THREE.Color(0xffd36c) };
    this.secondaryRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat2);
    this.secondaryRing.rotation.x = -Math.PI / 2;
    this.secondaryRing.position.y = 0.06;
    this.group.add(this.secondaryRing);

    const pillarMat = new THREE.ShaderMaterial({
      vertexShader: pillarVertex,
      fragmentShader: pillarFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffa53b) },
      },
    });
    const pillarGeo = new THREE.CylinderGeometry(1, 1.06, 1, 48, 1, true);
    pillarGeo.translate(0, 0.5, 0);
    this.pillar = new THREE.Mesh(pillarGeo, pillarMat);
    this.group.add(this.pillar);

    this.light = new THREE.PointLight(0xff8a2a, 0, 42, 2);
    this.light.position.y = 3.5;
    this.group.add(this.light);

    const count = 190;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.embers.push({
        angle: Math.random() * Math.PI * 2,
        radius: 3 + Math.random() * 24,
        height: Math.random() * 14,
        speed: 0.2 + Math.random() * 1.2,
        rise: 1.2 + Math.random() * 3.8,
        size: 0.8 + Math.random() * 2.2,
        life: Math.random(),
      });
      this.colors[i * 3] = 1;
      this.colors[i * 3 + 1] = 0.45 + Math.random() * 0.4;
      this.colors[i * 3 + 2] = 0.08 + Math.random() * 0.14;
      this.sizes[i] = this.embers[i].size;
    }

    this.pointGeo = new THREE.BufferGeometry();
    this.pointGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.pointGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.pointGeo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.pointGeo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.points = new THREE.Points(
      this.pointGeo,
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  activate(): void {
    this.active = true;
    this.elapsed = 0;
    this.group.visible = true;
    this.light.intensity = 85;
  }

  deactivate(): void {
    this.active = false;
    this.group.visible = false;
    this.light.intensity = 0;
  }

  update(dt: number, center: THREE.Vector3, radius: number, durationRatio: number, waveHeight: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    const t = this.elapsed;
    this.group.position.set(center.x, waveHeight + 0.32, center.z);

    const pulse = 1 + Math.sin(t * 4.2) * 0.025;
    this.ring.scale.setScalar(radius * 2.45 * pulse);
    this.ring.position.y = 0.01;
    (this.ring.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.ring.material as THREE.ShaderMaterial).uniforms.uProgress.value = durationRatio;

    this.secondaryRing.scale.setScalar(radius * 1.55 * (1 + Math.sin(t * 3.1 + 1.7) * 0.05));
    (this.secondaryRing.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 1.25;

    this.pillar.scale.set(radius * 0.9, 19, radius * 0.9);
    (this.pillar.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    this.light.intensity = 55 + Math.sin(t * 9) * 22;

    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i];
      e.life -= dt * (0.22 + e.speed * 0.08);
      if (e.life <= 0) {
        e.life = 1;
        e.angle = Math.random() * Math.PI * 2;
        e.radius = 2 + Math.random() * 24;
        e.height = 0;
      }
      e.height += e.rise * dt;
      e.angle += e.speed * dt;
      const r = e.radius * (0.35 + (1 - e.height / 18) * 0.65);
      this.positions[i * 3] = Math.cos(e.angle) * r;
      this.positions[i * 3 + 1] = e.height;
      this.positions[i * 3 + 2] = Math.sin(e.angle) * r;
      this.alphas[i] = Math.max(0, e.life) * Math.min(1, e.height * 0.6) * 0.8;
    }
    this.pointGeo.attributes.position.needsUpdate = true;
    this.pointGeo.attributes.alpha.needsUpdate = true;

    const last = durationRatio < 0.22 ? durationRatio / 0.22 : 1;
    this.light.intensity *= last;
    this.points.scale.setScalar(0.85 + (1 - last) * 0.1);
  }
}
