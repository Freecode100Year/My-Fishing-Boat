import * as THREE from 'three';
import { ENEMIES, EnemyType, WORLD } from '../config/balance';
import { Enemy } from './Enemy';
import type { Ocean } from '../world/Ocean';
import type { Islands } from '../world/Islands';
import type { Effects } from '../effects/Effects';
import type { Boat } from '../boat/Boat';
import { randRange } from '../utils/math';

// Keep spawn weights local so the balance table stays declarative.
const ENEMY_TYPES: EnemyType[] = ['corrodedFish', 'armoredShark', 'mechOctopus'];

export interface EnemyManagerHooks {
  getPlayerArmor: () => number;
  getPlayerLevel: () => number;
  onPlayerDamage: (amount: number, heavy: boolean, attacker?: Enemy | null) => void;
  onEnemyDeath: (enemy: Enemy, byHeat: boolean) => void;
  onBossSpawn: (enemy: Enemy) => void;
  onSplash: (position: THREE.Vector3, strength: number) => void;
}

interface InkProjectile {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
  sourceEnemy: Enemy | null;
}

export class EnemyManager {
  readonly enemies: Enemy[] = [];
  private scene: THREE.Scene;
  private ocean: Ocean;
  private islands: Islands;
  private effects: Effects;
  private boat: Boat;
  private hooks: EnemyManagerHooks;

