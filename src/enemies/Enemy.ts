import * as THREE from 'three';
import { ENEMIES, EnemySpec, EnemyType } from '../config/balance';
import { createEnemyVisual, EnemyVisual } from './EnemyModels';
import { angleDelta, clamp, damp, randRange, smoothstep } from '../utils/math';
import { t } from '../i18n';

export type EnemyState = 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead';

export interface EnemyCallbacks {
  getPlayerPosition: () => THREE.Vector3;
  getPlayerArmor: () => number;
  onMeleeHit: (enemy: Enemy, damage: number) => void;
  onRangedAttack: (enemy: Enemy, origin: THREE.Vector3, target: THREE.Vector3) => void;
  onDeath: (enemy: Enemy, byHeat: boolean) => void;
  onSplash: (position: THREE.Vector3, strength: number) => void;
  onSubmergedAttack: (enemy: Enemy) => void;
}

export class Enemy {
  readonly type: EnemyType;
  readonly spec: EnemySpec;
  readonly group: THREE.Group;
  readonly visual: EnemyVisual;
  readonly hitRadius: number;
  readonly isBoss: boolean;

  hp: number;
  maxHp: number;
  state: EnemyState = 'patrol';
  stateTimer = 0;
  attackCooldown = randRange(0.3, 1.2);
  dead = false;
  shouldRemove = false;
  deathTimer = 0;
  byHeat = false;
  /** Wave enemies always hunt the player instead of patrolling. */
  aggressive = false;
  /** Seconds until this enemy can be rammed again. */
  ramCooldown = 0;

