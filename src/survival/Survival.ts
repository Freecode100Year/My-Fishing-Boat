import { BOAT, SURVIVAL } from '../config/balance';
import { clamp } from '../utils/math';

export class Survival {
  hp = BOAT.maxHp;
  maxHp = BOAT.maxHp;
  hunger = 100;
  thirst = 100;
  fuel = BOAT.fuelMax;
  bleeding = false;
  painTimer = 0;
  regenTimer = 0;
  dead = false;

  onDamage?: (amount: number) => void;
  onDeath?: () => void;

  reset(): void {
    this.hp = BOAT.maxHp;
    this.maxHp = BOAT.maxHp;
    this.hunger = 100;
    this.thirst = 100;
    this.fuel = BOAT.fuelMax;
    this.bleeding = false;
    this.painTimer = 0;
    this.regenTimer = 0;
    this.dead = false;
  }

  get painActive(): boolean {
    return this.painTimer > 0;
  }

  get hpRatio(): number {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get handlingPenalty(): number {
    return this.painActive ? 1 - SURVIVAL.painHandlingPenalty : 1;
  }

  get damagePenalty(): number {
    return this.painActive ? 1 - SURVIVAL.painDamagePenalty : 1;
  }

  setMaxHp(maxHp: number, healDifference: boolean): void {
    const delta = maxHp - this.maxHp;
    this.maxHp = maxHp;
    if (healDifference && delta > 0) this.hp += delta;
    this.hp = clamp(this.hp, 0, maxHp);
  }

  tick(dt: number): void {
    if (this.dead) return;

    this.hunger = clamp(this.hunger - SURVIVAL.hungerDecay * dt, 0, 100);
    this.thirst = clamp(this.thirst - SURVIVAL.thirstDecay * dt, 0, 100);

    let drain = 0;
    if (this.hunger <= 0) drain += SURVIVAL.starvationDamage;
    if (this.thirst <= 0) drain += SURVIVAL.dehydrationDamage;
    if (this.bleeding) drain += SURVIVAL.bleedDamage;

    if (drain > 0) {
      this.hp -= drain * dt;
      if (drain >= 0.5) this.onDamage?.(drain * dt);
    }

    if (this.regenTimer > 0) {
      this.regenTimer = Math.max(0, this.regenTimer - dt);
      this.hp = Math.min(this.maxHp, this.hp + SURVIVAL.regenPerSecond * dt);
    }

    if (this.painTimer > 0) this.painTimer = Math.max(0, this.painTimer - dt);

    this.hp = clamp(this.hp, 0, this.maxHp);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath?.();
    }
  }

  damage(raw: number, armor: number, canBleed = true, canPain = true): number {
    if (this.dead) return 0;
    const dealt = raw * (1 - armor);
    this.hp = clamp(this.hp - dealt, 0, this.maxHp);
    this.onDamage?.(dealt);
    if (canBleed && Math.random() < SURVIVAL.bleedChance) this.bleeding = true;
    if (canPain && Math.random() < SURVIVAL.painChance) this.painTimer = SURVIVAL.painDuration;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath?.();
    }
    return dealt;
  }

  heal(amount: number): number {
    const before = this.hp;
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
    return this.hp - before;
  }

  feed(amount: number): void {
    this.hunger = clamp(this.hunger + amount, 0, 100);
  }

  hydrate(amount: number): void {
    this.thirst = clamp(this.thirst + amount, 0, 100);
  }

  refuel(amount: number): void {
    this.fuel = clamp(this.fuel + amount, 0, BOAT.fuelMax);
  }

  stopBleeding(): void {
    this.bleeding = false;
  }

  curePain(): void {
    this.painTimer = 0;
  }

  startRegen(): void {
    this.regenTimer = SURVIVAL.regenDuration;
  }

  applyBleed(): void {
    this.bleeding = true;
  }

  applyPain(seconds = SURVIVAL.painDuration): void {
    this.painTimer = Math.max(this.painTimer, seconds);
  }

  consumeFuel(dt: number, throttle: number, speedRatio: number): void {
    if (this.dead) return;
    if (Math.abs(throttle) < 0.02) {
      this.fuel = clamp(this.fuel - BOAT.fuelIdleBurn * dt, 0, BOAT.fuelMax);
    } else {
      this.fuel = clamp(this.fuel - (BOAT.fuelThrottleBurn * Math.abs(throttle) + speedRatio * 0.05) * dt, 0, BOAT.fuelMax);
    }
  }

  serialize(): { hp: number; hunger: number; thirst: number; fuel: number; bleeding: boolean; painTimer: number } {
    return {
      hp: this.hp,
      hunger: this.hunger,
      thirst: this.thirst,
      fuel: this.fuel,
      bleeding: this.bleeding,
      painTimer: this.painTimer,
    };
  }

  load(
    data: {
      hp: number;
      hunger: number;
      thirst: number;
      fuel: number;
      bleeding?: boolean;
      painTimer?: number;
    },
    maxHp: number,
  ): void {
    this.maxHp = maxHp;
    this.hp = clamp(data.hp ?? BOAT.maxHp, 0, maxHp);
    this.hunger = clamp(data.hunger ?? 100, 0, 100);
    this.thirst = clamp(data.thirst ?? 100, 0, 100);
    this.fuel = clamp(data.fuel ?? BOAT.fuelMax, 0, BOAT.fuelMax);
    this.bleeding = data.bleeding ?? false;
    this.painTimer = data.painTimer ?? 0;
    this.regenTimer = 0;
    this.dead = this.hp <= 0;
  }
}
