import * as THREE from 'three';
import { BOAT, BOOST, CAMERA, COMBO, EnemyType, ItemId, PROGRESSION, SALVO, SaveData, UpgradeKey, WAVES, WORLD } from '../config/balance';
import { Input } from './Input';
import { EventBus } from './EventBus';
import { Ocean } from '../world/Ocean';
import { Sky } from '../world/Sky';
import { Islands } from '../world/Islands';
import { SupplyCrates } from '../world/SupplyCrates';
import { GLTFAssetLoader } from '../assets/GLTFAssetLoader';
import { Boat } from '../boat/Boat';
import { FollowCamera } from '../camera/FollowCamera';
import { Effects } from '../effects/Effects';
import { Progression } from '../progression/Progression';
import { Survival } from '../survival/Survival';
import { Inventory } from '../inventory/Inventory';
import { LootManager } from '../inventory/LootManager';
import { EnemyManager } from '../enemies/EnemyManager';
import type { Enemy } from '../enemies/Enemy';
import { Combat } from '../combat/Combat';
import { HeatAbility } from '../abilities/HeatAbility';
import { HeatFX } from '../abilities/HeatFX';
import { AudioManager } from '../audio/AudioManager';
import { SaveSystem } from '../save/SaveSystem';
import { UI, HUDState, TargetInfo } from '../ui/UI';
import { clamp, damp } from '../utils/math';

type GameState = 'menu' | 'playing' | 'paused' | 'upgrade' | 'inventory' | 'help' | 'gameover';

interface Settings {
  volume: number;
  quality: 'high' | 'medium' | 'low';
  sensitivity: number;
  autoAttack: boolean;
  autoCounter: boolean;
}

