import {
  COMBAT,
  ENEMIES,
  EnemyType,
  PROGRESSION,
  UpgradeKey,
  SaveData,
} from '../config/balance';
import { clamp } from '../utils/math';

export interface PlayerStats {
  maxHp: number;
  armor: number;
  damageMultiplier: number;
  fireRateMultiplier: number;
  critChance: number;
  speedMultiplier: number;
  awakeningDuration: number;
}

export class Progression {
  level = 1;
  xp = 0;
  points = 0;
  passivePointTimer = 0;
  upgrades: Record<UpgradeKey, number> = {
    armor: 0,
    hull: 0,
    damage: 0,
    frequency: 0,
    crit: 0,
    power: 0,
  };

  onXpGain?: (amount: number) => void;
  onLevelUp?: (level: number, points: number) => void;
  onPassivePoints?: (added: number, totalPoints: number) => void;
  onUpgrade?: (key: UpgradeKey) => void;

  reset(): void {
    this.level = 1;
    this.xp = 0;
    this.points = 0;
    this.passivePointTimer = 0;
    this.upgrades = {
      armor: 0,
      hull: 0,
      damage: 0,
      frequency: 0,
      crit: 0,
      power: 0,
    };
  }

  get xpRequired(): number {
    return Math.floor(PROGRESSION.baseXp * Math.pow(this.level, PROGRESSION.xpGrowth));
  }

  get passivePointProgress(): number {
    return clamp(this.passivePointTimer / PROGRESSION.passivePointInterval, 0, 1);
  }

  get passivePointTimeLeft(): number {
    return Math.max(0, PROGRESSION.passivePointInterval - this.passivePointTimer);
  }

  get stats(): PlayerStats {
    const u = this.upgrades;
    const critChance = clamp(PROGRESSION.baseCritChance + u.crit * PROGRESSION.upgrades.crit.perLevel, 0, 0.95);
    const speedMultiplier = 1 + (u.power ?? 0) * PROGRESSION.upgrades.power.perLevel;
    return {
      maxHp: 200 + u.hull * PROGRESSION.upgrades.hull.perLevel,
      armor: clamp(u.armor * PROGRESSION.upgrades.armor.perLevel, 0, 0.65),
      damageMultiplier: 1 + u.damage * PROGRESSION.upgrades.damage.perLevel,
      fireRateMultiplier: 1 + u.frequency * PROGRESSION.upgrades.frequency.perLevel,
      critChance,
      speedMultiplier,
      awakeningDuration:
        COMBAT.awakeningBaseDuration + critChance * 100 * COMBAT.critDurationPerPoint,
    };
  }

  /** Skill points increase by 2 points per minute (1 point every 30s). */
  tick(dt: number, active: boolean): void {
    if (!active) return;
    this.passivePointTimer += dt;
    let added = 0;
    while (this.passivePointTimer >= PROGRESSION.passivePointInterval) {
      this.passivePointTimer -= PROGRESSION.passivePointInterval;
      this.points += 1;
      added += 1;
    }
    if (added > 0) {
      this.onPassivePoints?.(added, this.points);
    }
  }

  xpForEnemy(type: EnemyType, levelScale = 1): number {
    return Math.round(ENEMIES[type].xp * levelScale);
  }

  addXp(amount: number): number {
    if (amount <= 0) return 0;
    this.xp += amount;
    this.onXpGain?.(amount);
    let gained = 0;
    while (this.xp >= this.xpRequired) {
      this.xp -= this.xpRequired;
      this.level++;
      this.points++;
      gained++;
      this.onLevelUp?.(this.level, this.points);
    }
    return gained;
  }

  canUpgrade(key: UpgradeKey): boolean {
    return this.points > 0 && this.upgrades[key] < PROGRESSION.upgrades[key].maxLevel;
  }

  upgrade(key: UpgradeKey): boolean {
    if (!this.canUpgrade(key)) return false;
    this.upgrades[key]++;
    this.points--;
    this.onUpgrade?.(key);
    return true;
  }

  serialize(): Pick<SaveData, 'level' | 'xp' | 'points' | 'passivePointTimer' | 'upgrades'> {
    return {
      level: this.level,
      xp: this.xp,
      points: this.points,
      passivePointTimer: this.passivePointTimer,
      upgrades: { ...this.upgrades },
    };
  }

  load(data: Partial<Pick<SaveData, 'level' | 'xp' | 'points' | 'passivePointTimer' | 'upgrades'>>): void {
    this.level = Math.max(1, (data.level ?? 1) | 0);
    this.xp = Math.max(0, data.xp || 0);
    this.points = Math.max(0, (data.points ?? 0) | 0);
    this.passivePointTimer = clamp(data.passivePointTimer ?? 0, 0, PROGRESSION.passivePointInterval - 0.01);
    const maxes = PROGRESSION.upgrades;
    (Object.keys(this.upgrades) as UpgradeKey[]).forEach((k) => {
      const raw = data.upgrades?.[k] ?? (k === 'power' ? (data.upgrades as Record<string, number> | undefined)?.mobility : 0) ?? 0;
      this.upgrades[k] = clamp(Math.floor(raw), 0, maxes[k].maxLevel);
    });
  }
}
