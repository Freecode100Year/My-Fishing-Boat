import * as THREE from 'three';
import { COMBAT, SALVO } from '../config/balance';
import type { Boat } from '../boat/Boat';
import type { Input } from '../core/Input';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { Enemy } from '../enemies/Enemy';
import type { Effects } from '../effects/Effects';
import type { Progression } from '../progression/Progression';
import type { Survival } from '../survival/Survival';
import type { AudioManager } from '../audio/AudioManager';
import { segmentIntersectsSphere } from '../utils/math';

export interface CombatHooks {
  getAimNdc: () => { x: number; y: number };
  onValidHit: (amount: number, crit: boolean) => void;
  onDamageNumber: (worldPosition: THREE.Vector3, amount: number, crit: boolean) => void;
  onScreenShake: (amount: number) => void;
  onReloadState: (reloading: boolean) => void;
  onHitConfirm?: (killed: boolean, crit: boolean) => void;
}

interface Projectile {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  velocity: THREE.Vector3;
  previous: THREE.Vector3;
  life: number;
  damage: number;
  crit: boolean;
  age: number;
}

export class Combat {
  private scene: THREE.Scene;
  private boat: Boat;
  private camera: THREE.PerspectiveCamera;
  private enemies: EnemyManager;
  private effects: Effects;
  private progression: Progression;
  private survival: Survival;
  private audio: AudioManager;
  private hooks: CombatHooks;

  autoAttackEnabled = true;
  autoCounterEnabled = true;

  private cooldown = 0;
  salvoCooldown = 0;
  private projectiles: Projectile[] = [];
  private raycaster = new THREE.Raycaster();
  private aimPoint = new THREE.Vector3(0, 0, 50);
  private cursorSeaPoint = new THREE.Vector3(0, 0, 50);
  private aimEnemy: Enemy | null = null;
  private counterTarget: Enemy | null = null;
  private counterTimer = 0;
  private activeEngagementMode: 'manual' | 'counter' | 'auto' | 'idle' = 'idle';

  private seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
  private tracerGeo: THREE.CylinderGeometry;
  private tracerMat: THREE.MeshBasicMaterial;
  private glowTexture: THREE.Texture;
  private glowMat: THREE.SpriteMaterial;
  private lockRing: THREE.Mesh;
  private lockRingMat: THREE.MeshBasicMaterial;
  private shotsFired = 0;
  private shotsHit = 0;

