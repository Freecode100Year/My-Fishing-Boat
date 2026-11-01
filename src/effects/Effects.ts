import * as THREE from 'three';
import { randRange } from '../utils/math';
import { makeGlowTexture, makeSoftCircleTexture } from '../utils/textures';

const MAX_PARTICLES = 1300;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

interface RingEffect {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
  maxRadius: number;
  opacity: number;
}

const particleVertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (340.0 / max(-mvPosition.z, 1.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

export class Effects {
  readonly group = new THREE.Group();
  private scene: THREE.Scene;

  private particles: Particle[] = [];
  private cursor = 0;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private points: THREE.Points;
  private pointGeo: THREE.BufferGeometry;

  private rings: RingEffect[] = [];
  private ringGeo: THREE.RingGeometry;
  private ringCursor = 0;

  private flash: THREE.Sprite;
  private flashAge = 0;
  private flashDuration = 0;

  private wakeAccumulator = 0;
  private smokeAccumulator = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'effects';
    scene.add(this.group);

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0,
        y: -1000,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        gravity: 0,
        drag: 0,
        r: 1,
        g: 1,
        b: 1,
        alpha: 0,
      });
      this.sizes[i] = 0;
      this.positions[i * 3 + 1] = -1000;
    }

    this.pointGeo = new THREE.BufferGeometry();
    this.pointGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.pointGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.pointGeo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.pointGeo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.pointGeo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.ringGeo = new THREE.RingGeometry(0.82, 1, 64);
    this.ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 18; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.ringGeo, material);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 0, duration: 1, maxRadius: 5, opacity: 0.6 });
    }

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture('#ffd7a0'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffb15a,
      }),
    );
    this.flash.scale.setScalar(1);
    this.flash.visible = false;
    this.group.add(this.flash);
  }

  private spawnParticle(): Particle {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return p;
  }

  burst(
    position: THREE.Vector3,
    color: THREE.ColorRepresentation,
    count: number,
    options: {
      speed?: number;
      size?: number;
      life?: number;
      gravity?: number;
      spread?: number;
      upward?: number;
      drag?: number;
      alpha?: number;
    } = {},
  ): void {
    const c = new THREE.Color(color);
    const speed = options.speed ?? 6;
    const size = options.size ?? 1.2;
    const life = options.life ?? 0.8;
    const gravity = options.gravity ?? -6;
    const spread = options.spread ?? 1;
    const upward = options.upward ?? 0.5;
    const drag = options.drag ?? 0.6;
    const alpha = options.alpha ?? 1;

    for (let i = 0; i < count; i++) {
      const p = this.spawnParticle();
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const mag = speed * (0.25 + Math.random() * 0.95);
      p.x = position.x + randRange(-spread, spread);
      p.y = position.y + randRange(-spread * 0.4, spread * 0.6);
      p.z = position.z + randRange(-spread, spread);
      p.vx = Math.cos(theta) * Math.sin(phi) * mag;
      p.vy = Math.cos(phi) * mag * 0.7 + upward * (0.5 + Math.random());
      p.vz = Math.sin(theta) * Math.sin(phi) * mag;
      p.maxLife = life * (0.55 + Math.random() * 0.9);
      p.life = p.maxLife;
      p.size = size * (0.5 + Math.random() * 0.8);
      p.gravity = gravity;
      p.drag = drag;
      p.r = c.r * (0.8 + Math.random() * 0.35);
      p.g = c.g * (0.8 + Math.random() * 0.35);
      p.b = c.b * (0.8 + Math.random() * 0.35);
      p.alpha = alpha;
    }
  }

  hitSparks(position: THREE.Vector3, color = 0xffb36b, crit = false): void {
    this.burst(position, color, crit ? 34 : 16, {
      speed: crit ? 9 : 6,
      size: crit ? 1.7 : 1.15,
      life: 0.48,
      gravity: -13,
      spread: 0.2,
      upward: 1.4,
      drag: 1.1,
    });
    if (crit) {
      this.burst(position, 0xfff3b0, 16, { speed: 3.5, size: 2.4, life: 0.32, gravity: 0, spread: 0.3 });
    }
  }

  splash(position: THREE.Vector3, strength = 1): void {
    this.burst(position, 0xbce7e3, Math.floor(14 + strength * 10), {
      speed: 4 + strength * 2.5,
      size: 1.1 + strength * 0.5,
      life: 0.7,
      gravity: -10,
      spread: 0.5 * strength,
      upward: 2.4,
      drag: 0.8,
      alpha: 0.85,
    });
    this.spawnRing(position, 0xc4eee8, 3.5 + strength * 2.2, 1.15, 0.5);
  }

  explosion(position: THREE.Vector3, color = 0xff7a31, scale = 1): void {
    this.burst(position, color, Math.floor(48 * scale), {
      speed: 9 * scale,
      size: 2 * scale,
      life: 1.0,
      gravity: -7,
      spread: 0.5,
      upward: 2.4,
      drag: 0.8,
    });
    this.burst(position, 0xffe7a9, Math.floor(24 * scale), {
      speed: 5.5 * scale,
      size: 1.4 * scale,
      life: 0.55,
      gravity: -3,
      spread: 0.25,
      upward: 1.5,
    });
    this.burst(position, 0x3d4644, Math.floor(30 * scale), {
      speed: 3.2 * scale,
      size: 3.6 * scale,
      life: 1.8,
      gravity: 0.8,
      spread: 1.2 * scale,
      upward: 1.2,
      drag: 0.4,
      alpha: 0.55,
    });
    this.spawnRing(position, 0xffa25d, 10 * scale, 1.6, 0.8);
    this.spawnFlash(position, 8 * scale, 0.22);
  }

  heatKill(position: THREE.Vector3): void {
    this.burst(position, 0xffb245, 44, {
      speed: 7.5,
      size: 2.2,
      life: 1.15,
      gravity: 1.2,
      spread: 0.8,
      upward: 3,
      drag: 0.5,
    });
    this.burst(position, 0xff4b18, 22, {
      speed: 4,
      size: 2.8,
      life: 1.5,
      gravity: 2,
      spread: 0.7,
      upward: 1.5,
      drag: 0.3,
    });
    this.spawnRing(position, 0xff8c34, 9, 1.2, 0.8);
  }

  spawnRing(position: THREE.Vector3, color: THREE.ColorRepresentation, maxRadius: number, duration: number, opacity: number): void {
    const ring = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    ring.age = 0;
    ring.duration = duration;
    ring.maxRadius = maxRadius;
    ring.opacity = opacity;
    ring.mesh.visible = true;
    ring.mesh.position.set(position.x, Math.max(position.y, 0.18), position.z);
    ring.mesh.scale.setScalar(0.01);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  spawnFlash(position: THREE.Vector3, scale: number, duration: number): void {
    this.flash.position.copy(position);
    this.flash.scale.setScalar(scale);
    this.flash.material.opacity = 1;
    this.flash.visible = true;
    this.flashAge = 0;
    this.flashDuration = duration;
  }

  emitWake(position: THREE.Vector3, forwardX: number, forwardZ: number, speedRatio: number, dt: number): void {
    if (speedRatio < 0.08) return;
    this.wakeAccumulator += dt * (10 + speedRatio * 36);
    while (this.wakeAccumulator >= 1) {
      this.wakeAccumulator -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = this.spawnParticle();
      p.x = position.x + randRange(-1.2, 1.2) + forwardZ * side * 0.9;
      p.y = 0.35 + Math.random() * 0.2;
      p.z = position.z + randRange(-0.7, 0.7) - forwardX * side * 0.9;
      p.vx = -forwardX * (1.4 + speedRatio * 2.2) + randRange(-0.5, 0.5);
      p.vy = 0.25 + Math.random() * 0.45;
      p.vz = -forwardZ * (1.4 + speedRatio * 2.2) + randRange(-0.5, 0.5);
      p.maxLife = 1.0 + Math.random() * 0.9;
      p.life = p.maxLife;
      p.size = 1.2 + speedRatio * 1.6;
      p.gravity = 0;
      p.drag = 1.1;
      p.r = 0.72;
      p.g = 0.87;
      p.b = 0.84;
      p.alpha = 0.5;
    }
  }

  emitSmoke(position: THREE.Vector3, dt: number, intensity = 1): void {
    this.smokeAccumulator += dt * intensity;
    while (this.smokeAccumulator > 0.34) {
      this.smokeAccumulator -= 0.34;
      this.burst(position, 0x6f7470, 1, {
        speed: 0.4,
        size: 2.6,
        life: 1.8,
        gravity: 0.5,
        spread: 0.12,
        upward: 1.2,
        drag: 0.3,
        alpha: 0.22,
      });
    }
  }

  update(dt: number): void {
    const posAttr = this.pointGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.pointGeo.attributes.color as THREE.BufferAttribute;
    const sizeAttr = this.pointGeo.attributes.size as THREE.BufferAttribute;
    const alphaAttr = this.pointGeo.attributes.alpha as THREE.BufferAttribute;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }
      p.vy += p.gravity * dt;
      const dragFactor = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      p.vz *= dragFactor;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const t = p.life / p.maxLife;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.colors[i * 3] = p.r;
      this.colors[i * 3 + 1] = p.g;
      this.colors[i * 3 + 2] = p.b;
      this.sizes[i] = p.size * (0.5 + t * 0.5);
      this.alphas[i] = p.alpha * Math.pow(t, 0.65);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;

    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.age += dt;
      const t = ring.age / ring.duration;
      if (t >= 1) {
        ring.mesh.visible = false;
        continue;
      }
      const scale = 0.01 + ring.maxRadius * (1 - Math.pow(1 - t, 2.4));
      ring.mesh.scale.set(scale, scale, scale);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = ring.opacity * Math.pow(1 - t, 1.6);
    }

    if (this.flash.visible) {
      this.flashAge += dt;
      const t = this.flashAge / this.flashDuration;
      if (t >= 1) this.flash.visible = false;
      else {
        this.flash.material.opacity = Math.pow(1 - t, 2);
        this.flash.material.rotation += dt;
      }
    }
  }
}
