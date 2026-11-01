import * as THREE from 'three';
import { EnemyType } from '../config/balance';

export interface EnemyVisual {
  group: THREE.Group;
  tail?: THREE.Group;
  jaw?: THREE.Object3D;
  tentacles: THREE.Group[];
  glowParts: THREE.Mesh[];
  coreGlow?: THREE.Sprite;
}

function metalMat(color: number, metalness = 0.72, roughness = 0.45): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
}

function glowMat(color: number, intensity = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.1,
  });
}

function makeFin(points: [number, number][], thickness = 0.06, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function addGlowSprite(parent: THREE.Object3D, position: THREE.Vector3, color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff5d6');
  g.addColorStop(0.2, `#${color.toString(16).padStart(6, '0')}`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    }),
  );
  sprite.position.copy(position);
  sprite.scale.setScalar(size);
  parent.add(sprite);
  return sprite;
}

function createCorrodedFish(): EnemyVisual {
  const group = new THREE.Group();
  const rust = metalMat(0x5e6d63, 0.7, 0.68);
  const dark = metalMat(0x303d3b, 0.85, 0.36);
  const copper = metalMat(0x9a5b36, 0.65, 0.5);
  const glow = glowMat(0xff6a2a, 2.6);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.56, 1.65, 5, 10), rust);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.54, 1.2, 9), copper);
  head.rotation.x = Math.PI / 2;
  head.position.z = 1.28;
  head.castShadow = true;
  group.add(head);

  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 5, 12), dark);
  ring1.position.z = 0.35;
  group.add(ring1);
  const ring2 = ring1.clone();
  ring2.position.z = -0.45;
  group.add(ring2);
  const ring3 = ring1.clone();
  ring3.position.z = -1;
  ring3.scale.setScalar(0.9);
  group.add(ring3);

  // Side fins.
  for (const side of [-1, 1]) {
    const fin = makeFin(
      [
        [0, 0],
        [0.9, 0.28],
        [0.75, -0.1],
        [0, -0.2],
      ],
      0.05,
      dark,
    );
    fin.position.set(side * 0.45, -0.1, 0.35);
    fin.rotation.set(0.1, side > 0 ? 0 : Math.PI, side * 0.2);
    group.add(fin);
  }

  // Top fin.
  const dorsal = makeFin(
    [
      [0, 0],
      [0.15, 0.65],
      [0.55, 0.08],
    ],
    0.04,
    dark,
  );
  dorsal.position.set(0, 0.45, 0.1);
  dorsal.rotation.y = Math.PI;
  group.add(dorsal);

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, 0, -1.75);
  const tailFin = makeFin(
    [
      [0, 0],
      [0.05, 0.9],
      [0.85, 0.65],
      [0.15, 0.12],
      [0.8, -0.6],
      [0.03, -0.85],
    ],
    0.055,
    copper,
  );
  tailFin.rotation.y = -Math.PI / 2;
  tail.add(tailFin);
  group.add(tail);

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.26, 1.55);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.5), dark);
  jaw.add(mouth);
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 4), glowMat(0xd8d5b6, 0.2));
    tooth.position.set(-0.2 + i * 0.13, 0.11, 0.18);
    tooth.rotation.x = Math.PI;
    jaw.add(tooth);
  }
  group.add(jaw);

  const eyeGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const glowParts: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, glow);
    eye.position.set(side * 0.29, 0.18, 0.98);
    group.add(eye);
    glowParts.push(eye);
  }
  addGlowSprite(group, new THREE.Vector3(0, 0.18, 1.03), 0xff5d1f, 1.5);

  // Exposed pipes.
  const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5);
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(pipeGeo, copper);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(-0.24 + i * 0.24, 0.44, -0.1);
    group.add(pipe);
  }

  group.scale.setScalar(1.2);
  return { group, tail, jaw, tentacles: [], glowParts };
}

