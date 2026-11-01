/** Central gameplay tuning. Everything that affects combat, handling or survival lives here. */

export type EnemyType = 'corrodedFish' | 'armoredShark' | 'mechOctopus';
export type UpgradeKey = 'armor' | 'hull' | 'damage' | 'frequency' | 'crit' | 'power';
export type ItemId = 'meat' | 'water' | 'diesel' | 'metal' | 'bandage' | 'painkiller' | 'regen';
export type ItemMap = Record<ItemId, number>;

export interface IslandSpec {
  x: number;
  z: number;
  radius: number;
  height: number;
  seed: number;
  palms: number;
  rocks: number;
}

export interface EnemySpec {
  name: string;
  shortName: string;
  hp: number;
  speed: number;
  detectRange: number;
  attackRange: number;
  damage: number;
  attackCooldown: number;
  xp: number;
  hitRadius: number;
  scale: number;
  armor: number;
  depth: number;
  color: [number, number];
  glow: number;
  weight: number;
  boss?: boolean;
  ranged?: boolean;
}

export const WORLD = {
  playRadius: 410,
  oceanSize: 2200,
  oceanSegments: 300,
  spawnRadiusMin: 78,
  spawnRadiusMax: 165,
  initialSpawnDelay: 4,
  maxEnemies: 32,
  initialEnemyLimit: 2,
  enemyGrowthInterval: 10,
  enemyGrowthFactor: 1.5,
  spawnInterval: 8.0,
  islandSafeZone: 26,
  fogColor: 0xa9cbd5,
  fogDensity: 0.0036,
  skyTop: 0x4d98c6,
  skyHorizon: 0xd6e5df,
  sunColor: 0xffe3b0,
};

export const OCEAN = {
  waveA: { amp: 0.9, freqX: 0.045, freqZ: 0.016, speed: 1.05 },
  waveB: { amp: 0.56, freqX: -0.022, freqZ: 0.068, speed: 1.34 },
  waveC: { amp: 0.24, freqX: 0.11, freqZ: 0.085, speed: 2.05 },
  waveD: { amp: 1.08, freqX: 0.014, freqZ: -0.031, speed: 0.52 },
  waterDeep: 0x0b3546,
  waterShallow: 0x247f86,
  waterFoam: 0xd3efe6,
  waveTint: 0x2e97a0,
};

export const BOAT = {
  maxHp: 200,
  length: 8.8,
  width: 3.3,
  maxForwardSpeed: 16.5,
  maxReverseSpeed: 5.8,
  acceleration: 8.2,
  brakePower: 16,
  reverseAcceleration: 4.8,
  dragForward: 0.34,
  dragSide: 1.2,
  throttleResponse: 1.8,
  throttleDecay: 1.1,
  rudderResponse: 2.4,
  maxRudder: 1,
  turnRate: 1.35,
  minSteerAuthority: 0.72,
  fuelMax: 100,
  fuelIdleBurn: 0.06,
  fuelThrottleBurn: 0.28,
  sampleHalfLength: 3.6,
  sampleHalfWidth: 1.5,
  waveResponse: 0.86,
  bobOffset: 0.48,
  collisionRadius: 5.2,
};

export const CAMERA = {
  fov: 63,
  near: 0.1,
  far: 1500,
  distance: 18.5,
  defaultPitch: 0.285,
  minPitch: -0.08,
  maxPitch: 0.95,
  orbitRange: Math.PI, // Full 360° orbit
  height: 5.4,
  lookAhead: 14,
  smoothing: 5.6,
  aimSmoothing: 12,
  zoomMin: 9,
  zoomMax: 32,
};

export const COMBAT = {
  baseDamage: 22,
  baseInterval: 0.38,
  projectileSpeed: 175,
  projectileLife: 2.8,
  projectileRadius: 0.18,
  spreadBase: 0.0035,
  painSpread: 0.02,
  heatPerHit: 6.5,
  heatPerCrit: 10,
  heatPassivePerSecond: 3, // +3% per second passive heat generation
  heatMax: 100,
  awakeningBaseDuration: 5,
  awakeningRadius: 30,
  critDurationPerPoint: 0.1,
  critMultiplier: 10,
  aimAssistRadius: 1.15,
  autoAttackRange: 145,
  counterAttackRange: 160,
  counterAttackDuration: 6.5,
};

/** Shift boost: short burst of speed that can be used to dodge and ram. */
export const BOOST = {
  maxEnergy: 100,
  drainPerSecond: 34,
  regenPerSecond: 20,
  regenDelay: 0.8,
  minToStart: 18,
  speedMultiplier: 1.65,
  accelMultiplier: 2.6,
  fovKick: 9,
  ramMinSpeed: 9,
  ramBaseDamage: 70,
  ramCooldown: 0.9,
  ramKnockback: 9,
  ramSelfDamage: 2,
};

