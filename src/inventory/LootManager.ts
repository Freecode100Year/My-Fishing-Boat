import * as THREE from 'three';
import { DROP_TABLES, EnemyType, ITEMS, ItemId, SURVIVAL } from '../config/balance';
import type { Ocean } from '../world/Ocean';
import type { Effects } from '../effects/Effects';
import type { Inventory } from '../inventory/Inventory';
import type { AudioManager } from '../audio/AudioManager';
import { randInt, randRange } from '../utils/math';

export interface LootCallbacks {
  onPrompt: (loot: LootItem | null) => void;
  onCollected: (loot: LootItem, added: number) => void;
}

export interface LootItem {
  id: ItemId;
  amount: number;
  group: THREE.Group;
  glow: THREE.Sprite;
  age: number;
  lifetime: number;
  spin: number;
  baseY: number;
  x: number;
  z: number;
}

const iconCache = new Map<ItemId, THREE.Texture>();

function getIconTexture(id: ItemId): THREE.Texture {
  const cached = iconCache.get(id);
  if (cached) return cached;
  const item = ITEMS[id];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(3,13,17,.78)';
  ctx.beginPath();
  ctx.arc(64, 64, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = item.color;
  ctx.lineWidth = 3;
  ctx.save();
  ctx.shadowColor = item.color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = '700 52px "Segoe UI Symbol", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = item.color;
  ctx.fillText(item.glyph, 64, 66);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(id, tex);
  return tex;
}

function makeGlow(color: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,230,.9)');
  g.addColorStop(0.3, `#${color.toString(16).padStart(6, '0')}`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function buildItemVisual(id: ItemId): THREE.Group {
  const group = new THREE.Group();
  const def = ITEMS[id];
  const color = new THREE.Color(def.color);
  const metal = new THREE.MeshStandardMaterial({ color: 0x6f7975, roughness: 0.5, metalness: 0.7 });
  const bright = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.52, metalness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2d3634, roughness: 0.8 });

  switch (id) {
    case 'meat': {
      const meat = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), bright);
      meat.scale.set(1.15, 0.8, 0.9);
      group.add(meat);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xd7ceb2, roughness: 0.8 }));
      bone.rotation.z = 0.7;
      bone.position.set(0.38, 0.22, 0);
      group.add(bone);
      break;
    }
    case 'water': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.8, 10), bright);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.24, 8), metal);
      neck.position.y = 0.5;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 8), dark);
      cap.position.y = 0.64;
      group.add(body, neck, cap);
      break;
    }
    case 'diesel': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.35), bright);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), dark);
      spout.position.set(0.19, 0.44, 0);
      spout.rotation.z = -0.4;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 4, 8, Math.PI), dark);
      handle.position.set(-0.04, 0.4, 0);
      group.add(body, spout, handle);
      break;
    }
    case 'metal': {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 6, 10), metal);
      gear.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 8), bright);
      hub.rotation.x = Math.PI / 2;
      group.add(gear, hub);
      for (let i = 0; i < 6; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.16), metal);
        const a = (i / 6) * Math.PI * 2;
        tooth.position.set(Math.cos(a) * 0.47, 0, Math.sin(a) * 0.47);
        tooth.rotation.y = -a;
        tooth.rotation.x = Math.PI / 2;
        group.add(tooth);
      }
      break;
    }
    case 'bandage': {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.38, 14), bright);
      roll.rotation.x = Math.PI / 2;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 5, 12), new THREE.MeshStandardMaterial({ color: 0xb24a3e, roughness: 0.8 }));
      band.rotation.y = Math.PI / 2;
      band.position.z = 0.08;
      group.add(roll, band);
      break;
    }
    case 'painkiller': {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 8), bright);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 8), metal);
      cap.position.y = 0.31;
      const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.06), new THREE.MeshBasicMaterial({ color: 0xf4f3df }));
      const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.28, 0.06), new THREE.MeshBasicMaterial({ color: 0xf4f3df }));
      crossA.position.set(0, 0, 0.23);
      crossB.position.set(0, 0, 0.23);
      group.add(bottle, cap, crossA, crossB);
      break;
    }
    case 'regen': {
      const vial = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 4, 8), bright);
      vial.position.y = 0.16;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8), metal);
      cap.position.y = 0.54;
      group.add(vial, cap);
      break;
    }
  }

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const icon = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: getIconTexture(id), transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  icon.position.y = 1.15;
  icon.scale.set(0.95, 0.95, 1);
  group.add(icon);
  return group;
}