  constructor(
    scene: THREE.Scene,
    boat: Boat,
    camera: THREE.PerspectiveCamera,
    enemies: EnemyManager,
    effects: Effects,
    progression: Progression,
    survival: Survival,
    audio: AudioManager,
    hooks: CombatHooks,
  ) {
    this.scene = scene;
    this.boat = boat;
    this.camera = camera;
    this.enemies = enemies;
    this.effects = effects;
    this.progression = progression;
    this.survival = survival;
    this.audio = audio;
    this.hooks = hooks;

    this.tracerGeo = new THREE.CylinderGeometry(0.035, 0.09, 2.2, 5);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd48a, toneMapped: false });

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,245,195,1)');
    grad.addColorStop(0.2, 'rgba(255,205,110,.9)');
    grad.addColorStop(1, 'rgba(255,130,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTexture = new THREE.CanvasTexture(canvas);
    this.glowTexture.colorSpace = THREE.SRGBColorSpace;
    this.glowMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Target lock ring for auto-attack / auto-counterattack
    const ringGeo = new THREE.RingGeometry(2.1, 2.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.lockRingMat = new THREE.MeshBasicMaterial({
      color: 0xff5a46,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.lockRing = new THREE.Mesh(ringGeo, this.lockRingMat);
    this.lockRing.visible = false;
    this.scene.add(this.lockRing);
  }

  reset(): void {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      this.scene.remove(p.glow);
    }
    this.projectiles.length = 0;
    this.cooldown = 0;
    this.salvoCooldown = 0;
    this.aimEnemy = null;
    this.counterTarget = null;
    this.counterTimer = 0;
    this.activeEngagementMode = 'idle';
    this.lockRing.visible = false;
    this.shotsFired = 0;
    this.shotsHit = 0;
  }

  /** Called when an enemy attacks or damages the player to trigger Auto-Counterattack */
  registerAttacker(attacker?: Enemy | null): void {
    const candidate =
      attacker && !attacker.dead
        ? attacker
        : this.enemies.getClosestEnemy(COMBAT.counterAttackRange);
    if (!candidate || candidate.dead) return;

    this.counterTarget = candidate;
    this.counterTimer = COMBAT.counterAttackDuration;

    if (this.autoCounterEnabled && !this.survival.dead) {
      this.cooldown = Math.min(this.cooldown, 0.04);
    }
  }

  update(dt: number, input: Input, active: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.salvoCooldown = Math.max(0, this.salvoCooldown - dt);
    this.counterTimer = Math.max(0, this.counterTimer - dt);
    if (this.counterTarget && (this.counterTarget.dead || this.counterTimer <= 0)) {
      this.counterTarget = null;
      this.counterTimer = 0;
    }

    this.hooks.onReloadState(this.cooldown > 0.09);

    let shouldFire = false;

    if (active) {
      shouldFire = this.updateAimAndSelectTarget(input);
      this.boat.aimAt(this.aimPoint, dt);
    } else {
      this.lockRing.visible = false;
    }

    if (active && shouldFire && this.cooldown <= 0 && !this.survival.dead) {
      this.fire();
    }

    this.updateProjectiles(dt);
  }

  private updateAimAndSelectTarget(input: Input): boolean {
    const ndc = this.hooks.getAimNdc();
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const ray = this.raycaster.ray;

    // Compute cursor sea point safely (if ray points above horizon or behind boat, project along boat desiredHeading)
    const seaHit = new THREE.Vector3();
    if (ray.direction.y < -0.03 && ray.intersectPlane(this.seaPlane, seaHit)) {
      const distSqToBoat = (seaHit.x - this.boat.group.position.x) ** 2 + (seaHit.z - this.boat.group.position.z) ** 2;
      if (distSqToBoat > 16 && distSqToBoat < 90000) {
        this.cursorSeaPoint.copy(seaHit);
      } else {
        this.cursorSeaPoint.set(
          this.boat.group.position.x + Math.sin(this.boat.desiredHeading) * 45,
          0.4,
          this.boat.group.position.z + Math.cos(this.boat.desiredHeading) * 45,
        );
      }
    } else {
      this.cursorSeaPoint.set(
        this.boat.group.position.x + Math.sin(this.boat.desiredHeading) * 45,
        0.4,
        this.boat.group.position.z + Math.cos(this.boat.desiredHeading) * 45,
      );
    }

    // Check if cursor is directly hovering over an enemy
    const hoveredEnemy = this.enemies.raycastEnemy(ray);

    // Priority A: Manual fire held by player
    if (input.fireHeld) {
      this.activeEngagementMode = 'manual';
      this.aimEnemy = hoveredEnemy;
      if (hoveredEnemy) {
        this.aimPoint.copy(this.computePredictedAimPoint(hoveredEnemy));
      } else {
        this.aimPoint.copy(this.cursorSeaPoint);
      }
      this.updateLockRing(hoveredEnemy, 0xffc04c);
      return true;
    }

    // Priority B: Auto-Counterattack against an enemy that attacked the ship (or is actively attacking)
    if (this.autoCounterEnabled) {
      let counter = this.counterTarget;
      if (!counter || counter.dead) {
        const p = this.boat.group.position;
        let bestDist = COMBAT.counterAttackRange * COMBAT.counterAttackRange;
        for (const e of this.enemies.enemies) {
          if (e.dead || e.state !== 'attack') continue;
          const d = (e.group.position.x - p.x) ** 2 + (e.group.position.z - p.z) ** 2;
          if (d < bestDist) {
            bestDist = d;
            counter = e;
          }
        }
      }

      if (counter && !counter.dead) {
        const dist = counter.distanceToPlayerHorizontal(this.boat.group.position);
        if (dist <= COMBAT.counterAttackRange) {
          this.activeEngagementMode = 'counter';
          this.aimEnemy = counter;
          this.aimPoint.copy(this.computePredictedAimPoint(counter));
          this.updateLockRing(counter, 0xff4538);
          return true;
        }
      }
    }

    // Priority C: Auto-Attack nearest/hovered enemy in range
    if (this.autoAttackEnabled) {
      let target: Enemy | null = null;
      if (hoveredEnemy && !hoveredEnemy.dead && hoveredEnemy.distanceToPlayerHorizontal(this.boat.group.position) <= COMBAT.autoAttackRange) {
        target = hoveredEnemy;
      } else {
        target = this.enemies.getClosestEnemy(COMBAT.autoAttackRange);
      }

      if (target && !target.dead) {
        this.activeEngagementMode = 'auto';
        this.aimEnemy = target;
        this.aimPoint.copy(this.computePredictedAimPoint(target));
        this.updateLockRing(target, 0x45d8c5);
        return true;
      }
    }

    // Idle: aim at hovered enemy or cursor sea point without firing
    this.activeEngagementMode = 'idle';
    this.aimEnemy = hoveredEnemy;
    if (hoveredEnemy) {
      this.aimPoint.copy(hoveredEnemy.group.position);
    } else {
      this.aimPoint.copy(this.cursorSeaPoint);
    }
    this.updateLockRing(hoveredEnemy, 0x90b9b9);
    return false;
  }

  private computePredictedAimPoint(enemy: Enemy): THREE.Vector3 {
    const muzzle = this.boat.getMuzzleWorld();
    const targetPos = enemy.group.position.clone();
    const dist = muzzle.distanceTo(targetPos);
    const flightTime = dist / COMBAT.projectileSpeed;
    const heading = enemy.group.rotation.y;
    const estSpeed = enemy.state === 'chase' ? enemy.spec.speed : enemy.state === 'attack' ? enemy.spec.speed * 0.45 : enemy.spec.speed * 0.3;
    targetPos.x += Math.sin(heading) * estSpeed * flightTime * 0.65;
    targetPos.z += Math.cos(heading) * estSpeed * flightTime * 0.65;
    return targetPos;
  }

  private updateLockRing(enemy: Enemy | null, colorHex: number): void {
    if (!enemy || enemy.dead) {
      this.lockRing.visible = false;
      return;
    }
    this.lockRing.visible = true;
    this.lockRingMat.color.setHex(colorHex);
    const scale = Math.max(0.85, enemy.hitRadius / 1.9);
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.07;
    this.lockRing.scale.setScalar(scale * pulse);
    this.lockRing.position.set(enemy.group.position.x, Math.max(0.15, enemy.group.position.y + 0.35), enemy.group.position.z);
  }

  private fire(): void {
    const stats = this.progression.stats;
    const interval = COMBAT.baseInterval / stats.fireRateMultiplier;
    this.cooldown = interval;

    const muzzle = this.boat.getMuzzleWorld();
    const dir = this.aimPoint.clone().sub(muzzle).normalize();
    const spread = COMBAT.spreadBase + (this.survival.painActive ? COMBAT.painSpread : 0);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.6;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    this.spawnShell(muzzle, dir, 1);
    this.muzzleEffects(muzzle, 1);
    this.audio.cannon();
    // Do NOT trigger screen shake on every rapid-fire cannon shot (prevents continuous camera vibration)
  }

  /** Q: fire a fan of shells toward the current aim point. Returns false while on cooldown. */
  fireSalvo(): boolean {
    if (this.salvoCooldown > 0 || this.survival.dead) return false;
    this.salvoCooldown = SALVO.cooldown;

    // Make sure the aim point reflects the cursor even if nothing is locked.
    const muzzle = this.boat.getMuzzleWorld();
    const base = this.aimPoint.clone().sub(muzzle);
    const horizontal = Math.hypot(base.x, base.z);
    if (horizontal < 0.5) return false;
    const yaw = Math.atan2(base.x, base.z);
    const pitch = Math.atan2(base.y, horizontal);
    const n = SALVO.shells;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1) - 0.5;
      const a = yaw + f * SALVO.spreadRadians * 2;
      const p = pitch + (Math.random() - 0.5) * 0.01;
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p)).normalize();
      this.spawnShell(muzzle, dir, SALVO.damageMultiplier);
    }
    this.muzzleEffects(muzzle, 2.2);
    this.audio.cannon();
    this.audio.cannon();
    this.hooks.onScreenShake(0.35);
    return true;
  }

  private spawnShell(muzzle: THREE.Vector3, dir: THREE.Vector3, damageScale: number): void {
    const stats = this.progression.stats;
    this.shotsFired++;
    const crit = Math.random() < stats.critChance;
    const damage =
      COMBAT.baseDamage * stats.damageMultiplier * this.survival.damagePenalty * damageScale * (crit ? COMBAT.critMultiplier : 1);

    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(muzzle);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    mesh.scale.set(1, 1, crit ? 1.6 : 1);

    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(crit ? 2.2 : 1.35);
    glow.position.copy(muzzle);

    this.scene.add(mesh);
    this.scene.add(glow);
    this.projectiles.push({
      mesh,
      glow,
      velocity: dir.clone().multiplyScalar(COMBAT.projectileSpeed),
      previous: muzzle.clone(),
      life: COMBAT.projectileLife,
      damage,
      crit,
      age: 0,
    });
  }

  private muzzleEffects(muzzle: THREE.Vector3, scale: number): void {
    this.boat.flashMuzzle();
    this.effects.burst(muzzle, 0xffcf7a, Math.round(10 * scale), {
      speed: 5 * Math.sqrt(scale),
      size: 1.2,
      life: 0.22,
      gravity: -2,
      spread: 0.1 * scale,
      upward: 0.4,
      drag: 2,
    });
    this.effects.spawnFlash(muzzle, 2.8 * scale, 0.09);
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.life -= dt;
      p.previous.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.glow.position.copy(p.mesh.position);
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.velocity.clone().normalize());

      let hitEnemy: Enemy | null = null;
      let closestDist = Infinity;
      for (const enemy of this.enemies.enemies) {
        if (enemy.dead) continue;
        if (
          segmentIntersectsSphere(
            p.previous,
            p.mesh.position,
            enemy.group.position,
            enemy.hitRadius * 1.12,
          )
        ) {
          const d = p.previous.distanceToSquared(enemy.group.position);
          if (d < closestDist) {
            closestDist = d;
            hitEnemy = enemy;
          }
        }
      }

      if (hitEnemy) {
        const result = hitEnemy.takeDamage(p.damage, p.crit);
        this.shotsHit++;
        const hitPos = p.mesh.position.clone();
        this.effects.hitSparks(hitPos, p.crit ? 0xffe39b : 0xffaa62, p.crit);
        this.audio.hit(p.crit);
        this.hooks.onDamageNumber(hitPos, result.dealt, p.crit);
        this.hooks.onValidHit(p.damage, p.crit);
        this.hooks.onHitConfirm?.(result.killed, p.crit);
        if (p.crit) {
          this.effects.spawnFlash(hitPos, 3.5, 0.16);
        }
        this.removeProjectile(i);
        continue;
      }

      const wave = 0;
      if (p.mesh.position.y < wave || p.life <= 0) {
        if (p.mesh.position.y < 2.5) {
          this.effects.splash(p.mesh.position.clone(), 0.45);
        }
        this.removeProjectile(i);
      }
    }
  }

  private removeProjectile(index: number): void {
    const p = this.projectiles[index];
    this.scene.remove(p.mesh);
    this.scene.remove(p.glow);
    this.projectiles.splice(index, 1);
  }

  get targetEnemy(): Enemy | null {
    return this.aimEnemy;
  }

  get engagementMode(): 'manual' | 'counter' | 'auto' | 'idle' {
    return this.activeEngagementMode;
  }

  get currentAimPoint(): THREE.Vector3 {
    return this.aimPoint;
  }

  get currentCursorSeaPoint(): THREE.Vector3 {
    return this.cursorSeaPoint;
  }

  get accuracy(): number {
    return this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }
}