/** Q salvo: a fan of shells fired toward the aim point. */
export const SALVO = {
  cooldown: 7,
  shells: 7,
  spreadRadians: 0.26,
  damageMultiplier: 0.85,
};

/** Kill-chain combo. Each kill inside the window raises the XP / score multiplier. */
export const COMBO = {
  window: 4.5,
  stepMultiplier: 0.25,
  maxMultiplier: 3,
  milestones: [3, 5, 8, 12, 20, 30] as readonly number[],
};

/** Tide waves: periodic aggressive surges with a reward when cleared. */
export const WAVES = {
  firstDelay: 40,
  interval: 70,
  baseCount: 2,
  maxCount: 9,
  bossEvery: 4,
  clearXpPerWave: 35,
  clearHealRatio: 0.15,
};

export const PROGRESSION = {
  baseXp: 72,
  xpGrowth: 1.34,
  baseCritChance: 0.05,
  passivePointInterval: 1,
  passivePointsPerInterval: 10,
  upgrades: {
    armor: {
      name: '装甲',
      glyph: '▣',
      description: '加固船壳与关键舱室，降低所有来源的伤害。',
      perLevel: 0.05,
      maxLevel: 1000,
      accent: '#78a8cc',
      format: (level: number) => `${Math.min(99, Math.round((1 - Math.pow(0.95, level)) * 100))}% 减伤`,
    },
    hull: {
      name: '耐久',
      glyph: '▤',
      description: '焊接隔水舱，提高渔船最大船体值并立即修复新增部分。',
      perLevel: 35,
      maxLevel: 1000,
      accent: '#d6bd72',
      format: (level: number) => `+${level * 35} 最大船体`,
    },
    damage: {
      name: '攻击',
      glyph: '✦',
      description: '更换炮管与高爆弹头，提高主炮的基础伤害。',
      perLevel: 0.12,
      maxLevel: 1000,
      accent: '#ec8d54',
      format: (level: number) => `+${Math.round(level * 12)}% 武器伤害`,
    },
    frequency: {
      name: '频率',
      glyph: '≋',
      description: '优化装填机构，缩短主炮射击间隔。',
      perLevel: 0.08,
      maxLevel: 1000,
      accent: '#67d4b8',
      format: (level: number) => `+${Math.round(level * 8)}% 攻击速度`,
    },
    crit: {
      name: '暴击',
      glyph: '◇',
      description: '校准火控核心。暴击造成 10 倍伤害，并为热力觉醒延长持续时间。',
      perLevel: 0.03,
      maxLevel: 1000,
      accent: '#e8c15f',
      format: (level: number) => `${Math.min(99, Math.round((1 - (1 - PROGRESSION.baseCritChance) * Math.pow(0.97, level)) * 100))}% 暴击率`,
    },
    power: {
      name: '动力',
      glyph: '⚡',
      description: '改装涡轮增压柴油机与推进螺旋桨，提升渔船移动速度、加速与转向灵敏度。',
      perLevel: 0.12,
      maxLevel: 1000,
      accent: '#4cd6e8',
      format: (level: number) => `+${Math.round(level * 12)}% 移动速度`,
    },
  },
} as const;

export const SURVIVAL = {
  maxHp: BOAT.maxHp,
  maxHunger: 100,
  maxThirst: 100,
  hungerDecay: 0.075,
  thirstDecay: 0.105,
  starvationDamage: 0.65,
  dehydrationDamage: 0.9,
  bleedDamage: 1.35,
  bleedChance: 0.26,
  painChance: 0.2,
  painDuration: 24,
  painDamagePenalty: 0.18,
  painHandlingPenalty: 0.22,
  regenPerSecond: 7.5,
  regenDuration: 6,
  pickupRadius: 12.5,
  magnetRadius: 24,
  magnetSpeed: 15,
  lootLifetime: 110,
  autosaveSeconds: 20,
};

export const ITEMS: Record<
  ItemId,
  {
    name: string;
    short: string;
    glyph: string;
    color: string;
    description: string;
    action: string;
    maxStack: number;
  }
> = {
  meat: {
    name: '生肉',
    short: '生肉',
    glyph: '◭',
    color: '#c97b64',
    description: '来历不明的海兽肉。恢复 28 点饥饿，有轻微感染风险。',
    action: '食用',
    maxStack: 20,
  },
  water: {
    name: '淡水',
    short: '淡水',
    glyph: '◒',
    color: '#63cfe1',
    description: '经过过滤的淡水。恢复 38 点口渴值。',
    action: '饮用',
    maxStack: 20,
  },
  diesel: {
    name: '柴油',
    short: '柴油',
    glyph: '⛽',
    color: '#d8c755',
    description: '浑浊但可燃的船用柴油。为渔船补充 30 点燃油。',
    action: '加注',
    maxStack: 20,
  },
  metal: {
    name: '金属零件',
    short: '零件',
    glyph: '⚙',
    color: '#9aabac',
    description: '锈蚀但可用的零件。修复 38 点船体损伤。',
    action: '维修',
    maxStack: 20,
  },
  bandage: {
    name: '绷带',
    short: '绷带',
    glyph: '✚',
    color: '#e5d9ca',
    description: '止血绷带。立即停止流血，并恢复 8 点船体。',
    action: '包扎',
    maxStack: 12,
  },
  painkiller: {
    name: '止痛药',
    short: '止痛',
    glyph: '⊕',
    color: '#a5d7e6',
    description: '强效止痛药。解除疼痛负面状态。',
    action: '服用',
    maxStack: 12,
  },
  regen: {
    name: '再生药剂',
    short: '再生',
    glyph: '♻',
    color: '#73d993',
    description: '持续 6 秒，每秒恢复 7.5 点船体。',
    action: '注射',
    maxStack: 12,
  },
};