const SETTINGS_KEY = 'rattide.settings.v2';
const LEGACY_SETTINGS_KEY = 'rattide.settings.v1';
const BEST_SCORE_KEY = 'rattide.best.v1';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private clock = new THREE.Clock();
  private input: Input;
  private events = new EventBus();

  private ocean: Ocean;
  private sky: Sky;
  private islands: Islands;
  private supplyCrates: SupplyCrates;
  private assets = new GLTFAssetLoader();
  private boat: Boat;
  private followCamera: FollowCamera;
  private effects: Effects;
  private progression = new Progression();
  private survival = new Survival();
  private inventory = new Inventory();
  private loot: LootManager;
  private enemies: EnemyManager;
  private combat: Combat;
  private heat: HeatAbility;
  private heatFX: HeatFX;
  private audio = new AudioManager();
  private saveSystem = new SaveSystem();
  private ui: UI;

  private state: GameState = 'menu';
  private started = false;
  private playTime = 0;
  private kills = 0;
  private maxHeatReached = 0;
  private autosaveClock = 0;
  private damageFeedbackClock = 0;
  private lowHealthClock = 0;
  private fuelWarned = false;
  private hungerWarned = false;
  private thirstWarned = false;
  private upgradeReturn: 'playing' | 'pause' = 'playing';
  private repeatedUpgradeKey: UpgradeKey | null = null;
  private repeatedUpgradeCount = 0;
  private inventoryReturn: 'playing' | 'pause' = 'playing';
  private helpReturn: 'playing' | 'pause' = 'playing';
  private settings: Settings = {
    volume: 0.65,
    quality: 'high',
    sensitivity: 1,
    autoAttack: true,
    autoCounter: true,
  };
  private menuTime = 0;

  // Boost / ram
  private boostEnergy: number = BOOST.maxEnergy;
  private boostRegenDelay = 0;
  private boostLocked = false;
  private wasBoosting = false;

  // Combo & score
  private combo = 0;
  private comboTimer = 0;
  private bestCombo = 0;
  private score = 0;
  private bestScore = 0;

  // Tide waves
  private wave = 0;
  private waveActive = false;
  private waveTimer: number = WAVES.firstDelay;
  private waveElapsed = 0;
  private waveEnemies = new Set<Enemy>();
  private gameOverSink = 0;
  private lastFrame = performance.now();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WORLD.fogColor);

    this.loadSettings();
    this.bestScore = this.loadBestScore();

    this.ocean = new Ocean(this.scene);
    this.sky = new Sky(this.scene);
    this.islands = new Islands(this.scene);
    this.effects = new Effects(this.scene);
    this.supplyCrates = new SupplyCrates(
      this.scene,
      this.ocean,
      this.assets,
      import.meta.env.BASE_URL,
      (x, z) => this.handleCrateSalvage(x, z),
    );
    this.followCamera = new FollowCamera(window.innerWidth / window.innerHeight);
    this.followCamera.sensitivity = this.settings.sensitivity;

    this.input = new Input(canvas);
    this.boat = new Boat(this.scene, (impact) => this.handleCollision(impact));
    this.boat.reset(0, 0, 0.25);
    this.followCamera.reset(this.boat);
    this.survival.setMaxHp(this.progression.stats.maxHp, false);
    this.survival.onDeath = () => this.gameOver();

    this.ui = new UI({
      onNewGame: () => this.startNewGame(),
      onContinue: () => this.continueGame(),
      onResume: () => this.resume(),
      onPause: () => this.pause(),
      onSave: () => this.save(true),
      onExportTxt: () => this.exportTxtSave(),
      onImportTxtFile: (file) => this.importTxtFile(file),
      onImportTxtString: (raw) => this.importTxtString(raw),
      onGetTxtSnapshot: () => this.getTxtSnapshot(),
      onToggleAutoAttack: () => this.toggleAutoAttack(),
      onToggleAutoCounter: () => this.toggleAutoCounter(),
      onQuickHeal: () => this.quickHeal(),
      onOpenInventory: () => this.openInventory(),
      onCloseInventory: () => this.closeInventory(),
      onOpenUpgrade: () => this.openUpgrade(),
      onCloseUpgrade: () => this.closeUpgrade(),
      onHelp: () => this.openHelp(),
      onCloseHelp: () => this.closeHelp(),
      onRestart: () => this.startNewGame(),
      onAbandon: () => this.abandonRun(),
      onUpgrade: (key, repeating) => this.applyUpgrade(key, repeating),
      onUpgradeRepeatEnd: () => this.finishUpgradeRepeat(),
      onUseItem: (id) => this.useItem(id, true),
      onVolume: (volume) => this.setVolume(volume),
      onQuality: (quality) => this.setQuality(quality),
      onSensitivity: (value) => this.setSensitivity(value),
      onHotkey: (code) => this.handleHotkey(code),
    });

    this.heatFX = new HeatFX(this.scene);
    this.progression.onLevelUp = (level, points) => {
      this.audio.levelUp();
      this.ui.toast(`等级提升至 ${level}，获得强化点（当前可用 ${points} 点）`, 'good');
    };

    this.enemies = new EnemyManager(this.scene, this.ocean, this.islands, this.effects, this.boat, {
      getPlayerArmor: () => this.progression.stats.armor,
      getPlayerLevel: () => this.progression.level,
      onPlayerDamage: (amount, heavy, attacker) => this.onPlayerDamage(amount, heavy, attacker),
      onEnemyDeath: (enemy, byHeat) => this.onEnemyDeath(enemy, byHeat),
      onBossSpawn: (enemy) => this.onBossSpawn(enemy),
      onSplash: (pos, strength) => this.effects.splash(pos, strength),
    });

    this.combat = new Combat(
      this.scene,
      this.boat,
      this.followCamera.camera,
      this.enemies,
      this.effects,
      this.progression,
      this.survival,
      this.audio,
      {
        getAimNdc: () => ({ x: this.input.mouseNX, y: this.input.mouseNY }),
        onValidHit: (amount, crit) => this.onValidHit(amount, crit),
        onDamageNumber: (pos, amount, crit) => this.showDamageNumber(pos, amount, crit),
        onScreenShake: (amount) => this.followCamera.addShake(amount),
        onReloadState: (reloading) => this.ui && this.setReloadState(reloading),
        onHitConfirm: (killed) => this.ui.hitMarker(killed),
      },
    );
    this.combat.autoAttackEnabled = this.settings.autoAttack;
    this.combat.autoCounterEnabled = this.settings.autoCounter;

    this.heat = new HeatAbility({
      onStart: (duration, radius) => this.onHeatStart(duration, radius),
      onEnd: () => this.onHeatEnd(),
      onKill: () => undefined,
      onTick: () => undefined,
    });

    this.loot = new LootManager(this.scene, this.ocean, this.effects, this.inventory, this.audio, {
      onPrompt: (loot) => this.ui.setPrompt(loot ? { id: loot.id, amount: loot.amount } : null),
      onCollected: (loot, added) => {
        const label = this.itemName(loot.id);
        this.ui.toast(`自动拾取：${label} ×${added} 已收入船舱`, 'good');
      },
    });

    this.applyQualityInternal(this.settings.quality);
    this.audio.setVolume(this.settings.volume);
    this.setupUIStart();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('pagehide', () => {
      if (this.started && this.state !== 'gameover') this.save(false);
    });

    this.clock.start();
    this.animate();

    if (import.meta.env.DEV) {
      (window as unknown as { __RAT_TIDE__: Game }).__RAT_TIDE__ = this;
    }
  }

  private setupUIStart(): void {
    const hasSave = this.saveSystem.hasSave();
    this.ui.showStart(hasSave, hasSave ? this.saveSystem.getMetaLabel() : '');
    const volume = document.getElementById('volume-slider') as HTMLInputElement | null;
    if (volume) {
      volume.value = String(Math.round(this.settings.volume * 100));
      const label = document.getElementById('volume-value');
      if (label) label.textContent = `${Math.round(this.settings.volume * 100)}%`;
    }
    const quality = document.getElementById('quality-select') as HTMLSelectElement | null;
    if (quality) quality.value = this.settings.quality;
    const sens = document.getElementById('sensitivity-slider') as HTMLInputElement | null;
    if (sens) {
      sens.value = String(Math.round(this.settings.sensitivity * 100));
      const label = document.getElementById('sensitivity-value');
      if (label) label.textContent = `${Math.round(this.settings.sensitivity * 100)}%`;
    }
  }

  private handleCrateSalvage(x: number, z: number): void {
    const pos = new THREE.Vector3(x, this.ocean.getHeight(x, z) + 0.5, z);
    this.effects.burst(pos, 0xffc04c, 22, {
      speed: 4.5,
      size: 1.35,
      life: 0.7,
      gravity: 1.5,
      spread: 0.4,
      upward: 1.8,
    });
    this.loot.spawn('metal', 2, x + 0.8, z);
    this.loot.spawn('diesel', 1, x - 0.8, z + 0.6);
    if (Math.random() < 0.6) {
      this.loot.spawn('water', 1, x, z - 0.8);
    }
    this.progression.addXp(18);
    this.ui.toast('已打捞海上补给箱！获得物资与 +18 XP', 'good');
  }

  private resetRunState(): void {
    this.boostEnergy = BOOST.maxEnergy;
    this.boostRegenDelay = 0;
    this.boostLocked = false;
    this.wasBoosting = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.score = 0;
    this.wave = 0;
    this.waveActive = false;
    this.waveTimer = WAVES.firstDelay;
    this.waveElapsed = 0;
    this.waveEnemies.clear();
    this.ui?.hideWaveBanner();
    this.followCamera.camera.fov = CAMERA.fov;
    this.followCamera.camera.updateProjectionMatrix();
  }

  private startNewGame(): void {
    void this.audio.unlock();
    this.saveSystem.clear();
    this.progression.reset();
    this.survival.reset();
    this.survival.setMaxHp(this.progression.stats.maxHp, false);
    this.inventory.reset();
    this.inventory.add('water', 2);
    this.inventory.add('meat', 2);
    this.inventory.add('metal', 3);
    this.inventory.add('bandage', 1);
    this.inventory.add('diesel', 2);
    this.enemies.reset();
    this.loot.reset();
    this.combat.reset();
    this.combat.autoAttackEnabled = this.settings.autoAttack;
    this.combat.autoCounterEnabled = this.settings.autoCounter;
    this.heat.reset();
    this.heatFX.deactivate();
    this.effects.update(0);
    this.boat.reset(0, 0, 0.25);
    this.followCamera.reset(this.boat);
    this.kills = 0;
    this.playTime = 0;
    this.maxHeatReached = 0;
    this.autosaveClock = 0;
    this.fuelWarned = false;
    this.hungerWarned = false;
    this.thirstWarned = false;
    this.gameOverSink = 0;
    this.resetRunState();
    this.started = true;
    this.state = 'playing';
    this.ui.hideStart();
    this.ui.setGameActive();
    this.ui.setHeatFlash(false);
    this.ui.hideAbilityBanner();
    this.audio.setPaused(false);
    this.clearInput();
    this.input.centerPointer();

    this.enemies.spawnEnemy('corrodedFish');
    this.enemies.spawnEnemy('corrodedFish');
    this.loot.spawn('metal', 2, 18, 14);
    this.loot.spawn('water', 1, -15, 22);
    this.loot.spawn('diesel', 1, 26, -8);
    this.save(false);

    this.ui.toast('鼠标只用于瞄准 · A/D 手动转向 · 自动攻击(F) · 自动反击(G)', 'info');
    window.setTimeout(() => {
      if (this.state === 'playing') this.ui.toast('按住 Shift 冲刺（可撞击海兽、闪避墨弹）· Q 霰弹齐射', 'good');
    }, 2600);
    window.setTimeout(() => {
      if (this.state === 'playing') this.ui.toast('靠近海上漂浮物资将自动磁吸拾取入舱', 'info');
    }, 5500);
    window.setTimeout(() => {
      if (this.state === 'playing') this.ui.toast('热力每秒自动 +3%，技能点每秒自动 +10', 'good');
    }, 11500);
  }

  private continueGame(): void {
    const data = this.saveSystem.load();
    if (!data) {
      this.ui.toast('没有可用存档', 'warn');
      return;
    }
    this.loadFromSaveData(data, '存档已载入');
  }

  private loadFromSaveData(data: SaveData, prefix = '存档已载入'): void {
    void this.audio.unlock();
    this.progression.reset();
    this.progression.load(data);
    this.survival.reset();
    this.survival.setMaxHp(this.progression.stats.maxHp, false);
    this.survival.load(data, this.progression.stats.maxHp);
    this.inventory.reset();
    this.inventory.loadMap(data.inventory);
    this.kills = data.kills ?? 0;
    this.playTime = data.playTime ?? 0;
    this.maxHeatReached = data.maxHeatReached ?? 0;
    this.heat.reset();
    this.heat.heat = clamp(data.heat ?? 0, 0, 99.9);
    this.enemies.reset();
    this.loot.reset();
    this.combat.reset();
    if (typeof data.autoAttack === 'boolean') {
      this.settings.autoAttack = data.autoAttack;
      this.combat.autoAttackEnabled = data.autoAttack;
    }
    if (typeof data.autoCounter === 'boolean') {
      this.settings.autoCounter = data.autoCounter;
      this.combat.autoCounterEnabled = data.autoCounter;
    }
    this.heatFX.deactivate();
    this.resetRunState();
    this.score = Math.max(0, Math.floor(Number(data.score) || 0));
    this.wave = Math.max(0, Math.floor(Number(data.wave) || 0));
    this.bestCombo = Math.max(0, Math.floor(Number(data.bestCombo) || 0));
    const savedWaveTimer = Number(data.waveTimer);
    this.waveTimer = Number.isFinite(savedWaveTimer) && savedWaveTimer > 0 ? clamp(savedWaveTimer, 8, WAVES.interval) : WAVES.firstDelay;
    this.boat.reset(data.playerX ?? 0, data.playerZ ?? 0, data.heading ?? 0);
    this.followCamera.reset(this.boat);
    this.autosaveClock = 0;
    this.fuelWarned = false;
    this.hungerWarned = false;
    this.thirstWarned = false;
    this.gameOverSink = 0;
    this.started = true;
    this.state = 'playing';
    this.ui.hideStart();
    this.ui.setGameActive();
    this.ui.setHeatFlash(false);
    this.ui.hideAbilityBanner();
    this.audio.setPaused(false);
    this.clearInput();
    this.input.centerPointer();

    // Ensure at least a couple of enemies exist on resume
    this.enemies.spawnEnemy('corrodedFish');
    this.saveSystem.save(this.buildSaveData());
    this.ui.toast(`${prefix} · LV ${data.level} · ${data.kills} 击杀`, 'good');
    if (this.progression.points > 0) {
      this.ui.toast(`你有 ${this.progression.points} 个强化点可用，按 U 强化`, 'warn');
    }
  }

  private buildSaveData(): SaveData {
    return {
      version: 1,
      timestamp: Date.now(),
      playTime: this.playTime,
      kills: this.kills,
      playerX: this.boat.group.position.x,
      playerZ: this.boat.group.position.z,
      heading: this.boat.heading,
      level: this.progression.level,
      xp: this.progression.xp,
      points: this.progression.points,
      passivePointTimer: this.progression.passivePointTimer,
      upgrades: { ...this.progression.upgrades },
      hp: Math.max(1, this.survival.hp),
      hunger: this.survival.hunger,
      thirst: this.survival.thirst,
      fuel: this.survival.fuel,
      inventory: this.inventory.toMap(),
      heat: this.heat.active ? 0 : this.heat.heat,
      maxHeatReached: this.maxHeatReached,
      autoAttack: this.combat.autoAttackEnabled,
      autoCounter: this.combat.autoCounterEnabled,
      score: this.score,
      // An unfinished wave is replayed after loading.
      wave: this.waveActive ? Math.max(0, this.wave - 1) : this.wave,
      waveTimer: this.waveActive ? 12 : this.waveTimer,
      bestCombo: this.bestCombo,
    };
  }

  private getTxtSnapshot(): string {
    const data = this.started ? this.buildSaveData() : this.saveSystem.load();
    if (!data) return '';
    return this.saveSystem.exportToTxtString(data);
  }

  private exportTxtSave(): void {
    const data = this.started ? this.buildSaveData() : this.saveSystem.load();
    if (!data) {
      this.ui.toast('当前没有可导出的存档进度', 'warn');
      return;
    }
    this.saveSystem.save(data);
    this.saveSystem.downloadTxtSave(data);
    this.audio.ui();
    this.ui.toast(`TXT 文本存档已导出 (LV ${data.level})`, 'good');
  }

  private importTxtFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      this.importTxtString(content);
    };
    reader.onerror = () => {
      this.ui.toast('读取 TXT 存档文件失败', 'bad');
    };
    reader.readAsText(file, 'utf-8');
  }

  private importTxtString(raw: string): boolean {
    const parsed = this.saveSystem.parseTxtSave(raw);
    if (!parsed) {
      this.audio.denied();
      this.ui.toast('无效的 TXT 存档格式，请检查文件内容', 'bad');
      return false;
    }
    this.saveSystem.save(parsed);
    this.audio.levelUp();
    this.loadFromSaveData(parsed, 'TXT 存档导入成功');
    return true;
  }

  private toggleAutoAttack(): void {
    this.combat.autoAttackEnabled = !this.combat.autoAttackEnabled;
    this.settings.autoAttack = this.combat.autoAttackEnabled;
    this.persistSettings();
    this.audio.ui();
    this.ui.toast(`自动攻击已${this.combat.autoAttackEnabled ? '开启' : '关闭'}`, this.combat.autoAttackEnabled ? 'good' : 'info');
  }

  private toggleAutoCounter(): void {
    this.combat.autoCounterEnabled = !this.combat.autoCounterEnabled;
    this.settings.autoCounter = this.combat.autoCounterEnabled;
    this.persistSettings();
    this.audio.ui();
    this.ui.toast(`自动反击已${this.combat.autoCounterEnabled ? '开启' : '关闭'}`, this.combat.autoCounterEnabled ? 'good' : 'info');
  }

  private quickHeal(): void {
    if (!this.started || this.state === 'gameover') return;
    let actions = 0;
    const stats = this.progression.stats;
    if (this.survival.bleeding && this.inventory.count('bandage') > 0) {
      this.useItem('bandage', false);
      actions++;
    }
    if (this.survival.painActive && this.inventory.count('painkiller') > 0) {
      this.useItem('painkiller', false);
      actions++;
    }
    if (this.survival.hp < stats.maxHp - 18 && this.inventory.count('metal') > 0) {
      this.useItem('metal', false);
      actions++;
    } else if (this.survival.hp < stats.maxHp - 12 && this.survival.regenTimer <= 0 && this.inventory.count('regen') > 0) {
      this.useItem('regen', false);
      actions++;
    }
    if (this.survival.fuel < 65 && this.inventory.count('diesel') > 0) {
      this.useItem('diesel', false);
      actions++;
    }
    if (this.survival.thirst < 68 && this.inventory.count('water') > 0) {
      this.useItem('water', false);
      actions++;
    }
    if (this.survival.hunger < 68 && this.inventory.count('meat') > 0) {
      this.useItem('meat', false);
      actions++;
    }
    if (actions === 0) {
      this.ui.toast('当前状态良好或船舱缺少对应补给', 'info');
    }
  }

  private resume(): void {
    if (!this.started || this.state === 'gameover') return;
    void this.audio.unlock();
    this.state = 'playing';
    this.ui.setGameActive();
    this.audio.setPaused(false);
    this.clearInput();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
    this.audio.setPaused(true);
    this.clearInput();
  }

  private openInventory(): void {
    if (!this.started || this.state === 'gameover') return;
    this.inventoryReturn = this.state === 'paused' ? 'pause' : 'playing';
    if (this.state === 'playing') this.audio.setPaused(true);
    this.state = 'inventory';
    this.ui.showInventory(this.inventory, this.progression.stats);
    this.clearInput();
  }

  private closeInventory(): void {
    if (this.inventoryReturn === 'pause') {
      this.state = 'paused';
      this.ui.showPause();
      this.audio.setPaused(true);
    } else {
      this.resume();
    }
    this.clearInput();
  }

  private openUpgrade(): void {
    if (!this.started || this.state === 'gameover') return;
    this.upgradeReturn = this.state === 'paused' ? 'pause' : 'playing';
    this.state = 'upgrade';
    this.ui.showUpgrade(this.progression.points, this.progression.upgrades, this.progression.stats);
    this.audio.setPaused(true);
    this.clearInput();
  }

  private closeUpgrade(): void {
    if (this.upgradeReturn === 'pause') {
      this.state = 'paused';
      this.ui.showPause();
      this.audio.setPaused(true);
    } else {
      this.resume();
    }
    this.clearInput();
  }

  private openHelp(): void {
    if (!this.started || this.state === 'gameover') return;
    this.helpReturn = this.state === 'paused' ? 'pause' : 'playing';
    this.state = 'help';
    this.ui.showHelp();
    this.audio.setPaused(true);
    this.clearInput();
  }

  private closeHelp(): void {
    this.ui.hideHelp();
    if (this.helpReturn === 'pause') {
      this.state = 'paused';
      this.ui.showPause();
      this.audio.setPaused(true);
    } else {
      this.resume();
    }
    this.clearInput();
  }

  private applyUpgrade(key: UpgradeKey, repeating = false): void {
    if (!this.progression.upgrade(key)) {
      this.audio.denied();
      return;
    }
    const stats = this.progression.stats;
    const oldMax = this.survival.maxHp;
    this.survival.setMaxHp(stats.maxHp, key === 'hull');
    if (this.survival.maxHp !== oldMax) {
      this.survival.hp = clamp(this.survival.hp, 0, stats.maxHp);
    }
    if (repeating) {
      this.repeatedUpgradeKey = key;
      this.repeatedUpgradeCount++;
    } else {
      this.audio.ui();
    }
    this.ui.updateUpgrade(this.progression.points, this.progression.upgrades, stats);
    if (!repeating) {
      this.ui.toast(`已强化：${PROGRESSION.upgrades[key].name} (Lv.${this.progression.upgrades[key]})`, 'good');
    }
    if (this.progression.points <= 0) {
      window.setTimeout(() => {
        if (this.state === 'upgrade') this.closeUpgrade();
      }, 380);
    }
    if (!repeating) this.save(false);
  }

  private finishUpgradeRepeat(): void {
    if (this.repeatedUpgradeKey === null || this.repeatedUpgradeCount <= 0) return;
    const key = this.repeatedUpgradeKey;
    const count = this.repeatedUpgradeCount;
    this.repeatedUpgradeKey = null;
    this.repeatedUpgradeCount = 0;
    this.audio.ui();
    this.ui.toast(
      `连续强化 ${count} 次：${PROGRESSION.upgrades[key].name} (Lv.${this.progression.upgrades[key]})`,
      'good',
    );
    this.save(false);
  }

  private handleHotkey(code: string): void {
    if (!this.started || this.state === 'gameover') return;
    if (code === 'Escape') {
      if (this.ui.overlay === 'txt') {
        this.ui.hideTxtModal();
        return;
      }
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'upgrade') this.closeUpgrade();
      else if (this.state === 'inventory') this.closeInventory();
      else if (this.state === 'help') this.closeHelp();
      return;
    }
    if (code === 'Tab') {
      if (this.state === 'playing') this.openInventory();
      else if (this.state === 'inventory') this.closeInventory();
      return;
    }
    if (code === 'KeyU') {
      if (this.state === 'playing' || this.state === 'paused') this.openUpgrade();
      else if (this.state === 'upgrade') this.closeUpgrade();
      return;
    }
  }

  private useItem(id: ItemId, fromMenu: boolean): void {
    if (this.state === 'gameover') return;
    if (this.inventory.count(id) <= 0) {
      this.audio.denied();
      return;
    }
    const stats = this.progression.stats;
    let consumed = true;
    let message = '';

    switch (id) {
      case 'meat':
        this.inventory.remove(id, 1);
        this.survival.feed(28);
        message = '吃下生肉，饥饿 +28';
        if (Math.random() < 0.12) {
          this.survival.applyPain(10);
          message = '生肉不太对劲……疼痛 +10s';
        }
        break;
      case 'water':
        this.inventory.remove(id, 1);
        this.survival.hydrate(38);
        message = '饮下淡水，口渴恢复 +38';
        break;
      case 'diesel':
        this.inventory.remove(id, 1);
        this.survival.refuel(30);
        this.fuelWarned = false;
        message = '柴油已加注，燃油 +30';
        break;
      case 'metal':
        if (this.survival.hp >= stats.maxHp - 0.8) {
          this.ui.toast('船体完好，无需维修', 'warn');
          this.audio.denied();
          return;
        }
        this.inventory.remove(id, 1);
        this.survival.heal(38);
        message = '金属零件焊接完成，船体 +38';
        break;
      case 'bandage':
        if (!this.survival.bleeding && this.survival.hp >= stats.maxHp - 0.8) {
          this.ui.toast('当前没有流血，船体也无需包扎', 'warn');
          this.audio.denied();
          return;
        }
        this.inventory.remove(id, 1);
        this.survival.stopBleeding();
        this.survival.heal(8);
        message = '包扎完成，流血已停止';
        break;
      case 'painkiller':
        if (!this.survival.painActive) {
          this.ui.toast('当前没有疼痛状态', 'warn');
          this.audio.denied();
          return;
        }
        this.inventory.remove(id, 1);
        this.survival.curePain();
        message = '止痛药生效，疼痛已解除';
        break;
      case 'regen':
        this.inventory.remove(id, 1);
        this.survival.startRegen();
        message = '再生药剂生效，持续恢复船体';
        break;
    }

    if (consumed) {
      this.audio.pickup();
      this.ui.toast(message, id === 'meat' && message.includes('不对劲') ? 'warn' : 'good');
      if (fromMenu) {
        this.ui.showInventory(this.inventory, this.progression.stats);
      }
    }
  }

  private onPlayerDamage(amount: number, heavy: boolean, attacker?: Enemy | null): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const wasBleeding = this.survival.bleeding;
    const wasPain = this.survival.painActive;
    const dealt = this.survival.damage(amount, this.progression.stats.armor);
    if (dealt <= 0) return;

    // Trigger Auto-Counterattack lock & rapid retaliation
    this.combat.registerAttacker(attacker);

    this.followCamera.addShake(heavy ? 0.45 : 0.2);
    if (this.damageFeedbackClock <= 0) {
      this.ui.triggerDamage();
      this.audio.hurt();
      this.damageFeedbackClock = 0.28;
    }
    if (!wasBleeding && this.survival.bleeding) {
      this.ui.toast('船体正在流血！按 5 或 H 使用绷带', 'bad');
      this.audio.alarm();
    }
    if (!wasPain && this.survival.painActive) {
      this.ui.toast('疼痛发作：伤害与操控下降。按 6 或 H 使用止痛药', 'warn');
    }
  }

  private handleCollision(impact: number): void {
    if (this.state !== 'playing') return;
    const damage = 4 + impact * 1.15;
    this.survival.damage(damage, this.progression.stats.armor, false, false);
    this.followCamera.addShake(0.38);
    this.ui.triggerDamage();
    this.audio.hit(false);
    this.ui.toast('撞上浅滩！使用金属零件维修船体', 'warn');
  }

  private onEnemyDeath(enemy: Enemy, byHeat: boolean): void {
    this.kills++;
    this.waveEnemies.delete(enemy);

    // Kill chain: kills inside the window keep raising the multiplier.
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = COMBO.window;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = this.comboMultiplier;

    const hpScale = Math.max(1, enemy.maxHp / enemy.spec.hp);
    const baseXp = Math.round(enemy.spec.xp * (1 + (hpScale - 1) * 0.48));
    const xp = Math.round(baseXp * mult);
    this.score += Math.round(baseXp * 10 * mult);
    this.progression.addXp(xp);
    if (COMBO.milestones.includes(this.combo)) {
      this.audio.combo(this.combo);
      if (!this.waveBannerBusy) {
        this.ui.showWaveBanner('KILL CHAIN', `${this.combo} 连杀！`, `经验与分数 ×${mult.toFixed(2)}`, 'combo', 1300);
      }
    }
    this.loot.spawnDrops(enemy.type, enemy.group.position);
    this.audio.explosion(enemy.isBoss ? 1.5 : 0.75);
    this.followCamera.addShake(enemy.isBoss ? 0.72 : byHeat ? 0.2 : 0.28);
    this.ui.killFeed(enemy.spec.name, byHeat);
    if (enemy.isBoss) {
      this.ui.toast(`机械章鱼已摧毁！+${xp} XP`, 'good');
    }
    this.events.emit('kill', { name: enemy.spec.name, crit: byHeat });
    this.maxHeatReached = Math.max(this.maxHeatReached, this.heat.heat);
  }

  private onBossSpawn(enemy: Enemy): void {
    this.audio.alarm();
    this.followCamera.addShake(0.28);
    this.ui.toast('警告：深海机械章鱼接近！', 'bad');
    this.events.emit('toast', { text: enemy.spec.name, kind: 'warn' });
  }

  private onValidHit(amount: number, crit: boolean): void {
    this.heat.addHit(crit, this.progression.stats.awakeningDuration);
    this.maxHeatReached = Math.max(this.maxHeatReached, this.heat.heat);
  }

  private onHeatStart(duration: number, radius: number): void {
    this.heatFX.activate();
    this.audio.heatStart();
    this.ui.setHeatFlash(true);
    this.ui.showAbilityBanner(duration);
    this.ui.toast(`热力觉醒：${radius} 米范围秒杀，持续 ${duration.toFixed(1)} 秒`, 'good');
    this.followCamera.addShake(0.45);
    this.maxHeatReached = 100;
    this.events.emit('heatStart', { duration, radius });
  }

  private onHeatEnd(): void {
    this.heatFX.deactivate();
    this.audio.heatEnd();
    this.ui.setHeatFlash(false);
    this.ui.hideAbilityBanner();
    this.ui.toast('热力核心冷却完毕，重新开始充能 (+3%/秒)', 'info');
    this.events.emit('heatEnd', {});
  }

  private showDamageNumber(worldPosition: THREE.Vector3, amount: number, crit: boolean): void {
    const projected = worldPosition.clone().project(this.followCamera.camera);
    if (projected.z > 1) return;
    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    this.ui.showDamageNumber(x, y, amount, crit);
  }

  private setReloadState(reloading: boolean): void {
    const crosshair = document.getElementById('crosshair');
    crosshair?.classList.toggle('reloading', reloading);
  }

  private gameOver(): void {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.gameOverSink = 0;
    this.audio.setPaused(true);
    this.audio.alarm();
    this.ui.setHeatFlash(false);
    this.ui.hideAbilityBanner();
    this.heatFX.deactivate();
    const newRecord = this.score > this.bestScore;
    if (newRecord) {
      this.bestScore = this.score;
      this.saveBestScore();
    }
    this.ui.showGameOver({
      level: this.progression.level,
      kills: this.kills,
      time: this.playTime,
      maxHeat: this.maxHeatReached,
      wave: this.waveActive ? Math.max(0, this.wave - 1) : this.wave,
      bestCombo: this.bestCombo,
      score: this.score,
      bestScore: this.bestScore,
      newRecord,
    });
    this.saveSystem.clear();
    this.clearInput();
  }

  private abandonRun(): void {
    this.saveSystem.clear();
    this.started = false;
    this.state = 'menu';
    this.enemies.reset();
    this.loot.reset();
    this.combat.reset();
    this.heat.reset();
    this.heatFX.deactivate();
    this.survival.reset();
    this.progression.reset();
    this.inventory.reset();
    this.kills = 0;
    this.playTime = 0;
    this.maxHeatReached = 0;
    this.resetRunState();
    this.boat.reset(0, 0, 0.25);
    this.followCamera.reset(this.boat);
    this.audio.setPaused(true);
    this.ui.showStart(false, '');
    this.clearInput();
  }

  private save(showToast: boolean): void {
    if (!this.started || this.state === 'gameover') return;
    const data = this.buildSaveData();
    const ok = this.saveSystem.save(data);
    if (showToast) {
      if (ok) this.ui.flashSaved();
      else this.ui.toast('保存失败：浏览器存储不可用，请使用导出 TXT 存档', 'bad');
    }
  }

  private updateGameplay(dt: number): void {
    this.playTime += dt;
    this.damageFeedbackClock = Math.max(0, this.damageFeedbackClock - dt);
    this.lowHealthClock -= dt;

    // Passive skill points accrue once per second while the voyage is active.
    this.progression.tick(dt, true);

    this.survival.tick(dt);
    this.survival.consumeFuel(dt, this.boat.throttle, this.boat.speedRatio);
    if (this.survival.dead) return;

    if (this.input.justPressed('KeyE')) {
      this.loot.tryPickup();
    }
    if (this.input.justPressed('KeyF')) this.toggleAutoAttack();
    if (this.input.justPressed('KeyG')) this.toggleAutoCounter();
    if (this.input.justPressed('KeyH')) this.quickHeal();

    if (this.input.justPressed('Digit1')) this.useItem('meat', false);
    if (this.input.justPressed('Digit2')) this.useItem('water', false);
    if (this.input.justPressed('Digit3')) this.useItem('diesel', false);
    if (this.input.justPressed('Digit4')) this.useItem('metal', false);
    if (this.input.justPressed('Digit5')) this.useItem('bandage', false);
    if (this.input.justPressed('Digit6')) this.useItem('painkiller', false);
    if (this.input.justPressed('Digit7')) this.useItem('regen', false);
    if (this.input.justPressed('KeyR')) this.useItem('metal', false);
    if (this.input.justPressed('KeyQ') && !this.combat.fireSalvo()) this.audio.denied();

    const boosting = this.updateBoost(dt);
    this.boat.update(
      dt,
      {
        input: this.input,
        active: true,
        fuel: this.survival.fuel,
        handlingPenalty: this.survival.handlingPenalty,
        speedMultiplier: this.progression.stats.speedMultiplier,
        boost: boosting,
      },
      this.ocean,
      this.islands,
    );

    this.followCamera.update(dt, this.boat, this.input, this.ocean, true);

    this.enemies.update(dt, this.followCamera.camera, true);
    this.updateRamming();
    this.combat.update(dt, this.input, true);
    this.updateCombo(dt);
    this.updateWaves(dt);
    if (this.survival.dead) return;

    this.heat.update(dt, this.boat, this.enemies, true, this.progression.stats.awakeningDuration);
    this.heatFX.update(
      dt,
      this.boat.group.position,
      this.heat.radius,
      this.heat.timeRatio,
      this.ocean.getHeight(this.boat.group.position.x, this.boat.group.position.z),
    );
    this.loot.update(dt, this.boat.group.position, true);
    this.supplyCrates.update(dt, this.menuTime, this.boat.group.position, true);

    const wake = this.boat.model.wakeAnchor.getWorldPosition(new THREE.Vector3()).clone();
    this.effects.emitWake(wake, this.boat.forward.x, this.boat.forward.z, this.boat.speedRatio, dt);
    if (this.boat.boosting) {
      // Extra spray while boosting.
      this.effects.emitWake(wake, this.boat.forward.x, this.boat.forward.z, 1, dt);
    }
    const smoke = this.boat.model.smokeAnchor.getWorldPosition(new THREE.Vector3()).clone();
    this.effects.emitSmoke(smoke, dt, 0.7 + Math.abs(this.boat.throttle));
    this.effects.update(dt);
    this.audio.update(this.boat.speedRatio, this.boat.throttle);

    this.updateWarnings();
    this.updateHUD();
    this.maxHeatReached = Math.max(this.maxHeatReached, this.heat.heat);

    this.autosaveClock += dt;
    if (this.autosaveClock >= 20) {
      this.autosaveClock = 0;
      this.save(false);
    }
  }

  private updateWarnings(): void {
    if (this.survival.fuel <= 0.01 && !this.fuelWarned) {
      this.fuelWarned = true;
      this.ui.toast('燃油耗尽！按 3 或 H 使用柴油补给', 'bad');
      this.audio.alarm();
    }
    if (this.survival.fuel > 2) this.fuelWarned = false;

    if (this.survival.hunger <= 0 && !this.hungerWarned) {
      this.hungerWarned = true;
      this.ui.toast('饥饿耗尽，船体正在持续受损', 'bad');
    }
    if (this.survival.hunger > 8) this.hungerWarned = false;

    if (this.survival.thirst <= 0 && !this.thirstWarned) {
      this.thirstWarned = true;
      this.ui.toast('淡水耗尽，船体正在持续受损', 'bad');
    }
    if (this.survival.thirst > 8) this.thirstWarned = false;

    if (this.survival.hpRatio < 0.3 && this.lowHealthClock <= 0) {
      this.lowHealthClock = 16;
      this.audio.alarm();
      this.ui.toast('船体严重受损！按 4 或 H 使用金属零件维修', 'bad');
    }
  }

  private updateHUD(): void {
    const stats = this.progression.stats;
    let target: TargetInfo | null = null;
    const aimed = this.combat.targetEnemy;
    if (aimed && !aimed.dead) {
      target = {
        name: aimed.spec.name,
        hp: aimed.hp,
        maxHp: aimed.maxHp,
        state: aimed.getStateLabel(),
      };
    }
    const boss = this.enemies.activeBoss;
    const hud: HUDState = {
      hp: this.survival.hp,
      maxHp: stats.maxHp,
      hunger: this.survival.hunger,
      thirst: this.survival.thirst,
      fuel: this.survival.fuel,
      bleeding: this.survival.bleeding,
      pain: this.survival.painActive,
      regen: this.survival.regenTimer > 0,
      level: this.progression.level,
      xp: this.progression.xp,
      xpRequired: this.progression.xpRequired,
      points: this.progression.points,
      passivePointTimeLeft: this.progression.passivePointTimeLeft,
      stats,
      heat: this.heat.heat,
      heatActive: this.heat.active,
      heatTimeLeft: this.heat.timer,
      heatDuration: stats.awakeningDuration,
      speed: this.boat.speed,
      heading: this.boat.heading,
      kills: this.kills,
      threat: this.enemies.activeCount,
      playTime: this.playTime,
      autoAttack: this.combat.autoAttackEnabled,
      autoCounter: this.combat.autoCounterEnabled,
      engagementMode: this.combat.engagementMode,
      target,
      boss: boss && !boss.dead ? { name: boss.spec.name, hp: boss.hp, maxHp: boss.maxHp } : null,
      boostRatio: this.boostEnergy / BOOST.maxEnergy,
      boosting: this.boat.boosting,
      boostLocked: this.boostLocked,
      salvoCooldown: this.combat.salvoCooldown,
      salvoMax: SALVO.cooldown,
      combo: this.combo,
      comboMultiplier: this.comboMultiplier,
      comboTimerRatio: this.comboTimer / COMBO.window,
      waveLabel: this.waveActive
        ? `怒潮 ${this.wave} · 剩余 ${this.waveEnemies.size}`
        : `下一波怒潮 ${Math.ceil(this.waveTimer)}s`,
      waveSurge: this.waveActive,
      score: this.score,
    };
    this.ui.updateHUD(hud, this.input.mouseX, this.input.mouseY);

    const radarEnemies = this.enemies.enemies
      .filter((e) => !e.dead)
      .map((e) => ({ x: e.group.position.x, z: e.group.position.z, boss: e.isBoss }));
    const radarLoot = this.loot.loot.map((l) => ({ x: l.group.position.x, z: l.group.position.z }));
    this.ui.updateRadar(
      this.boat.group.position.x,
      this.boat.group.position.z,
      this.boat.heading,
      radarEnemies,
      radarLoot,
      this.playTime,
    );
  }

  private updateAmbient(dt: number): void {
    this.menuTime += dt;
    this.ocean.update(dt, this.followCamera.camera);
    this.sky.update(dt, this.followCamera.camera, this.boat.group.position);
    this.islands.update(dt, this.ocean.time);
    if (this.state !== 'playing') {
      this.supplyCrates.update(dt, this.menuTime);
    }
  }

  private animate = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = Math.min(rawDt, 0.05);

    this.updateAmbient(dt);

    if (this.state === 'playing') {
      this.updateGameplay(dt);
    } else {
      this.effects.update(dt);
      if (this.state === 'menu' || this.state === 'gameover') {
        this.boat.update(
          dt,
          {
            input: this.input,
            active: false,
            fuel: this.survival.fuel,
            handlingPenalty: 1,
            speedMultiplier: 1,
          },
          this.ocean,
          this.islands,
        );
        if (this.state === 'menu') {
          this.followCamera.orbitYaw = 0.82 + Math.sin(this.menuTime * 0.07) * 0.08;
          this.followCamera.orbitPitch = 0.26;
          this.followCamera.distance = 21;
        }
        this.followCamera.update(dt, this.boat, this.input, this.ocean, false);
      }
      if (this.state === 'gameover') {
        this.gameOverSink += dt;
        this.boat.group.position.y -= dt * 0.16;
        this.boat.group.rotation.z += dt * 0.008;
      }
    }

    this.updateFov(dt);
    this.audio.update(this.boat.speedRatio, this.state === 'playing' ? this.boat.throttle : 0);
    this.renderer.render(this.scene, this.followCamera.camera);
    this.input.endFrame();
  };

  private get comboMultiplier(): number {
    if (this.combo <= 1) return 1;
    return Math.min(COMBO.maxMultiplier, 1 + (this.combo - 1) * COMBO.stepMultiplier);
  }

  /** True while a wave surge/clear banner should not be replaced by a combo banner. */
  private waveBannerBusy = false;

  private updateBoost(dt: number): boolean {
    const wants = this.input.boostHeld && this.survival.fuel > 0.01;
    if (this.boostLocked && this.boostEnergy >= BOOST.minToStart) this.boostLocked = false;

    let boosting = false;
    if (wants && !this.boostLocked && this.boostEnergy > 0) {
      // Starting a new boost needs a minimum charge; continuing one does not.
      boosting = this.wasBoosting || this.boostEnergy >= BOOST.minToStart;
    }
    if (wants && !this.wasBoosting && !boosting && this.input.justPressed(this.input.isDown('ShiftLeft') ? 'ShiftLeft' : 'ShiftRight')) {
      this.audio.denied();
    }

    if (boosting) {
      this.boostEnergy -= BOOST.drainPerSecond * dt;
      this.boostRegenDelay = BOOST.regenDelay;
      if (this.boostEnergy <= 0) {
        this.boostEnergy = 0;
        this.boostLocked = true;
        boosting = false;
      }
    } else {
      this.boostRegenDelay = Math.max(0, this.boostRegenDelay - dt);
      if (this.boostRegenDelay <= 0) {
        this.boostEnergy = Math.min(BOOST.maxEnergy, this.boostEnergy + BOOST.regenPerSecond * dt);
      }
    }

    if (boosting && !this.wasBoosting) {
      this.audio.boost();
      this.followCamera.addShake(0.18);
    }
    this.wasBoosting = boosting;
    return boosting;
  }

  /** Ramming: hitting an enemy at speed damages and knocks it away. */
  private updateRamming(): void {
    const speed = this.boat.speed;
    if (speed < BOOST.ramMinSpeed) return;
    const pos = this.boat.group.position;
    const fwd = this.boat.forward;
    const bowX = pos.x + fwd.x * 3;
    const bowZ = pos.z + fwd.z * 3;
    const stats = this.progression.stats;
    const maxFwd = BOAT.maxForwardSpeed * stats.speedMultiplier;
    for (const enemy of this.enemies.enemies) {
      if (enemy.dead || enemy.ramCooldown > 0) continue;
      const ex = enemy.group.position.x;
      const ez = enemy.group.position.z;
      const reach = enemy.hitRadius + 2.6;
      const dBow = Math.hypot(ex - bowX, ez - bowZ);
      const dMid = Math.hypot(ex - pos.x, ez - pos.z);
      if (dBow > reach && dMid > reach) continue;

      enemy.ramCooldown = BOOST.ramCooldown;
      const speedFactor = clamp(speed / Math.max(1, maxFwd), 0.5, 2);
      const damage = BOOST.ramBaseDamage * stats.damageMultiplier * speedFactor * (this.boat.boosting ? 1.5 : 1);
      const hitPos = enemy.group.position.clone();
      hitPos.y = Math.max(hitPos.y + 1, 1);
      const result = enemy.takeDamage(damage, true);

      let nx = ex - pos.x;
      let nz = ez - pos.z;
      const len = Math.hypot(nx, nz) || 1;
      nx = nx / len + fwd.x * 0.8;
      nz = nz / len + fwd.z * 0.8;
      const len2 = Math.hypot(nx, nz) || 1;
      enemy.knockback(nx / len2, nz / len2, BOOST.ramKnockback);

      this.effects.explosion(hitPos, 0xffb860, 0.55);
      this.effects.hitSparks(hitPos, 0xffe39b, true);
      this.audio.hit(true);
      this.followCamera.addShake(0.5);
      this.showDamageNumber(hitPos, result.dealt, true);
      this.ui.hitMarker(result.killed);
      this.heat.addHit(true, stats.awakeningDuration);
      this.boat.speed *= 0.72;
      this.survival.damage(BOOST.ramSelfDamage, stats.armor, false, false);
      if (result.killed) this.ui.toast('撞击摧毁！', 'good');
    }
  }

  private updateCombo(dt: number): void {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.comboTimer = 0;
      if (this.combo >= 3) this.ui.toast(`连杀结束 · 本次 ${this.combo} 连杀`, 'info');
      this.combo = 0;
    }
  }

  private updateWaves(dt: number): void {
    if (!this.waveActive) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
      return;
    }
    this.waveElapsed += dt;
    for (const e of this.waveEnemies) {
      if (e.dead || !this.enemies.enemies.includes(e)) this.waveEnemies.delete(e);
    }
    if (this.waveEnemies.size === 0) {
      this.clearWave(true);
    } else if (this.waveElapsed > 150) {
      // Safety valve: a straggler stuck somewhere should not stall the tide forever.
      for (const e of this.waveEnemies) e.aggressive = false;
      this.waveEnemies.clear();
      this.clearWave(false);
    }
  }

  private startWave(): void {
    const next = this.wave + 1;
    const count = Math.min(WAVES.maxCount, WAVES.baseCount + next);
    const sharkChance = next >= 2 ? Math.min(0.5, 0.12 * next) : 0;
    const spawned: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      const type: EnemyType = Math.random() < sharkChance ? 'armoredShark' : 'corrodedFish';
      const e = this.enemies.spawnEnemy(type);
      if (e) spawned.push(e);
    }
    if (next % WAVES.bossEvery === 0 && !this.enemies.activeBoss) {
      const boss = this.enemies.spawnEnemy('mechOctopus');
      if (boss) spawned.push(boss);
    }
    if (spawned.length === 0) {
      // No valid spawn spot right now (e.g. hugging the world edge). Try again shortly.
      this.waveTimer = 5;
      return;
    }
    this.wave = next;
    this.waveActive = true;
    this.waveElapsed = 0;
    for (const e of spawned) {
      e.aggressive = true;
      this.waveEnemies.add(e);
    }
    this.audio.alarm();
    this.followCamera.addShake(0.3);
    this.waveBannerBusy = true;
    this.ui.showWaveBanner('TIDE SURGE', `第 ${this.wave} 波怒潮`, `${spawned.length} 只机械海兽正在猎杀你`, 'surge');
    window.setTimeout(() => (this.waveBannerBusy = false), 2600);
  }

  private clearWave(reward: boolean): void {
    this.waveActive = false;
    this.waveTimer = WAVES.interval;
    if (!reward) {
      this.ui.toast('怒潮退去了……', 'info');
      return;
    }
    const xp = WAVES.clearXpPerWave * this.wave;
    this.progression.addXp(xp);
    this.score += 250 * this.wave;
    const maxHp = this.progression.stats.maxHp;
    this.survival.heal(maxHp * WAVES.clearHealRatio);

    const p = this.boat.group.position;
    const drops: ItemId[] = ['metal', 'metal', 'water', 'diesel', 'meat'];
    if (this.wave >= 2) drops.push('bandage');
    if (this.wave >= 3) drops.push(Math.random() < 0.5 ? 'regen' : 'painkiller');
    drops.forEach((id, i) => {
      const a = (i / drops.length) * Math.PI * 2;
      this.loot.spawn(id, 1, p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7);
    });

    this.audio.levelUp();
    this.waveBannerBusy = true;
    this.ui.showWaveBanner('TIDE BROKEN', `第 ${this.wave} 波怒潮已击退`, `+${xp} XP · 船体修复 · 补给已投放`, 'cleared');
    window.setTimeout(() => (this.waveBannerBusy = false), 2600);
  }

  private updateFov(dt: number): void {
    const cam = this.followCamera.camera;
    const target = CAMERA.fov + (this.state === 'playing' && this.boat.boosting ? BOOST.fovKick : 0);
    const next = damp(cam.fov, target, 5, dt);
    if (Math.abs(next - cam.fov) > 0.005) {
      cam.fov = next;
      cam.updateProjectionMatrix();
    }
  }

  private loadBestScore(): number {
    try {
      const raw = localStorage.getItem(BEST_SCORE_KEY);
      const n = raw ? Number(JSON.parse(raw)?.score) : 0;
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, JSON.stringify({ score: this.bestScore, at: Date.now() }));
    } catch {
      // Optional.
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.followCamera.camera.aspect = w / h;
    this.followCamera.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private clearInput(): void {
    this.input.keys.clear();
    this.input.leftDown = false;
    this.input.rightDown = false;
  }

  private itemName(id: ItemId): string {
    const names: Record<ItemId, string> = {
      meat: '生肉',
      water: '淡水',
      diesel: '柴油',
      metal: '金属零件',
      bandage: '绷带',
      painkiller: '止痛药',
      regen: '再生药剂',
    };
    return names[id];
  }

  private setVolume(volume: number): void {
    this.settings.volume = clamp(volume, 0, 1);
    this.audio.setVolume(this.settings.volume);
    this.persistSettings();
  }

  private setQuality(quality: 'high' | 'medium' | 'low'): void {
    this.settings.quality = quality;
    this.applyQualityInternal(quality);
    this.persistSettings();
    this.ui.toast(`画质已切换为${quality === 'high' ? '高' : quality === 'medium' ? '中' : '低'}`, 'info');
  }

  private applyQualityInternal(quality: 'high' | 'medium' | 'low'): void {
    if (quality === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      this.renderer.shadowMap.enabled = true;
    } else if (quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
      this.renderer.shadowMap.enabled = true;
    } else {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    }
    this.scene.traverse((obj) => {
      const light = obj as THREE.Light;
      if (light.isLight) light.castShadow = light.castShadow && this.renderer.shadowMap.enabled;
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private setSensitivity(value: number): void {
    this.settings.sensitivity = clamp(value, 0.3, 1.6);
    this.followCamera.sensitivity = this.settings.sensitivity;
    this.persistSettings();
  }

  private persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Settings persistence is optional.
    }
  }

  private loadSettings(): void {
    try {
      const currentRaw = localStorage.getItem(SETTINGS_KEY);
      const legacyRaw = currentRaw ? null : localStorage.getItem(LEGACY_SETTINGS_KEY);
      const raw = currentRaw ?? legacyRaw;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (typeof parsed.volume === 'number') this.settings.volume = clamp(parsed.volume, 0, 1);
      if (parsed.quality === 'high' || parsed.quality === 'medium' || parsed.quality === 'low') {
        this.settings.quality = parsed.quality;
      }
      if (typeof parsed.sensitivity === 'number') this.settings.sensitivity = clamp(parsed.sensitivity, 0.3, 1.6);
      if (typeof parsed.autoAttack === 'boolean') this.settings.autoAttack = parsed.autoAttack;
      if (typeof parsed.autoCounter === 'boolean') this.settings.autoCounter = parsed.autoCounter;
      if (legacyRaw) this.persistSettings();
    } catch {
      // Ignore malformed settings.
    }
  }
}
