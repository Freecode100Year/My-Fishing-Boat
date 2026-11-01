import * as THREE from 'three';
import type { Boat } from '../boat/Boat';
import type { EnemyManager } from '../enemies/EnemyManager';
import { COMBAT } from '../config/balance';

export interface HeatCallbacks {
  onStart: (duration: number, radius: number) => void;
  onEnd: () => void;
  onKill: (position: THREE.Vector3) => void;
  onTick?: (timeLeft: number) => void;
}

export class HeatAbility {
  heat = 0;
  active = false;
  timer = 0;
  duration = 0;
  radius = COMBAT.awakeningRadius;
  totalKills = 0;

  private callbacks: HeatCallbacks;
  private tickTimer = 0;

  constructor(callbacks: HeatCallbacks) {
    this.callbacks = callbacks;
  }

  reset(): void {
    this.heat = 0;
    this.active = false;
    this.timer = 0;
    this.duration = 0;
    this.totalKills = 0;
    this.tickTimer = 0;
  }

  addHit(crit: boolean, duration = COMBAT.awakeningBaseDuration): void {
    if (this.active) return;
    this.heat = Math.min(COMBAT.heatMax, this.heat + (crit ? COMBAT.heatPerCrit : COMBAT.heatPerHit));
    if (this.heat >= COMBAT.heatMax) {
      this.trigger(duration);
    }
  }

  trigger(duration: number): void {
    if (this.active) return;
    this.duration = duration;
    this.timer = duration;
    this.active = true;
    this.heat = COMBAT.heatMax;
    this.callbacks.onStart(duration, this.radius);
  }

  update(
    dt: number,
    boat: Boat,
    enemies: EnemyManager,
    gameActive: boolean,
    awakeningDuration = COMBAT.awakeningBaseDuration,
  ): void {
    if (!gameActive) return;

    if (!this.active) {
      // Passive heat increase: +3% per second
      this.heat = Math.min(COMBAT.heatMax, this.heat + COMBAT.heatPassivePerSecond * dt);
      if (this.heat >= COMBAT.heatMax) {
        this.trigger(awakeningDuration);
      } else {
        return;
      }
    }

    this.timer -= dt;
    this.tickTimer -= dt;
    this.callbacks.onTick?.(Math.max(0, this.timer));

    if (this.tickTimer <= 0) {
      this.tickTimer = 0.08;
      const center = boat.group.position;
      for (const enemy of enemies.enemies) {
        if (enemy.dead) continue;
        const dx = enemy.group.position.x - center.x;
        const dz = enemy.group.position.z - center.z;
        if (dx * dx + dz * dz <= this.radius * this.radius) {
          enemy.killByHeat();
          this.totalKills++;
          this.callbacks.onKill(enemy.group.position.clone());
        }
      }
    }

    if (this.timer <= 0) {
      this.active = false;
      this.timer = 0;
      this.heat = 0;
      this.tickTimer = 0;
      this.callbacks.onEnd();
    }
  }

  get ratio(): number {
    return this.heat / COMBAT.heatMax;
  }

  get timeRatio(): number {
    return this.duration > 0 ? Math.max(0, this.timer / this.duration) : 0;
  }
}