function createArmoredShark(): EnemyVisual {
  const group = new THREE.Group();
  const hide = metalMat(0x424f4e, 0.38, 0.72);
  const armor = metalMat(0x626a62, 0.85, 0.4);
  const rust = metalMat(0x844b33, 0.55, 0.72);
  const dark = metalMat(0x222e2e, 0.9, 0.32);
  const glow = glowMat(0xff3524, 3);

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), hide);
  body.scale.set(0.86, 0.72, 2.75);
  body.castShadow = true;
  group.add(body);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.58, 1.7, 10), hide);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.05, 2.7);
  snout.scale.set(1.0, 1.0, 0.7);
  group.add(snout);

  // Armor plates along spine.
  for (let i = 0; i < 6; i++) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7 - i * 0.055, 0.09, 0.55), armor);
    plate.position.set(0, 0.63 - Math.abs(i - 2) * 0.04, 1.5 - i * 0.62);
    plate.rotation.x = -0.08;
    plate.castShadow = true;
    group.add(plate);
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), rust);
    rivet.position.set(0.28, 0.71, plate.position.z);
    group.add(rivet);
  }

  // Side armor.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.7), armor);
      plate.position.set(side * 0.73, 0.08, 0.8 - i * 0.75);
      plate.rotation.z = side * -0.18;
      group.add(plate);
    }
  }

  // Dorsal fin.
  const dorsal = makeFin(
    [
      [0, 0],
      [0.08, 1.15],
      [0.85, 0.12],
    ],
    0.09,
    rust,
  );
  dorsal.position.set(0, 0.54, 0.25);
  dorsal.rotation.y = -Math.PI / 2;
  group.add(dorsal);

  // Pectoral fins.
  for (const side of [-1, 1]) {
    const fin = makeFin(
      [
        [0, 0],
        [1.7, 0.16],
        [1.35, -0.12],
        [0, -0.34],
      ],
      0.08,
      hide,
    );
    fin.position.set(side * 0.5, -0.12, 1.15);
    fin.rotation.set(0.05, side > 0 ? 0 : Math.PI, side * -0.15);
    group.add(fin);
  }

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, 0, -2.75);
  const upper = makeFin(
    [
      [0, 0],
      [0.12, 1.35],
      [0.8, 0.2],
    ],
    0.1,
    rust,
  );
  upper.rotation.y = -Math.PI / 2;
  const lower = makeFin(
    [
      [0, 0],
      [0.14, -1.0],
      [0.72, -0.1],
    ],
    0.1,
    rust,
  );
  lower.rotation.y = -Math.PI / 2;
  tail.add(upper, lower);
  group.add(tail);

  // Mechanical jaw.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.28, 3.05);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), dark);
  jaw.add(mouth);
  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 4), glowMat(0xe6e2c7, 0.15));
    tooth.position.set(-0.35 + i * 0.14, -0.12, 0.24);
    jaw.add(tooth);
  }
  group.add(jaw);

  const glowParts: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow);
    eye.position.set(side * 0.5, 0.25, 2.1);
    eye.scale.set(0.8, 0.8, 1.6);
    group.add(eye);
    glowParts.push(eye);
  }
  addGlowSprite(group, new THREE.Vector3(0, 0.25, 2.15), 0xff2d1f, 2.1);

  // Exposed engine block.
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.36, 1.15), dark);
  engine.position.set(0, 0.48, -1.35);
  group.add(engine);
  const pipeGeo = new THREE.TorusGeometry(0.18, 0.045, 5, 10, Math.PI);
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(pipeGeo, rust);
    pipe.position.set(0.3, 0.68, -1.8 + i * 0.35);
    pipe.rotation.y = Math.PI / 2;
    group.add(pipe);
  }

  return { group, tail, jaw, tentacles: [], glowParts };
}

function createMechOctopus(): EnemyVisual {
  const group = new THREE.Group();
  const shell = metalMat(0x3c4e53, 0.78, 0.42);
  const rust = metalMat(0x8b5138, 0.55, 0.7);
  const dark = metalMat(0x202e33, 0.88, 0.34);
  const glow = glowMat(0xffa62f, 3.2);

  const head = new THREE.Group();
  head.position.y = 0.55;
  group.add(head);

  const mantle = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), shell);
  mantle.scale.set(1.05, 1.32, 1);
  mantle.castShadow = true;
  head.add(mantle);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.52), rust);
  dome.position.y = 0.12;
  dome.scale.set(1.02, 1.08, 0.98);
  dome.castShadow = true;
  head.add(dome);

  // Metal bands.
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * 0.12, 0.055, 5, 22), dark);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.35 + i * 0.32;
    head.add(band);
  }

  // Central eye/core.
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), glow);
  core.position.set(0, 0.05, 1.36);
  head.add(core);
  const glowParts: THREE.Mesh[] = [core];
  const coreGlow = addGlowSprite(head, new THREE.Vector3(0, 0.05, 1.5), 0xffa22d, 3.3);

  const socket = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.12, 6, 18), dark);
  socket.position.set(0, 0.05, 1.28);
  head.add(socket);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), glowMat(0xff4830, 2.4));
    eye.position.set(side * 0.76, 0.43, 0.98);
    head.add(eye);
    glowParts.push(eye);
  }

  // Tentacles: segmented chains.
  const tentacles: THREE.Group[] = [];
  const armCount = 8;
  const segmentGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.78, 7);
  segmentGeo.translate(0, -0.39, 0);
  const jointGeo = new THREE.SphereGeometry(0.18, 7, 5);
  for (let a = 0; a < armCount; a++) {
    const angle = (a / armCount) * Math.PI * 2;
    const root = new THREE.Group();
    root.position.set(Math.cos(angle) * 0.9, -0.15, Math.sin(angle) * 0.9);
    root.rotation.y = -angle;
    root.userData.baseAngle = angle;
    let parent: THREE.Object3D = root;
    for (let s = 0; s < 5; s++) {
      const pivot = new THREE.Group();
      pivot.position.y = s === 0 ? 0 : -0.68;
      pivot.rotation.z = 0.22 + s * 0.04;
      pivot.userData.segment = s;
      parent.add(pivot);
      const segment = new THREE.Mesh(segmentGeo, s % 2 === 0 ? shell : rust);
      segment.castShadow = true;
      pivot.add(segment);
      const joint = new THREE.Mesh(jointGeo, s % 2 === 0 ? rust : dark);
      joint.position.y = -0.08;
      pivot.add(joint);
      parent = pivot;
    }
    tentacles.push(root);
    group.add(root);
  }

  return { group, tentacles, glowParts, coreGlow };
}

export function createEnemyVisual(type: EnemyType): EnemyVisual {
  switch (type) {
    case 'corrodedFish':
      return createCorrodedFish();
    case 'armoredShark':
      return createArmoredShark();
    case 'mechOctopus':
      return createMechOctopus();
  }
}