  private spawnTimer = 3.2;
  private elapsed = 0;
  private projectileList: InkProjectile[] = [];
  private orbGeo = new THREE.IcosahedronGeometry(0.42, 1);
  private orbMat = new THREE.MeshStandardMaterial({
    color: 0x2b1b12,
    emissive: 0xff6a1f,
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0.5,
  });
  private orbGlowMat = new THREE.SpriteMaterial({
    color: 0xff7b2d,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  spawnLevel = 1;
  activeBoss: Enemy | null = null;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    islands: Islands,
    effects: Effects,
    boat: Boat,
    hooks: EnemyManagerHooks,
  ) {
    this.scene = scene;
    this.ocean = ocean;
    this.islands = islands;
    this.effects = effects;
    this.boat = boat;
    this.hooks = hooks;

    // Build a soft circular glow texture once for projectiles.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(0.25, 'rgba(255,123,45,.72)');
    g.addColorStop(1, 'rgba(255,80,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.orbGlowMat.map = new THREE.CanvasTexture(canvas);
    this.orbGlowMat.map.colorSpace = THREE.SRGBColorSpace;
  }

  get activeCount(): number {
    return this.enemies.filter((e) => !e.dead).length;
  }

  reset(): void {
    for (const e of this.enemies) e.cleanup(this.scene);
    this.enemies.length = 0;
    for (const p of this.projectileList) {
      this.scene.remove(p.mesh);
      this.scene.remove(p.glow);
    }
    this.projectileList.length = 0;
    this.activeBoss = null;
    this.elapsed = 0;
    this.spawnTimer = 2.2;
  }

  update(dt: number, camera: THREE.Camera, active: boolean): void {
    if (!active) {
      for (const enemy of this.enemies) {
        if (!enemy.dead) {
          const wave = this.ocean.getHeight(enemy.group.position.x, enemy.group.position.z);
          enemy.group.position.y += (wave - 1.4 - enemy.group.position.y) * Math.min(1, dt * 1.5);
          enemy.visual.group.rotation.z = Math.sin(this.elapsed * 1.4) * 0.04;
        }
      }
      return;
    }

    this.elapsed += dt;
    this.spawnTimer -= dt;
    this.spawnLevel = this.hooks.getPlayerLevel();

    if (this.activeCount < WORLD.maxEnemies && this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = WORLD.spawnInterval * randRange(0.72, 1.2) * Math.max(0.55, 1 - this.elapsed * 0.0012);
    }

    const player = this.boat.group.position;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const wave = this.ocean.getHeight(enemy.group.position.x, enemy.group.position.z);
      enemy.update(dt, this.elapsed, wave, camera);
      if (enemy.shouldRemove || (enemy.dead && enemy.deathTimer <= 0)) {
        enemy.cleanup(this.scene);
        this.enemies.splice(i, 1);
        if (this.activeBoss === enemy) this.activeBoss = null;
      }
    }

    this.updateProjectiles(dt, player);
  }

  private updateProjectiles(dt: number, player: THREE.Vector3): void {
    const target = new THREE.Vector3(player.x, 1.5, player.z);
    for (let i = this.projectileList.length - 1; i >= 0; i--) {
      const p = this.projectileList[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.glow.position.copy(p.mesh.position);
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.y += dt * 4;

      // Gentle homing: dangerous, but dodgeable by changing course.
      const desired = target.clone().sub(p.mesh.position).normalize().multiplyScalar(23);
      p.velocity.lerp(desired, Math.min(1, dt * 0.9));

      const wave = this.ocean.getHeight(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.distanceTo(target) < 3.2) {
        this.hooks.onPlayerDamage(p.damage, true, p.sourceEnemy);
        this.effects.explosion(p.mesh.position, 0xff5a22, 0.7);
        this.removeProjectile(i);
        continue;
      }
      if (p.mesh.position.y < wave - 0.2 || p.life <= 0) {
        this.effects.splash(new THREE.Vector3(p.mesh.position.x, Math.max(wave, 0.2), p.mesh.position.z), 0.7);
        this.removeProjectile(i);
      }
    }
  }

  private removeProjectile(index: number): void {
    const p = this.projectileList[index];
    this.scene.remove(p.mesh);
    this.scene.remove(p.glow);
    this.projectileList.splice(index, 1);
  }

  private enemyTypeForSpawn(): EnemyType {
    let total = 0;
    for (const type of ENEMY_TYPES) {
      if (type === 'mechOctopus' && this.activeBoss) continue;
      if (type === 'mechOctopus' && this.spawnLevel < 3 && this.elapsed < 100) continue;
      if (type === 'armoredShark' && this.spawnLevel < 2 && this.elapsed < 35) continue;
      total += ENEMIES[type].weight;
    }
    let pick = Math.random() * total;
    for (const type of ENEMY_TYPES) {
      if (type === 'mechOctopus' && this.activeBoss) continue;
      if (type === 'mechOctopus' && this.spawnLevel < 3 && this.elapsed < 100) continue;
      if (type === 'armoredShark' && this.spawnLevel < 2 && this.elapsed < 35) continue;
      pick -= ENEMIES[type].weight;
      if (pick <= 0) return type;
    }
    return 'corrodedFish';
  }

  spawnEnemy(forceType?: EnemyType): Enemy | null {
    if (this.activeCount >= WORLD.maxEnemies && !forceType) return null;
    const boatPos = this.boat.group.position;
    let x = 0;
    let z = 0;
    let found = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randRange(WORLD.spawnRadiusMin, WORLD.spawnRadiusMax);
      x = boatPos.x + Math.cos(angle) * radius;
      z = boatPos.z + Math.sin(angle) * radius;
      if (Math.hypot(x, z) < WORLD.playRadius - 12 && this.islands.outsideSpawn(x, z)) {
        found = true;
        break;
      }
    }
    if (!found) return null;

    const type = forceType ?? this.enemyTypeForSpawn();
    const spec = ENEMIES[type];
    const hpScale = 1 + (this.spawnLevel - 1) * 0.055 + this.elapsed / 260;
    const y = this.ocean.getHeight(x, z) + spec.depth - 0.4;
    const enemy = new Enemy(this.scene, type, new THREE.Vector3(x, y, z), hpScale, {
      getPlayerPosition: () => this.boat.group.position,
      getPlayerArmor: this.hooks.getPlayerArmor,
      onMeleeHit: (e, damage) => {
        this.hooks.onPlayerDamage(damage, e.type === 'armoredShark', e);
        this.effects.burst(this.boat.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 0xff5a3c, 16, {
          speed: 4,
          size: 1.3,
          life: 0.5,
          spread: 1,
          gravity: -5,
        });
      },
      onRangedAttack: (e, origin, target) => this.spawnInkProjectile(e, origin, target),
      onDeath: (e, byHeat) => this.handleEnemyDeath(e, byHeat),
      onSplash: (pos, strength) => this.hooks.onSplash(pos, strength),
      onSubmergedAttack: () => this.hooks.onSplash(this.boat.group.position.clone(), 0.45),
    });
    enemy.group.position.y = y;
    this.enemies.push(enemy);
    if (type === 'mechOctopus') {
      this.activeBoss = enemy;
      this.hooks.onBossSpawn(enemy);
    }
    this.effects.splash(new THREE.Vector3(x, this.ocean.getHeight(x, z), z), type === 'mechOctopus' ? 2 : 0.8);
    this.spawnTimer = WORLD.spawnInterval;
    return enemy;
  }

  private spawnInkProjectile(enemy: Enemy, origin: THREE.Vector3, target: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.orbGeo, this.orbMat);
    mesh.position.copy(origin);
    const glow = new THREE.Sprite(this.orbGlowMat);
    glow.scale.set(3.2, 3.2, 1);
    glow.position.copy(origin);
    const dir = target.clone().sub(origin).normalize();
    dir.y += 0.04;
    this.scene.add(mesh);
    this.scene.add(glow);
    this.projectileList.push({
      mesh,
      glow,
      velocity: dir.multiplyScalar(23),
      life: 7,
      damage: enemy.spec.damage,
      radius: 0.4,
      sourceEnemy: enemy,
    });
  }