  private callbacks: EnemyCallbacks;
  private heading: number;
  private speed = 0;
  private patrolCenter = new THREE.Vector3();
  private patrolTarget = new THREE.Vector3();
  private patrolTimer = 0;
  private desiredDepth: number;
  private depth: number;
  private hitPulse = 0;
  private hurtTimer = 0;
  private baseScale: number;
  private healthBarGroup: THREE.Group;
  private healthFill: THREE.Sprite;
  private healthBg: THREE.Sprite;
  private eyeGlow = new THREE.Color();
  private phase: number;
  private lateralSign = Math.random() < 0.5 ? -1 : 1;
  private deathSpin = randRange(-1.5, 1.5);
  private homePosition: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    type: EnemyType,
    position: THREE.Vector3,
    hpScale: number,
    callbacks: EnemyCallbacks,
  ) {
    this.type = type;
    this.spec = ENEMIES[type];
    this.callbacks = callbacks;
    this.maxHp = Math.round(this.spec.hp * hpScale);
    this.hp = this.maxHp;
    this.hitRadius = this.spec.hitRadius;
    this.isBoss = !!this.spec.boss;
    this.baseScale = this.spec.scale;
    this.phase = Math.random() * Math.PI * 2;

    this.visual = createEnemyVisual(type);
    this.group = new THREE.Group();
    this.group.add(this.visual.group);
    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.group);

    this.heading = this.group.rotation.y;
    this.depth = this.spec.depth;
    this.desiredDepth = this.spec.depth;
    this.homePosition = position.clone();
    this.patrolCenter.copy(position);
    this.patrolTarget.copy(position);
    this.pickPatrolTarget();

    this.healthBarGroup = new THREE.Group();
    const bgMat = new THREE.SpriteMaterial({ color: 0x160d0c, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
    const fillMat = new THREE.SpriteMaterial({ color: 0xe0523d, transparent: true, opacity: 0.92, depthWrite: false, depthTest: false });
    this.healthBg = new THREE.Sprite(bgMat);
    this.healthBg.scale.set(2.7, 0.18, 1);
    this.healthFill = new THREE.Sprite(fillMat);
    this.healthFill.scale.set(2.56, 0.1, 1);
    this.healthBarGroup.add(this.healthBg, this.healthFill);
    this.healthBarGroup.visible = false;
    scene.add(this.healthBarGroup);

    const eyeMat = this.visual.glowParts[0]?.material as THREE.MeshStandardMaterial | undefined;
    if (eyeMat) this.eyeGlow.copy(eyeMat.emissive);
  }

  private pickPatrolTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = randRange(14, 45);
    this.patrolTarget.set(
      this.patrolCenter.x + Math.cos(angle) * radius,
      0,
      this.patrolCenter.z + Math.sin(angle) * radius,
    );
    this.patrolTimer = randRange(5, 10);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  getHitCenter(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.group.position);
  }

  getDisplayName(): string {
    return t(this.spec.name);
  }

  getStateLabel(): string {
    switch (this.state) {
      case 'patrol':
        return t('巡游');
      case 'chase':
        return t('追击');
      case 'attack':
        return t('攻击');
      case 'hurt':
        return t('受损');
      case 'dead':
        return t('已摧毁');
    }
  }

  update(dt: number, oceanTime: number, waveHeight: number, camera: THREE.Camera): void {
    this.phase += dt;
    this.hitPulse = Math.max(0, this.hitPulse - dt * 4.5);
    this.healthBg.material.opacity = 0.72;
    this.healthFill.material.opacity = 0.9;

    if (this.dead) {
      this.updateDeath(dt);
      return;
    }

    this.stateTimer += dt;
    this.attackCooldown -= dt;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);

    const player = this.callbacks.getPlayerPosition();
    const dx = player.x - this.group.position.x;
    const dz = player.z - this.group.position.z;
    const dist = Math.hypot(dx, dz);
    const playerAngle = Math.atan2(dx, dz);

    if (this.hurtTimer > 0) {
      this.state = 'hurt';
    } else if (dist < this.spec.detectRange || this.aggressive) {
      if (dist <= this.spec.attackRange) {
        this.state = 'attack';
      } else {
        this.state = 'chase';
      }
    } else {
      this.state = 'patrol';
    }

    let moveX = 0;
    let moveZ = 0;
    let targetSpeed = 0;

    if (this.state === 'patrol') {
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0 || Math.hypot(this.patrolTarget.x - this.group.position.x, this.patrolTarget.z - this.group.position.z) < 5) {
        this.pickPatrolTarget();
      }
      const pdx = this.patrolTarget.x - this.group.position.x;
      const pdz = this.patrolTarget.z - this.group.position.z;
      const pdist = Math.hypot(pdx, pdz);
      if (pdist > 0.5) {
        moveX = pdx / pdist;
        moveZ = pdz / pdist;
        targetSpeed = this.spec.speed * 0.36;
      }
      this.desiredDepth = this.spec.depth - 0.35 + Math.sin(this.phase * 0.8) * 0.35;
    } else if (this.state === 'chase') {
      moveX = dx / Math.max(dist, 0.01);
      moveZ = dz / Math.max(dist, 0.01);
      const angleOffset = Math.sin(this.phase * 0.9 + this.phase * 0.13) * 0.22;
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);
      const rx = moveX * cos - moveZ * sin;
      const rz = moveX * sin + moveZ * cos;
      moveX = rx;
      moveZ = rz;
      targetSpeed = this.spec.speed;
      this.desiredDepth = this.spec.depth - 0.2;
    } else if (this.state === 'attack') {
      const toPlayerX = dx / Math.max(dist, 0.01);
      const toPlayerZ = dz / Math.max(dist, 0.01);
      const idealRange = this.spec.attackRange * (this.spec.ranged ? 0.72 : 0.68);
      if (this.spec.ranged) {
        if (dist > this.spec.attackRange * 0.9) {
          moveX = toPlayerX;
          moveZ = toPlayerZ;
        } else if (dist < this.spec.attackRange * 0.45) {
          moveX = -toPlayerX;
          moveZ = -toPlayerZ;
        } else {
          moveX = toPlayerZ * this.lateralSign;
          moveZ = -toPlayerX * this.lateralSign;
        }
        targetSpeed = this.spec.speed * 0.65;
      } else {
        if (dist > idealRange) {
          moveX = toPlayerX;
          moveZ = toPlayerZ;
        } else {
          moveX = toPlayerZ * this.lateralSign * 0.7;
          moveZ = -toPlayerX * this.lateralSign * 0.7;
        }
        targetSpeed = this.spec.speed * 0.55;
      }
      this.desiredDepth = -0.35;

      if (this.attackCooldown <= 0) {
        this.performAttack(player);
      }
    } else if (this.state === 'hurt') {
      moveX = -dx / Math.max(dist, 0.01);
      moveZ = -dz / Math.max(dist, 0.01);
      targetSpeed = this.spec.speed * 0.25;
      this.desiredDepth = -0.6;
    }

    // Gentle avoidance of islands is handled by patrol radius. Keep enemies inside world.
    const worldDist = Math.hypot(this.group.position.x, this.group.position.z);
    if (worldDist > 390) {
      moveX -= this.group.position.x / worldDist;
      moveZ -= this.group.position.z / worldDist;
      const len = Math.hypot(moveX, moveZ) || 1;
      moveX /= len;
      moveZ /= len;
    }

    this.speed = damp(this.speed, targetSpeed, 2.8, dt);
    if (Math.hypot(moveX, moveZ) > 0.01) {
      this.heading += angleDelta(this.heading, Math.atan2(moveX, moveZ)) * Math.min(1, dt * 3.2);
    }

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    this.group.position.x += (this.speed * forwardX + moveX * 0.22) * dt;
    this.group.position.z += (this.speed * forwardZ + moveZ * 0.22) * dt;

    const targetY = waveHeight + this.desiredDepth + Math.sin(this.phase * 1.3) * 0.15;
    this.group.position.y = damp(this.group.position.y, targetY, this.state === 'attack' ? 3.5 : 2.2, dt);

    this.group.rotation.y = this.heading;
    this.group.rotation.x = damp(
      this.group.rotation.x,
      clamp((targetY - this.group.position.y) * 0.05, -0.12, 0.12),
      2,
      dt,
    );
    this.group.rotation.z = Math.sin(this.phase * 1.1) * 0.035;

    // Hit reaction scale pulse.
    const scale = this.baseScale * (1 + this.hitPulse * 0.12);
    this.visual.group.scale.setScalar(scale);

    this.animateModel(dt, oceanTime);

    // Health bar as a separate scene object so it always faces the camera.
    this.healthBarGroup.position.copy(this.group.position);
    this.healthBarGroup.position.y += (this.spec.boss ? 5.8 : this.type === 'armoredShark' ? 3.3 : 2.3);
    const barDist = this.healthBarGroup.position.distanceTo(camera.position);
    const show = barDist < 85 && (this.hp < this.maxHp || this.isBoss || barDist < 45);
    this.healthBarGroup.visible = show;
    const ratio = clamp(this.hp / this.maxHp, 0, 1);
    this.healthFill.scale.x = 2.56 * ratio;
    this.healthFill.position.x = -(2.56 * (1 - ratio)) / 2;
    (this.healthBg.material as THREE.SpriteMaterial).color.setHex(this.isBoss ? 0x26100c : 0x120e0d);
    (this.healthFill.material as THREE.SpriteMaterial).color.setHex(this.type === 'armoredShark' ? 0xeb6742 : this.isBoss ? 0xff8b28 : 0xe0523d);
  }

  private performAttack(player: THREE.Vector3): void {
    this.attackCooldown = this.spec.attackCooldown * randRange(0.88, 1.16);

    if (this.spec.ranged) {
      const origin = new THREE.Vector3();
      this.visual.glowParts[0]?.getWorldPosition(origin);
      if (origin.lengthSq() < 0.01) origin.copy(this.group.position);
      this.callbacks.onRangedAttack(this, origin, new THREE.Vector3(player.x, 1.7, player.z));
      this.callbacks.onSubmergedAttack(this);
    } else {
      this.callbacks.onMeleeHit(this, this.spec.damage);
      this.callbacks.onSplash(this.group.position.clone(), 0.8);
      this.hitPulse = 0.12;
    }
  }

  private animateModel(dt: number, time: number): void {
    if (this.visual.tail) {
      this.visual.tail.rotation.y = Math.sin(time * 6 + this.phase) * 0.38;
    }
    if (this.visual.jaw) {
      this.visual.jaw.rotation.x = Math.max(0, Math.sin(time * 3 + this.phase)) * (this.state === 'attack' ? 0.4 : 0.12);
    }
    this.visual.glowParts.forEach((part, i) => {
      const mat = part.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.6 + Math.sin(time * 3.2 + this.phase + i) * 0.45 + (this.state === 'attack' ? 1 : 0);
    });
    if (this.visual.tentacles.length) {
      this.visual.tentacles.forEach((tentacle, i) => {
        const rootAngle = tentacle.userData.baseAngle as number;
        tentacle.rotation.y = -rootAngle + Math.sin(time * 0.9 + i + this.phase) * 0.2;
        tentacle.rotation.x = Math.sin(time * 1.2 + i * 0.8) * 0.1;
        tentacle.children.forEach((child, s) => {
          child.rotation.z = 0.22 + s * 0.035 + Math.sin(time * 2 + i * 1.3 + s * 0.8) * 0.18;
          child.rotation.x = Math.cos(time * 1.6 + i + s * 0.6) * 0.09;
        });
      });
    }
    if (this.visual.coreGlow) {
      const s = 3.1 + Math.sin(time * 4 + this.phase) * 0.4;
      this.visual.coreGlow.scale.setScalar(s);
    }
    if (this.type === 'corrodedFish') {
      this.visual.group.rotation.z = Math.sin(time * 2.4 + this.phase) * 0.08;
    }
  }

  takeDamage(amount: number, crit: boolean, byHeat = false): { killed: boolean; dealt: number } {
    if (this.dead) return { killed: false, dealt: 0 };
    const dealt = amount * (1 - this.spec.armor);
    this.hp -= dealt;
    this.hitPulse = crit ? 0.45 : 0.3;
    this.hurtTimer = crit ? 0.35 : 0.18;
    if (this.hp <= 0) {
      this.die(byHeat);
      return { killed: true, dealt };
    }
    return { killed: false, dealt };
  }

  /** Shove the enemy horizontally (used by boat ramming). */
  knockback(dirX: number, dirZ: number, distance: number): void {
    if (this.dead) return;
    this.group.position.x += dirX * distance;
    this.group.position.z += dirZ * distance;
    this.speed = 0;
  }

  killByHeat(): void {
    if (this.dead) return;
    this.die(true);
  }

  private die(byHeat: boolean): void {
    if (this.dead) return;
    this.dead = true;
    this.byHeat = byHeat;
    this.state = 'dead';
    this.hp = 0;
    this.deathTimer = 3.4;
    this.healthBarGroup.visible = false;
    this.callbacks.onDeath(this, byHeat);
  }

  private updateDeath(dt: number): void {
    this.deathTimer -= dt;
    this.group.position.y -= dt * (0.55 + (1 - this.deathTimer / 3.4) * 0.6);
    this.group.rotation.z += this.deathSpin * dt;
    this.group.rotation.x += dt * 0.35;
    const scale = Math.max(0.25, 1 - Math.max(0, 0.5 - this.deathTimer) * 1.4);
    this.visual.group.scale.setScalar(this.baseScale * scale);
    this.healthBarGroup.visible = false;
    if (this.deathTimer <= 0) this.shouldRemove = true;
  }

  cleanup(scene: THREE.Scene): void {
    scene.remove(this.group);
    scene.remove(this.healthBarGroup);
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    (this.healthBg.material as THREE.Material).dispose();
    (this.healthFill.material as THREE.Material).dispose();
  }

  distanceToPlayerHorizontal(player: THREE.Vector3): number {
    return Math.hypot(player.x - this.group.position.x, player.z - this.group.position.z);
  }
}
