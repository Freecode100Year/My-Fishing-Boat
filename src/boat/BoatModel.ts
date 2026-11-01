import * as THREE from 'three';

export interface BoatModel {
  group: THREE.Group;
  turretYaw: THREE.Group;
  turretPitch: THREE.Group;
  muzzle: THREE.Object3D;
  muzzleFlash: THREE.Sprite;
  propeller: THREE.Group;
  radar: THREE.Object3D;
  wakeAnchor: THREE.Object3D;
  smokeAnchor: THREE.Object3D;
  lantern: THREE.PointLight;
  spotlight: THREE.SpotLight;
  hullMaterials: THREE.Material[];
}

function createHullGeometry(): THREE.BufferGeometry {
  const sections = [
    { z: -4.45, w: 1.14, bottom: -1.02, top: 0.52 },
    { z: -3.65, w: 1.46, bottom: -1.26, top: 0.57 },
    { z: -2.35, w: 1.62, bottom: -1.36, top: 0.61 },
    { z: -0.8, w: 1.65, bottom: -1.38, top: 0.64 },
    { z: 0.8, w: 1.58, bottom: -1.3, top: 0.68 },
    { z: 2.15, w: 1.36, bottom: -1.13, top: 0.73 },
    { z: 3.3, w: 0.97, bottom: -0.87, top: 0.8 },
    { z: 4.15, w: 0.48, bottom: -0.54, top: 0.87 },
    { z: 4.72, w: 0.035, bottom: -0.12, top: 0.94 },
  ];

  const ringPoints = (s: (typeof sections)[number]): [number, number, number][] => {
    const { w, bottom, top } = s;
    return [
      [0, bottom, 0],
      [-w * 0.58, bottom + 0.14, 0],
      [-w * 0.94, bottom + 0.65, 0],
      [-w, top, 0],
      [0, top + 0.075, 0],
      [w, top, 0],
      [w * 0.94, bottom + 0.65, 0],
      [w * 0.58, bottom + 0.14, 0],
    ];
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const rustRed = new THREE.Color(0x6f3026);
  const lowerRed = new THREE.Color(0x843d2e);
  const barnacle = new THREE.Color(0x4e4c3d);
  const paint = new THREE.Color(0xc9c3a9);
  const trim = new THREE.Color(0x253f44);
  const deck = new THREE.Color(0x5c4c36);

  const colorFor = (pointIndex: number): THREE.Color => {
    switch (pointIndex) {
      case 0:
        return rustRed;
      case 1:
      case 7:
        return lowerRed;
      case 2:
      case 6:
        return barnacle;
      case 3:
      case 5:
        return paint;
      case 4:
        return deck;
      default:
        return paint;
    }
  };

  sections.forEach((section, si) => {
    const ring = ringPoints(section);
    ring.forEach(([x, y, z], pi) => {
      positions.push(x, y + z * 0.005, section.z);
      const c = colorFor(pi);
      const jitter = (Math.sin(si * 12.7 + pi * 5.3) + 1) * 0.022;
      colors.push(c.r + jitter, c.g + jitter, c.b + jitter);
      uvs.push(pi / 8, section.z / 8);
    });
  });

  for (let s = 0; s < sections.length - 1; s++) {
    for (let p = 0; p < 8; p++) {
      const next = (p + 1) % 8;
      const a = s * 8 + p;
      const b = s * 8 + next;
      const c = (s + 1) * 8 + p;
      const d = (s + 1) * 8 + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Stern transom cap.
  const sternCenter = positions.length / 3;
  positions.push(0, -0.2, sections[0].z - 0.01);
  colors.push(trim.r, trim.g, trim.b);
  uvs.push(0.5, 0.5);
  for (let p = 0; p < 8; p++) {
    const next = (p + 1) % 8;
    indices.push(sternCenter, next, p);
  }

  // Bow cap (narrow, but closes the hull).
  const bowCenter = positions.length / 3;
  const last = sections[sections.length - 1];
  positions.push(0, 0.4, last.z + 0.015);
  colors.push(trim.r, trim.g, trim.b);
  uvs.push(0.5, 0.5);
  const lastStart = (sections.length - 1) * 8;
  for (let p = 0; p < 8; p++) {
    const next = (p + 1) % 8;
    indices.push(bowCenter, lastStart + p, lastStart + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeLabelTexture(text: string, color = '#e8ddbc'): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 64px "Arial Narrow", sans-serif';
  ctx.letterSpacing = '14px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 70);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(80, 100, 352, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeNetTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(152, 128, 85, .75)';
  ctx.lineWidth = 2;
  const step = 24;
  for (let i = -256; i < 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 256);
    ctx.lineTo(i + 256, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1.6);
  return tex;
}

function makeRustDecal(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {
    const x = 20 + Math.random() * 88;
    const y = Math.random() * 240;
    const r = 1 + Math.random() * 10;
    ctx.fillStyle = `rgba(${90 + Math.random() * 35},${36 + Math.random() * 18},${20 + Math.random() * 10},${0.08 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (1.5 + Math.random() * 3), Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRail(points: THREE.Vector3[], material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.72, 5);
  points.forEach((p) => {
    const post = new THREE.Mesh(postGeo, material);
    post.position.copy(p).add(new THREE.Vector3(0, 0.36, 0));
    group.add(post);
  });
  const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().add(new THREE.Vector3(0, 0.72, 0))));
  const railGeo = new THREE.TubeGeometry(curve, 26, 0.025, 5, false);
  const rail = new THREE.Mesh(railGeo, material);
  group.add(rail);
  return group;
}

export function createBoatModel(): BoatModel {
  const group = new THREE.Group();
  group.name = 'rustbucket';

  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.42,
    flatShading: false,
  });
  const paintedMetal = new THREE.MeshStandardMaterial({ color: 0xb9b49d, roughness: 0.55, metalness: 0.28 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x263639, roughness: 0.5, metalness: 0.65 });
  const rustMetal = new THREE.MeshStandardMaterial({ color: 0x7d4331, roughness: 0.74, metalness: 0.45 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x624e35, roughness: 0.9, metalness: 0.05 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3d3124, roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f2d31,
    emissive: 0x2b6e69,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.55,
  });
  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0xffd393,
    emissive: 0xff9d45,
    emissiveIntensity: 1.8,
    roughness: 0.3,
  });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x7f7255, roughness: 1 });

  const hull = new THREE.Mesh(createHullGeometry(), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.1, 6.2), woodMat);
  deck.position.set(0, 0.73, -0.5);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // Deck planks.
  const plankGeo = new THREE.BoxGeometry(0.028, 0.012, 6.1);
  for (let i = -7; i <= 7; i++) {
    const plank = new THREE.Mesh(plankGeo, darkWood);
    plank.position.set(i * 0.18, 0.789, -0.5);
    group.add(plank);
  }

  // Waterline stripe.
  const stripeGeo = new THREE.BoxGeometry(0.05, 0.11, 7.4);
  const stripeL = new THREE.Mesh(stripeGeo, rustMetal);
  stripeL.position.set(-1.55, 0.19, -0.15);
  stripeL.rotation.y = -0.01;
  const stripeR = stripeL.clone();
  stripeR.position.x = 1.55;
  group.add(stripeL, stripeR);

  // Cabin.
  const cabin = new THREE.Group();
  cabin.position.set(0, 0.79, -1.4);
  const cabinLower = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.86, 3.35), new THREE.MeshStandardMaterial({ color: 0x3d5659, roughness: 0.6, metalness: 0.28 }));
  cabinLower.position.y = 0.43;
  cabinLower.castShadow = true;
  cabinLower.receiveShadow = true;
  cabin.add(cabinLower);

  const cabinUpper = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.96, 3.15), paintedMetal);
  cabinUpper.position.y = 1.34;
  cabinUpper.castShadow = true;
  cabinUpper.receiveShadow = true;
  cabin.add(cabinUpper);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.14, 3.5), darkMetal);
  roof.position.y = 1.9;
  roof.castShadow = true;
  cabin.add(roof);

  // Cabin window strips.
  const sideWindowGeo = new THREE.BoxGeometry(0.04, 0.52, 0.8);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const win = new THREE.Mesh(sideWindowGeo, glassMat);
      win.position.set(side * 1.286, 1.36, 0.45 - i * 1.05);
      cabin.add(win);
    }
  }

  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.48, 0.04), glassMat);
  frontWindow.position.set(0, 1.4, 1.585);
  cabin.add(frontWindow);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.2, 0.04), darkWood);
  door.position.set(0.67, 0.68, -1.68);
  cabin.add(door);

  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.12), warmGlass);
  lamp.position.set(-0.72, 1.15, -1.695);
  cabin.add(lamp);

  const labelMat = new THREE.MeshBasicMaterial({ map: makeLabelTexture('RUSTBUCKET'), transparent: true, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.41), labelMat);
  label.position.set(0, 0.82, -1.69);
  label.rotation.y = Math.PI;
  cabin.add(label);
  group.add(cabin);

  // Rust decals on both flanks.
  const rustDecalMat = new THREE.MeshBasicMaterial({
    map: makeRustDecal(),
    transparent: true,
    depthWrite: false,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), rustDecalMat);
    decal.position.set(side * 1.53, 0.1, 0.35);
    decal.rotation.y = (Math.PI / 2) * side;
    decal.rotation.z = 0.08 * side;
    group.add(decal);
  }

  // Bow railings.
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7f8e88, roughness: 0.42, metalness: 0.7 });
  const leftRail = createRail(
    [
      new THREE.Vector3(-1.2, 0.85, 2.35),
      new THREE.Vector3(-1.0, 0.9, 3.1),
      new THREE.Vector3(-0.64, 0.98, 3.82),
      new THREE.Vector3(-0.18, 1.02, 4.35),
    ],
    railMat,
  );
  const rightRail = createRail(
    [
      new THREE.Vector3(1.2, 0.85, 2.35),
      new THREE.Vector3(1.0, 0.9, 3.1),
      new THREE.Vector3(0.64, 0.98, 3.82),
      new THREE.Vector3(0.18, 1.02, 4.35),
    ],
    railMat,
  );
  group.add(leftRail, rightRail);

  // Winch and bow cleat.
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 10), rustMetal);
  winch.rotation.z = Math.PI / 2;
  winch.position.set(0, 0.95, 3.25);
  winch.castShadow = true;
  group.add(winch);
  const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.16), darkMetal);
  cleat.position.set(0, 0.86, 4.22);
  group.add(cleat);

  // Mast, antenna, radar.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 3.3, 6), darkMetal);
  mast.position.set(0.72, 3.15, -0.35);
  mast.castShadow = true;
  group.add(mast);
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.045, 0.045), darkMetal);
  crossbar.position.set(0.72, 4.1, -0.35);
  group.add(crossbar);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.65, 4), rustMetal);
  antenna.position.set(0.72, 4.85, -0.35);
  group.add(antenna);

  const radar = new THREE.Group();
  radar.position.set(-0.72, 2.03, -0.8);
  const radarPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.32, 5), darkMetal);
  radarPost.position.y = 0.16;
  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.17), paintedMetal);
  radarBar.position.y = 0.34;
  radar.add(radarPost, radarBar);
  group.add(radar);

  // Exhaust stack and smoke anchor.
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.05, 8), rustMetal);
  stack.position.set(-0.95, 2.15, -2.3);
  stack.castShadow = true;
  group.add(stack);
  const smokeAnchor = new THREE.Object3D();
  smokeAnchor.position.set(-0.95, 2.72, -2.3);
  group.add(smokeAnchor);

  // Turret.
  const turretYaw = new THREE.Group();
  turretYaw.position.set(0, 0.95, 2.0);
  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.28, 12), darkMetal);
  turretBase.position.y = 0.12;
  turretBase.castShadow = true;
  turretYaw.add(turretBase);

  const turretPitch = new THREE.Group();
  turretPitch.position.y = 0.36;
  const turretBody = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.48, 0.88), rustMetal);
  turretBody.castShadow = true;
  turretPitch.add(turretBody);

  const barrelGeo = new THREE.CylinderGeometry(0.075, 0.105, 2.25, 8);
  barrelGeo.rotateX(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeo, darkMetal);
  barrel.position.set(0, 0.02, 1.1);
  barrel.castShadow = true;
  turretPitch.add(barrel);
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.3, 8), darkMetal);
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.02, 2.22);
  turretPitch.add(muzzleBrake);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.28), warmGlass);
  sight.position.set(0.31, 0.27, 0.16);
  turretPitch.add(sight);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 2.42);
  turretPitch.add(muzzle);
  turretYaw.add(turretPitch);
  group.add(turretYaw);

  // Muzzle flash.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = flashCanvas.height = 128;
  const fctx = flashCanvas.getContext('2d')!;
  const fg = fctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  fg.addColorStop(0, 'rgba(255,255,225,1)');
  fg.addColorStop(0.2, 'rgba(255,212,120,.95)');
  fg.addColorStop(0.55, 'rgba(255,105,26,.36)');
  fg.addColorStop(1, 'rgba(255,80,10,0)');
  fctx.fillStyle = fg;
  fctx.fillRect(0, 0, 128, 128);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const muzzleFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flashTex,
      color: 0xffc869,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    }),
  );
  muzzleFlash.scale.setScalar(1.6);
  muzzleFlash.position.copy(muzzle.position);
  muzzleFlash.visible = false;
  turretPitch.add(muzzleFlash);

  // Searchlight.
  const lightBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.22, 8), darkMetal);
  lightBase.rotation.x = Math.PI / 2;
  lightBase.position.set(1.05, 2.42, 0.25);
  group.add(lightBase);
  const lightHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.36, 10), paintedMetal);
  lightHousing.rotation.x = Math.PI / 2;
  lightHousing.position.set(1.05, 2.52, 0.45);
  group.add(lightHousing);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff1bf }),
  );
  lens.position.set(1.05, 2.52, 0.64);
  group.add(lens);

  const spotlight = new THREE.SpotLight(0xffe3b0, 95, 80, 0.3, 0.62, 1.4);
  spotlight.position.set(1.05, 2.52, 0.5);
  spotlight.target.position.set(1.05, 0.5, 30);
  spotlight.castShadow = false;
  group.add(spotlight, spotlight.target);

  const lantern = new THREE.PointLight(0xffb562, 9, 18, 2);
  lantern.position.set(0, 2.2, -1.7);
  group.add(lantern);

  // Navigation lights.
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3c30 }));
  navRed.position.set(-1.46, 1.05, 2.2);
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: 0x48ff9b }));
  navGreen.position.set(1.46, 1.05, 2.2);
  group.add(navRed, navGreen);

  // Stern crane and net.
  const cranePost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.4, 6), rustMetal);
  cranePost.position.set(-1.0, 1.9, -3.35);
  cranePost.rotation.z = 0.08;
  group.add(cranePost);
  const craneArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.9, 6), rustMetal);
  craneArm.position.set(-1.45, 3.05, -3.15);
  craneArm.rotation.set(0.5, 0.1, 0.85);
  group.add(craneArm);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 3), darkMetal);
  cable.position.set(-2.35, 2.25, -2.2);
  cable.rotation.z = 0.08;
  group.add(cable);

  const netMat = new THREE.MeshStandardMaterial({
    map: makeNetTexture(),
    color: 0x8d7e5d,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    roughness: 1,
    alphaTest: 0.15,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.3), netMat);
  net.position.set(-2.32, 1.6, -2.2);
  net.rotation.set(0.16, 0.45, 0.12);
  group.add(net);

  // Barrels and crates.
  const caskGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.58, 9);
  for (let i = 0; i < 3; i++) {
    const barrel = new THREE.Mesh(caskGeo, i === 1 ? paintedMetal : rustMetal);
    barrel.position.set(-1.18, 1.08, -2.3 - i * 0.42);
    barrel.castShadow = true;
    group.add(barrel);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.55), woodMat);
  crate.position.set(1.13, 1.02, -2.6);
  crate.rotation.y = 0.18;
  crate.castShadow = true;
  group.add(crate);

  // Fishing rods.
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x3b3022, roughness: 0.8 });
  for (let i = 0; i < 2; i++) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.8, 4), rodMat);
    rod.position.set(-1.25 + i * 0.16, 2.3, -3.8);
    rod.rotation.set(0.95 + i * 0.12, 0.1, 0.12);
    group.add(rod);
  }

  // Propeller and rudder.
  const propeller = new THREE.Group();
  propeller.position.set(0, -0.75, -4.55);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 8), darkMetal);
  hub.rotation.x = Math.PI / 2;
  propeller.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.25), rustMetal);
    blade.position.y = 0.35;
    blade.rotation.z = Math.PI * 0.2;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    propeller.add(holder);
  }
  group.add(propeller);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.65), rustMetal);
  rudder.position.set(0, -0.7, -4.35);
  group.add(rudder);

  // Wake and spray anchors.
  const wakeAnchor = new THREE.Object3D();
  wakeAnchor.position.set(0, 0.15, -4.4);
  group.add(wakeAnchor);

  // Interior warm glow.
  const cabinGlow = new THREE.PointLight(0xff9d4f, 3.5, 6, 2);
  cabinGlow.position.set(0, 1.35, -1);
  group.add(cabinGlow);

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  hull.castShadow = true;

  return {
    group,
    turretYaw,
    turretPitch,
    muzzle,
    muzzleFlash,
    propeller,
    radar,
    wakeAnchor,
    smokeAnchor,
    lantern,
    spotlight,
    hullMaterials: [hullMat, paintedMetal, darkMetal, rustMetal, woodMat],
  };
}