  private handleEnemyDeath(enemy: Enemy, byHeat: boolean): void {
    const pos = enemy.group.position.clone();
    this.effects.explosion(pos, byHeat ? 0xff9a35 : enemy.type === 'armoredShark' ? 0xff5e2e : 0xe38548, enemy.isBoss ? 1.8 : 1);
    if (byHeat) this.effects.heatKill(pos);
    if (this.activeBoss === enemy) this.activeBoss = null;
    this.hooks.onEnemyDeath(enemy, byHeat);
  }

  damageEnemiesInRadius(center: THREE.Vector3, radius: number, amount = 1e9, byHeat = true): number {
    let kills = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.group.position.x - center.x;
      const dz = enemy.group.position.z - center.z;
      const dy = enemy.group.position.y - center.y;
      if (dx * dx + dy * dy + dz * dz <= radius * radius) {
        if (byHeat) {
          enemy.killByHeat();
          kills++;
        } else {
          const result = enemy.takeDamage(amount, false);
          if (result.killed) kills++;
        }
      }
    }
    return kills;
  }

  getClosestEnemy(maxRange = Infinity): Enemy | null {
    let closest: Enemy | null = null;
    let best = maxRange * maxRange;
    const p = this.boat.group.position;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.group.position.x - p.x) ** 2 + (e.group.position.z - p.z) ** 2;
      if (d <= best) {
        best = d;
        closest = e;
      }
    }
    return closest;
  }

  raycastEnemy(ray: THREE.Ray): Enemy | null {
    let closest: Enemy | null = null;
    let closestDist = Infinity;
    const sphere = new THREE.Sphere();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      sphere.set(enemy.group.position, enemy.hitRadius * 1.25);
      const hit = ray.intersectSphere(sphere, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceToSquared(ray.origin);
        if (d < closestDist) {
          closestDist = d;
          closest = enemy;
        }
      }
    }
    return closest;
  }

  aimPointForEnemy(enemy: Enemy, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(enemy.group.position);
  }

  getProjectileCount(): number {
    return this.projectileList.length;
  }
}
