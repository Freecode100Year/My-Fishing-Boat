import * as THREE from 'three';
import { ISLANDS, IslandSpec, WORLD } from '../config/balance';
import { seededRandom } from '../utils/math';

const foamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const foamFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
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
    float r = length(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.84, 0.94, r) * (1.0 - smoothstep(0.96, 1.0, r));
    float bands = noise(vec2(vUv.x * 36.0 + uTime * 0.12, vUv.y * 36.0 - uTime * 0.07));
    float pulse = 0.55 + 0.45 * sin(uTime * 1.15 + r * 15.0);
    float alpha = edge * smoothstep(0.38, 0.92, bands) * pulse * 0.62;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export interface IslandCollider {
  x: number;
  z: number;
  radius: number;
}

export class Islands {
  readonly group = new THREE.Group();
  readonly colliders: IslandCollider[] = [];
  readonly specs = ISLANDS;
  private foamMaterial: THREE.ShaderMaterial;
  private lighthouseBeacon?: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.foamMaterial = new THREE.ShaderMaterial({
      vertexShader: foamVertex,
      fragmentShader: foamFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xc7ece2) },
      },
    });

    ISLANDS.forEach((spec, index) => {
      this.buildIsland(spec, index);
      this.colliders.push({ x: spec.x, z: spec.z, radius: spec.radius * 0.66 });
    });

    scene.add(this.group);
  }

  private buildIsland(spec: IslandSpec, index: number): void {
    const rng = seededRandom(spec.seed);
    const island = new THREE.Group();
    island.position.set(spec.x, 0, spec.z);
    island.name = `island-${index}`;

    island.add(this.buildTerrain(spec, rng));
    island.add(this.buildPalms(spec, rng));
    island.add(this.buildRocks(spec, rng));
    island.add(this.buildFoamRing(spec));

    if (index === 2) island.add(this.buildLighthouse());
    if (index === 5) island.add(this.buildWreck());

    this.group.add(island);
  }

  private buildTerrain(spec: IslandSpec, rng: () => number): THREE.Mesh {
    const rings = 14;
    const segments = 52;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const colorSand = new THREE.Color(0xb2a377);
    const colorWet = new THREE.Color(0x586a5b);
    const colorGrass = new THREE.Color(0x3f5b42);
    const colorRock = new THREE.Color(0x5c6158);

    const getRadius = (t: number, angle: number): number => {
      const wobble =
        1 +
        Math.sin(angle * 3 + spec.seed) * 0.105 +
        Math.sin(angle * 5 - spec.seed * 0.7) * 0.065 +
        Math.sin(angle * 9 + spec.seed * 1.7) * 0.035;
      return spec.radius * t * wobble;
    };

    const getY = (t: number, angle: number): number => {
      const ridge = Math.sin(angle * 4 + spec.seed) * 0.08 + Math.sin(angle * 7.3) * 0.04;
      const bump = (rng() - 0.5) * 0.3;
      return spec.height * Math.pow(1 - t, 1.55) - 1.45 * t + ridge * spec.height * (1 - t) + bump * (1 - t);
    };

    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const radius = getRadius(t, angle);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = getY(t, angle);
        positions.push(x, y, z);

        const foam = 1 - Math.min(Math.abs(y) * 0.35, 1);
        const c = new THREE.Color();
        if (y < 0.45) c.lerpColors(colorWet, colorSand, Math.max(0, y + 0.4));
        else if (y < 0.9 + foam * 0.25) c.lerpColors(colorSand, colorGrass, (y - 0.45) / 0.7);
        else c.lerpColors(colorGrass, colorRock, Math.min(1, (y - 1.4) / (spec.height * 0.7)));
        c.offsetHSL(0, 0, (rng() - 0.5) * 0.045);
        colors.push(c.r, c.g, c.b);
      }
    }

    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = r * segments + s;
        const b = r * segments + ((s + 1) % segments);
        const c = (r + 1) * segments + s;
        const d = (r + 1) * segments + ((s + 1) % segments);
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  private buildPalms(spec: IslandSpec, rng: () => number): THREE.Group {
    const group = new THREE.Group();
    if (spec.palms <= 0) return group;

    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.2, 1, 5, 1);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6f563b, roughness: 0.96 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spec.palms);
    trunks.castShadow = true;

    const leafGeo = new THREE.PlaneGeometry(0.56, 2.7, 1, 4);
    const leafPos = leafGeo.attributes.position;
    for (let i = 0; i < leafPos.count; i++) {
      const y = leafPos.getY(i);
      leafPos.setZ(i, Math.pow((y + 1.35) / 2.7, 2) * -0.55);
    }
    leafGeo.computeVertexNormals();
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x3d6a4a,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const leavesPerPalm = 7;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spec.palms * leavesPerPalm);
    leaves.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let leafIndex = 0;

    for (let i = 0; i < spec.palms; i++) {
      const angle = rng() * Math.PI * 2;
      const t = 0.14 + rng() * 0.5;
      const wobble = 1 + Math.sin(angle * 3 + spec.seed) * 0.09;
      const radius = spec.radius * t * wobble;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const groundY = spec.height * Math.pow(1 - t, 1.55) - 1.45 * t + Math.sin(angle * 4 + spec.seed) * 0.08 * spec.height * (1 - t);
      const height = 3.2 + rng() * 3.8;
      const tilt = (rng() - 0.5) * 0.25;

      dummy.position.set(x, groundY, z);
      dummy.rotation.set(tilt, rng() * Math.PI, tilt * 0.6);
      dummy.scale.set(0.9 + rng() * 0.3, height, 0.9 + rng() * 0.3);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      trunks.setColorAt(i, color.setHSL(0.09, 0.25, 0.25 + rng() * 0.09));

      const crownX = x + Math.sin(tilt) * height * 0.5;
      const crownY = groundY + height;
      const crownZ = z + Math.cos(tilt) * height * 0.2;
      for (let j = 0; j < leavesPerPalm; j++) {
        const a = (j / leavesPerPalm) * Math.PI * 2 + rng() * 0.2;
        dummy.position.set(crownX, crownY, crownZ);
        dummy.rotation.set(-0.2 + rng() * 0.35, a, 0.35 + rng() * 0.4);
        dummy.scale.set(0.8 + rng() * 0.3, 0.8 + rng() * 0.35, 0.8 + rng() * 0.3);
        dummy.updateMatrix();
        leaves.setMatrixAt(leafIndex, dummy.matrix);
        leaves.setColorAt(leafIndex, color.setHSL(0.29 + rng() * 0.04, 0.25 + rng() * 0.1, 0.23 + rng() * 0.1));
        leafIndex++;
      }
    }

    group.add(trunks, leaves);
    return group;
  }

  private buildRocks(spec: IslandSpec, rng: () => number): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(0.7, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5f645b, roughness: 0.92, flatShading: true });
    const rocks = new THREE.InstancedMesh(geo, mat, spec.rocks);
    rocks.castShadow = true;
    rocks.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < spec.rocks; i++) {
      const angle = rng() * Math.PI * 2;
      const t = 0.66 + rng() * 0.4;
      const wobble = 1 + Math.sin(angle * 3 + spec.seed) * 0.105;
      const radius = spec.radius * t * wobble;
      const y = -0.5 + rng() * 1.5;
      dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      dummy.scale.set(0.5 + rng() * 2.6, 0.35 + rng() * 1.7, 0.5 + rng() * 2.2);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
      rocks.setColorAt(i, color.setHSL(0.15, 0.05, 0.27 + rng() * 0.13));
    }

    group.add(rocks);
    return group;
  }

  private buildFoamRing(spec: IslandSpec): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(spec.radius * 2.65, spec.radius * 2.65);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, this.foamMaterial);
    mesh.position.y = 0.22;
    mesh.renderOrder = 2;
    return mesh;
  }

  private buildLighthouse(): THREE.Group {
    const group = new THREE.Group();
    const baseY = 15.1;
    group.position.set(2.2, baseY, 1.4);

    const matWhite = new THREE.MeshStandardMaterial({ color: 0xd8d2bc, roughness: 0.8 });
    const matRed = new THREE.MeshStandardMaterial({ color: 0x9d3f31, roughness: 0.8 });
    const tower = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.CylinderGeometry(1.45 - i * 0.16, 1.6 - i * 0.16, 2.25, 12);
      const mesh = new THREE.Mesh(geo, i % 2 === 0 ? matWhite : matRed);
      mesh.position.y = 1.1 + i * 2.25;
      mesh.castShadow = true;
      tower.add(mesh);
    }
    const lampRoom = new THREE.Mesh(
      new THREE.CylinderGeometry(1.03, 1.03, 1.55, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c3c3d, metalness: 0.55, roughness: 0.35 }),
    );
    lampRoom.position.y = 12.1;
    tower.add(lampRoom);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd891, emissive: 0xff9d35, emissiveIntensity: 2.4 }),
    );
    lamp.position.y = 12.1;
    tower.add(lamp);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 1.15, 10),
      new THREE.MeshStandardMaterial({ color: 0x5e3027, roughness: 0.8 }),
    );
    roof.position.y = 13.35;
    tower.add(roof);

    this.lighthouseBeacon = new THREE.PointLight(0xffb455, 52, 85, 2);
    this.lighthouseBeacon.position.y = 12.1;
    tower.add(this.lighthouseBeacon);

    group.add(tower);
    return group;
  }

  private buildWreck(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(-4, 7.5, 3);
    group.rotation.set(0.15, 0.75, -0.35);
    const wood = new THREE.MeshStandardMaterial({ color: 0x493d30, roughness: 0.92 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 6.5), wood);
    const broken = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 2.7), wood);
    broken.position.set(1.15, 0.2, -2.4);
    broken.rotation.z = -0.32;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x5f503c, roughness: 0.9 }),
    );
    mast.position.set(0, 2.4, 0.4);
    mast.rotation.z = 0.15;
    group.add(hull, broken, mast);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  update(dt: number, time: number): void {
    this.foamMaterial.uniforms.uTime.value = time;
    if (this.lighthouseBeacon) {
      this.lighthouseBeacon.intensity = 45 + Math.sin(time * 2.4) * 15;
    }
    this.group.updateMatrixWorld();
  }

  isInsideIsland(x: number, z: number, padding = 0): boolean {
    for (const c of this.colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.radius + padding) ** 2) return true;
    }
    return false;
  }

  outsideSpawn(x: number, z: number): boolean {
    for (const c of this.colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.radius + WORLD.islandSafeZone) ** 2) return false;
    }
    return true;
  }
}