export const ENEMIES: Record<EnemyType, EnemySpec> = {
  corrodedFish: {
    name: '腐蚀机械鱼',
    shortName: '机械鱼',
    hp: 46,
    speed: 7.4,
    detectRange: 82,
    attackRange: 9.2,
    damage: 5,
    attackCooldown: 1.15,
    xp: 20,
    hitRadius: 1.7,
    scale: 1,
    armor: 0,
    depth: -1.15,
    color: [0x5d6d68, 0x9a5a39],
    glow: 0xff813d,
    weight: 58,
  },
  armoredShark: {
    name: '装甲变异鲨鱼',
    shortName: '装甲鲨',
    hp: 145,
    speed: 6.1,
    detectRange: 118,
    attackRange: 14,
    damage: 16,
    attackCooldown: 2.35,
    xp: 65,
    hitRadius: 2.7,
    scale: 1,
    armor: 0.12,
    depth: -1.7,
    color: [0x414e4e, 0x7e4634],
    glow: 0xff3d2e,
    weight: 31,
  },
  mechOctopus: {
    name: '深海机械章鱼',
    shortName: '机械章鱼',
    hp: 310,
    speed: 3.5,
    detectRange: 155,
    attackRange: 55,
    damage: 11,
    attackCooldown: 1.75,
    xp: 135,
    hitRadius: 3.5,
    scale: 1,
    armor: 0.06,
    depth: -2.2,
    color: [0x3c4f56, 0x985332],
    glow: 0xffb33d,
    weight: 11,
    ranged: true,
    boss: true,
  },
};

export interface DropEntry {
  item: ItemId;
  min: number;
  max: number;
  chance: number;
}

export const DROP_TABLES: Record<EnemyType, DropEntry[]> = {
  corrodedFish: [
    { item: 'meat', min: 1, max: 2, chance: 0.58 },
    { item: 'metal', min: 1, max: 2, chance: 0.42 },
    { item: 'water', min: 1, max: 1, chance: 0.12 },
  ],
  armoredShark: [
    { item: 'meat', min: 2, max: 3, chance: 0.92 },
    { item: 'metal', min: 1, max: 3, chance: 0.7 },
    { item: 'diesel', min: 1, max: 1, chance: 0.38 },
    { item: 'bandage', min: 1, max: 1, chance: 0.22 },
  ],
  mechOctopus: [
    { item: 'metal', min: 3, max: 5, chance: 1 },
    { item: 'diesel', min: 1, max: 2, chance: 0.9 },
    { item: 'regen', min: 1, max: 1, chance: 0.6 },
    { item: 'painkiller', min: 1, max: 1, chance: 0.45 },
    { item: 'water', min: 1, max: 2, chance: 0.65 },
    { item: 'bandage', min: 1, max: 1, chance: 0.5 },
  ],
};

export const ISLANDS: IslandSpec[] = [
  { x: -92, z: -72, radius: 25, height: 11, seed: 12, palms: 13, rocks: 18 },
  { x: 128, z: 36, radius: 17, height: 7.5, seed: 49, palms: 8, rocks: 12 },
  { x: 58, z: -184, radius: 34, height: 16, seed: 77, palms: 16, rocks: 24 },
  { x: -208, z: 118, radius: 29, height: 13, seed: 103, palms: 15, rocks: 19 },
  { x: 191, z: -116, radius: 22, height: 9.5, seed: 151, palms: 9, rocks: 14 },
  { x: -36, z: 232, radius: 40, height: 19, seed: 201, palms: 21, rocks: 28 },
];

export interface SaveData {
  version: number;
  timestamp: number;
  playTime: number;
  kills: number;
  playerX: number;
  playerZ: number;
  heading: number;
  level: number;
  xp: number;
  points: number;
  passivePointTimer?: number;
  upgrades: Record<UpgradeKey, number>;
  hp: number;
  hunger: number;
  thirst: number;
  fuel: number;
  inventory: Partial<ItemMap>;
  heat: number;
  maxHeatReached: number;
  autoAttack?: boolean;
  autoCounter?: boolean;
  score?: number;
  wave?: number;
  waveTimer?: number;
  bestCombo?: number;
}

export const GAME_VERSION = 2;