export class LootManager {
  readonly loot: LootItem[] = [];
  private scene: THREE.Scene;
  private ocean: Ocean;
  private effects: Effects;
  private inventory: Inventory;
  private audio: AudioManager;
  private callbacks: LootCallbacks;
  private currentPrompt: LootItem | null = null;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    effects: Effects,
    inventory: Inventory,
    audio: AudioManager,
    callbacks: LootCallbacks,
  ) {
    this.scene = scene;
    this.ocean = ocean;
    this.effects = effects;
    this.inventory = inventory;
    this.audio = audio;
    this.callbacks = callbacks;
  }

  reset(): void {
    for (const loot of this.loot) this.cleanup(loot);
    this.loot.length = 0;
    this.currentPrompt = null;
    this.callbacks.onPrompt(null);
  }

  spawn(id: ItemId, amount: number, x: number, z: number): LootItem {
    const group = buildItemVisual(id);
    const baseY = this.ocean.getHeight(x, z) + 0.68;
    group.position.set(x, baseY, z);
    const glow = makeGlow(new THREE.Color(ITEMS[id].color).getHex());
    glow.scale.set(3.6, 3.6, 1);
    group.add(glow);
    this.scene.add(group);

    const loot: LootItem = {
      id,
      amount,
      group,
      glow,
      age: 0,
      lifetime: SURVIVAL.lootLifetime,
      spin: randRange(0.3, 0.9),
      baseY,
      x,
      z,
    };
    this.loot.push(loot);
    if (this.loot.length > 40) {
      const oldest = this.loot.shift()!;
      this.cleanup(oldest);
    }
    return loot;
  }

  spawnDrops(type: EnemyType, position: THREE.Vector3): void {
    const table = DROP_TABLES[type];
    let dropped = 0;
    const surfaceY = this.ocean.getHeight(position.x, position.z);
    for (const entry of table) {
      if (Math.random() > entry.chance) continue;
      const amount = randInt(entry.min, entry.max);
      const a = Math.random() * Math.PI * 2;
      const r = randRange(0.8, 3.2);
      this.spawn(entry.item, amount, position.x + Math.cos(a) * r, position.z + Math.sin(a) * r);
      dropped++;
    }
    if (dropped === 0) {
      this.spawn(type === 'mechOctopus' ? 'metal' : 'meat', 1, position.x, position.z);
    }
    this.effects.spawnRing(new THREE.Vector3(position.x, surfaceY + 0.2, position.z), 0xd8b56d, 5, 1.2, 0.3);
  }

  update(dt: number, playerPos: THREE.Vector3, active: boolean): void {
    if (!active) return;
    let nearestFullLoot: LootItem | null = null;
    let nearestDist = Infinity;

    for (let i = this.loot.length - 1; i >= 0; i--) {
      const loot = this.loot[i];
      loot.age += dt;
      if (loot.age > loot.lifetime) {
        this.cleanup(loot);
        this.loot.splice(i, 1);
        continue;
      }

      const dx = playerPos.x - loot.group.position.x;
      const dz = playerPos.z - loot.group.position.z;
      let dist = Math.hypot(dx, dz);

      // Magnetic attraction when ship approaches within magnetRadius
      if (dist < SURVIVAL.magnetRadius && dist > 0.1) {
        const pullFactor = 1 + (1 - dist / SURVIVAL.magnetRadius) * 1.4;
        const step = Math.min(dist, SURVIVAL.magnetSpeed * pullFactor * dt);
        loot.group.position.x += (dx / dist) * step;
        loot.group.position.z += (dz / dist) * step;
        loot.x = loot.group.position.x;
        loot.z = loot.group.position.z;
        dist = Math.hypot(playerPos.x - loot.x, playerPos.z - loot.z);
      }

      const wave = this.ocean.getHeight(loot.group.position.x, loot.group.position.z);
      loot.group.position.y = wave + 0.68 + Math.sin(loot.age * 1.8 + loot.spin * 3) * 0.13;
      loot.group.rotation.y += dt * loot.spin;
      const time = loot.age;
      loot.glow.material.opacity = 0.3 + Math.sin(time * 2.9) * 0.1 + (loot.lifetime - loot.age < 10 ? 0 : 0.06);

      // Automatic pickup when within pickupRadius
      if (dist < SURVIVAL.pickupRadius) {
        const collected = this.collectItemAt(i);
        if (collected) {
          continue;
        } else if (dist < nearestDist) {
          // Inventory is full for this item
          nearestDist = dist;
          nearestFullLoot = loot;
        }
      }
    }

    if (nearestFullLoot !== this.currentPrompt) {
      this.currentPrompt = nearestFullLoot;
      this.callbacks.onPrompt(nearestFullLoot);
    }
  }

  private collectItemAt(index: number): boolean {
    const loot = this.loot[index];
    if (!loot) return false;
    const added = this.inventory.add(loot.id, loot.amount);
    if (added <= 0) {
      return false;
    }
    if (added < loot.amount) {
      loot.amount -= added;
      this.callbacks.onCollected(loot, added);
      this.audio.pickup();
      return false;
    }
    this.loot.splice(index, 1);
    this.effects.burst(loot.group.position.clone(), ITEMS[loot.id].color, 18, {
      speed: 3,
      size: 1.2,
      life: 0.6,
      gravity: 2,
      spread: 0.25,
      upward: 1.4,
    });
    this.effects.spawnRing(loot.group.position.clone(), ITEMS[loot.id].color, 2.4, 0.7, 0.4);
    this.cleanup(loot);
    if (this.currentPrompt === loot) {
      this.currentPrompt = null;
      this.callbacks.onPrompt(null);
    }
    this.callbacks.onCollected(loot, added);
    this.audio.pickup();
    return true;
  }

  tryPickup(): boolean {
    const loot = this.currentPrompt;
    if (!loot) return false;
    const index = this.loot.indexOf(loot);
    if (index < 0) return false;
    return this.collectItemAt(index);
  }

  private cleanup(loot: LootItem): void {
    this.scene.remove(loot.group);
    loot.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat && !(mat as THREE.SpriteMaterial).map?.userData?.shared) mat.dispose();
    });
  }

  get nearestLoot(): LootItem | null {
    return this.currentPrompt;
  }
}
