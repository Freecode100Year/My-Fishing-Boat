import {
  ISLANDS,
  ITEMS,
  ItemId,
  PROGRESSION,
  UpgradeKey,
} from '../config/balance';
import type { Inventory } from '../inventory/Inventory';
import type { PlayerStats } from '../progression/Progression';
import { formatTime } from '../utils/math';
import type { ToastKind } from '../core/EventBus';
import { locale, t } from '../i18n';

export interface UICallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onResume: () => void;
  onPause: () => void;
  onSave: () => void;
  onExportTxt: () => void;
  onImportTxtFile: (file: File) => void;
  onImportTxtString: (raw: string) => boolean;
  onGetTxtSnapshot: () => string;
  onToggleAutoAttack: () => void;
  onToggleAutoCounter: () => void;
  onToggleMouseSteer: () => void;
  onQuickHeal: () => void;
  onOpenInventory: () => void;
  onCloseInventory: () => void;
  onOpenUpgrade: () => void;
  onCloseUpgrade: () => void;
  onHelp: () => void;
  onCloseHelp: () => void;
  onRestart: () => void;
  onAbandon: () => void;
  onUpgrade: (key: UpgradeKey) => void;
  onUseItem: (id: ItemId) => void;
  onVolume: (volume: number) => void;
  onQuality: (quality: 'high' | 'medium' | 'low') => void;
  onSensitivity: (value: number) => void;
  onHotkey: (code: string) => void;
}

export interface RadarEnemy {
  x: number;
  z: number;
  boss: boolean;
}

export interface RadarLoot {
  x: number;
  z: number;
}

export interface TargetInfo {
  name: string;
  hp: number;
  maxHp: number;
  state: string;
}

export interface BossInfo {
  name: string;
  hp: number;
  maxHp: number;
}

export interface HUDState {
  hp: number;
  maxHp: number;
  hunger: number;
  thirst: number;
  fuel: number;
  bleeding: boolean;
  pain: boolean;
  regen: boolean;
  level: number;
  xp: number;
  xpRequired: number;
  points: number;
  passivePointTimeLeft: number;
  stats: PlayerStats;
  heat: number;
  heatActive: boolean;
  heatTimeLeft: number;
  heatDuration: number;
  speed: number;
  heading: number;
  kills: number;
  threat: number;
  playTime: number;
  autoAttack: boolean;
  autoCounter: boolean;
  mouseSteer: boolean;
  engagementMode: 'manual' | 'counter' | 'auto' | 'idle';
  target: TargetInfo | null;
  boss: BossInfo | null;
}

const number = (v: number): string => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 0 }).format(Math.round(v));

export class UI {
  private callbacks: UICallbacks;
  private currentOverlay: 'none' | 'upgrade' | 'inventory' | 'pause' | 'help' | 'txt' = 'none';
  private cache = new Map<string, string>();
  private damageFlashTimer = 0;
  private abilityTimer = 0;
  private toastTimers = new Set<number>();
  private abandonConfirmArmed = false;
  private abandonConfirmTimer = 0;
  saveLabel = '';
  lastMouseX = window.innerWidth * 0.5;
  lastMouseY = window.innerHeight * 0.5;

  private el<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing UI element: ${id}`);
    return node as T;
  }

  private setText(id: string, value: string): void {
    value = t(value);
    if (this.cache.get(id) === value) return;
    this.cache.set(id, value);
    this.el(id).textContent = value;
  }

  private setStyle(id: string, prop: string, value: string): void {
    const key = `${id}:${prop}`;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    this.el<HTMLElement>(id).style.setProperty(prop, value);
  }

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;
    this.bindButtons();
    this.bindSettings();
    this.bindHotkeys();
  }

  private triggerFilePicker(): void {
    const input = document.getElementById('txt-file-input') as HTMLInputElement | null;
    if (!input) return;
    input.value = '';
    input.click();
  }

  private bindButtons(): void {
    const on = (id: string, fn: () => void) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener('click', fn);
    };

    on('btn-new-game', () => this.callbacks.onNewGame());
    on('btn-continue', () => this.callbacks.onContinue());
    on('btn-import-txt-start', () => this.triggerFilePicker());
    on('btn-export-txt-start', () => this.callbacks.onExportTxt());
    on('btn-gameover-import-txt', () => this.triggerFilePicker());

    on('btn-help', () => this.callbacks.onHelp());
    on('btn-pause', () => this.callbacks.onPause());
    on('btn-resume', () => this.callbacks.onResume());
    on('btn-save', () => this.callbacks.onSave());
    on('btn-export-txt', () => this.callbacks.onExportTxt());
    on('btn-import-txt', () => this.triggerFilePicker());
    on('btn-txt-modal-open', () => this.showTxtModal());
    on('btn-txt-modal-close', () => this.hideTxtModal());

    on('btn-txt-download-file', () => this.callbacks.onExportTxt());
    on('btn-txt-upload-file', () => this.triggerFilePicker());
    on('btn-txt-copy', () => {
      const textarea = document.getElementById('txt-save-textarea') as HTMLTextAreaElement | null;
      if (!textarea) return;
      if (!textarea.value.trim()) {
        textarea.value = this.callbacks.onGetTxtSnapshot();
      }
      textarea.select();
      try {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(textarea.value);
        } else {
          document.execCommand('copy');
        }
        this.toast('TXT 存档内容已复制到剪贴板', 'good');
      } catch {
        document.execCommand('copy');
        this.toast('TXT 存档内容已复制', 'good');
      }
    });
    on('btn-txt-apply', () => {
      const textarea = document.getElementById('txt-save-textarea') as HTMLTextAreaElement | null;
      if (!textarea || !textarea.value.trim()) {
        this.toast('请先粘贴有效的 TXT 存档内容或选择文件', 'warn');
        return;
      }
      const ok = this.callbacks.onImportTxtString(textarea.value);
      if (ok) {
        this.hideTxtModal();
      }
    });

    on('btn-toggle-auto-attack', () => this.callbacks.onToggleAutoAttack());
    on('btn-toggle-auto-counter', () => this.callbacks.onToggleAutoCounter());
    on('btn-toggle-mouse-steer', () => this.callbacks.onToggleMouseSteer());
    on('btn-quick-heal', () => this.callbacks.onQuickHeal());
    on('btn-hud-save-txt', () => this.callbacks.onExportTxt());
    on('btn-hud-load-txt', () => this.triggerFilePicker());
    on('btn-left-skills', () => {
      this.el<HTMLDetailsElement>('left-skill-menu').open = false;
      this.callbacks.onOpenUpgrade();
    });

    on('btn-pause-inventory', () => this.callbacks.onOpenInventory());
    on('btn-pause-upgrade', () => this.callbacks.onOpenUpgrade());
    on('btn-help-menu', () => this.callbacks.onHelp());
    on('btn-help-close', () => this.callbacks.onCloseHelp());
    on('btn-help-resume', () => this.callbacks.onCloseHelp());
    on('btn-restart', () => this.callbacks.onRestart());
    on('btn-inventory-close', () => this.callbacks.onCloseInventory());
    on('btn-upgrade-close', () => this.callbacks.onCloseUpgrade());
    on('btn-reset', () => {
      const resetBtn = document.getElementById('btn-reset');
      if (!this.abandonConfirmArmed) {
        this.abandonConfirmArmed = true;
        if (resetBtn) resetBtn.textContent = t('再次点击确认放弃航程');
        window.clearTimeout(this.abandonConfirmTimer);
        this.abandonConfirmTimer = window.setTimeout(() => {
          this.abandonConfirmArmed = false;
          if (resetBtn) resetBtn.textContent = t('放弃航程');
        }, 3500);
        return;
      }
      this.abandonConfirmArmed = false;
      if (resetBtn) resetBtn.textContent = t('放弃航程');
      this.callbacks.onAbandon();
    });

    const fileInput = document.getElementById('txt-file-input') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          this.callbacks.onImportTxtFile(file);
        }
      });
    }
  }

  private bindSettings(): void {
    const volume = this.el<HTMLInputElement>('volume-slider');
    const volumeValue = this.el('volume-value');
    volume.addEventListener('input', () => {
      volumeValue.textContent = `${volume.value}%`;
      this.callbacks.onVolume(Number(volume.value) / 100);
    });

    const sensitivity = this.el<HTMLInputElement>('sensitivity-slider');
    const sensitivityValue = this.el('sensitivity-value');
    sensitivity.addEventListener('input', () => {
      sensitivityValue.textContent = `${sensitivity.value}%`;
      this.callbacks.onSensitivity(Number(sensitivity.value) / 100);
    });

    const quality = this.el<HTMLSelectElement>('quality-select');
    quality.addEventListener('change', () => {
      this.callbacks.onQuality(quality.value as 'high' | 'medium' | 'low');
    });
  }

  private bindHotkeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'KeyU' || e.code === 'Escape') {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
          if (e.code !== 'Escape') return;
        }
        this.callbacks.onHotkey(e.code);
      }
    });
  }

  showStart(hasSave: boolean, saveLabel: string): void {
    this.hideAllOverlays();
    this.el('screen-start').classList.remove('hidden');
    this.el('hud').classList.add('hidden');
    this.el('btn-continue').classList.toggle('hidden', !hasSave);
    const exportStart = document.getElementById('btn-export-txt-start');
    if (exportStart) exportStart.classList.toggle('hidden', !hasSave);
    const meta = this.el('save-meta');
    meta.classList.toggle('hidden', !hasSave);
    meta.textContent = hasSave ? t(`最近存档：${saveLabel}`) : '';
    this.saveLabel = saveLabel;
  }

  hideStart(): void {
    this.el('screen-start').classList.add('hidden');
    this.el('hud').classList.remove('hidden');
  }

  setGameActive(): void {
    this.hideAllOverlays();
    this.el('hud').classList.remove('hidden');
  }

  setHudVisible(visible: boolean): void {
    this.el('hud').classList.toggle('hidden', !visible);
  }

  private hideAllOverlays(): void {
    ['screen-upgrade', 'screen-inventory', 'screen-pause', 'screen-gameover', 'screen-help', 'screen-txt-modal'].forEach((id) => {
      document.getElementById(id)?.classList.add('hidden');
    });
    this.currentOverlay = 'none';
  }

  showPause(): void {
    this.hideAllOverlays();
    this.abandonConfirmArmed = false;
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) resetBtn.textContent = t('放弃航程');
    this.el('screen-pause').classList.remove('hidden');
    this.currentOverlay = 'pause';
  }

  showTxtModal(): void {
    this.hideAllOverlays();
    const textarea = document.getElementById('txt-save-textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.value = this.callbacks.onGetTxtSnapshot();
    }
    this.el('screen-txt-modal').classList.remove('hidden');
    this.currentOverlay = 'txt';
  }

  hideTxtModal(): void {
    this.el('screen-txt-modal').classList.add('hidden');
    this.el('screen-pause').classList.remove('hidden');
    this.currentOverlay = 'pause';
  }

  showHelp(): void {
    this.hideAllOverlays();
    this.el('screen-help').classList.remove('hidden');
    this.currentOverlay = 'help';
  }

  hideHelp(): void {
    this.el('screen-help').classList.add('hidden');
    this.currentOverlay = 'none';
  }

  showInventory(inventory: Inventory, stats: PlayerStats): void {
    this.hideAllOverlays();
    this.el('screen-inventory').classList.remove('hidden');
    this.currentOverlay = 'inventory';
    this.renderInventory(inventory, stats);
  }

  hideInventory(): void {
    this.el('screen-inventory').classList.add('hidden');
    this.currentOverlay = 'none';
  }

  showUpgrade(points: number, upgrades: Record<UpgradeKey, number>, stats: PlayerStats): void {
    this.hideAllOverlays();
    this.el('screen-upgrade').classList.remove('hidden');
    this.currentOverlay = 'upgrade';
    this.renderUpgrades(points, upgrades, stats);
  }

  hideUpgrade(): void {
    this.el('screen-upgrade').classList.add('hidden');
    this.currentOverlay = 'none';
  }

  updateUpgrade(points: number, upgrades: Record<UpgradeKey, number>, stats: PlayerStats): void {
    this.renderUpgrades(points, upgrades, stats);
  }

  private renderUpgrades(points: number, upgrades: Record<UpgradeKey, number>, stats: PlayerStats): void {
    this.setText('points-value', String(points));
    const grid = this.el('upgrade-grid');
    grid.innerHTML = '';
    (Object.keys(PROGRESSION.upgrades) as UpgradeKey[]).forEach((key) => {
      const def = PROGRESSION.upgrades[key];
      const level = upgrades[key] ?? 0;
      const disabled = points <= 0;
      const button = document.createElement('button');
      button.className = 'upgrade-card';
      button.disabled = disabled;
      button.style.setProperty('--accent', def.accent);
      const next = `下一级：${def.format(level + 1)}`;
      button.innerHTML = `
        <span class="upgrade-icon">${def.glyph}</span>
        <h3>${t(def.name)}</h3>
        <p>${t(def.description)}</p>
        <div class="upgrade-level"><span>${t(`等级 ${number(level)}`)}</span><span>${t(def.format(level))}</span></div>
        <div class="upgrade-next">${t(next)}</div>
        <span class="upgrade-take">${t(points > 0 ? '消耗 1 强化点' : '需要强化点')}</span>
      `;
      button.addEventListener('click', () => this.callbacks.onUpgrade(key));
      grid.appendChild(button);
    });
    this.el('points-value').parentElement?.classList.toggle('hidden', false);
    const bonus = this.el('heat-bonus');
    if (bonus) bonus.textContent = t(`半径 30m / ${stats.awakeningDuration.toFixed(1)}s`);
  }

  private renderInventory(inventory: Inventory, stats: PlayerStats): void {
    const grid = this.el('inventory-grid');
    grid.innerHTML = '';
    const empty = this.el('inventory-empty');
    empty.classList.toggle('hidden', inventory.slots.length > 0);
    this.setText('inventory-count', `${inventory.usedSlots} / ${inventory.capacity} 格`);

    for (const slot of inventory.slots) {
      const def = ITEMS[slot.id];
      const button = document.createElement('button');
      button.className = 'inv-slot populated';
      button.style.setProperty('--item-color', def.color);
      button.title = `${t(def.name)}\n${t(def.description)}\n${t('点击：')}${t(def.action)}`;
      button.innerHTML = `
        <span class="inv-slot-icon">${def.glyph}</span>
        <span class="inv-slot-name">${t(def.name)}</span>
        <span class="inv-slot-action">${t(def.action)}</span>
        <span class="inv-slot-count">×${slot.count}</span>
      `;
      button.addEventListener('click', () => this.callbacks.onUseItem(slot.id));
      grid.appendChild(button);
    }

    for (let i = inventory.slots.length; i < inventory.capacity; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      grid.appendChild(slot);
    }

    this.setText('inv-maxhp', number(stats.maxHp));
    this.setText('inv-armor', `${Math.round(stats.armor * 100)}%`);
    this.setText('inv-damage', `${Math.round(stats.damageMultiplier * 100)}%`);
    this.setText('inv-rate', `${Math.round(stats.fireRateMultiplier * 100)}%`);
    this.setText('inv-crit', `${Math.round(stats.critChance * 100)}%`);
    this.setText('inv-speed', `${Math.round(stats.speedMultiplier * 100)}%`);
  }

  updateHUD(state: HUDState, mouseX: number, mouseY: number): void {
    this.lastMouseX = mouseX;
    this.lastMouseY = mouseY;

    this.setText('hull-value', `${number(state.hp)} / ${number(state.maxHp)}`);
    this.setStyle('hull-bar', 'width', `${Math.max(0, (state.hp / state.maxHp) * 100)}%`);
    const hullBar = this.el('hull-bar');
    hullBar.classList.toggle('critical', state.hp / state.maxHp < 0.28);

    this.setText('stat-armor', `${Math.round(state.stats.armor * 100)}%`);
    this.setText('stat-damage', `${Math.round(state.stats.damageMultiplier * 100)}%`);
    this.setText('stat-crit', `${Math.round(state.stats.critChance * 100)}%`);
    this.setText('stat-speed', `${Math.round(state.stats.speedMultiplier * 100)}%`);

    this.setText('level-value', String(state.level));
    this.setText('xp-value', `${number(state.xp)} / ${number(state.xpRequired)} XP`);
    this.setStyle('xp-bar', 'width', `${Math.min(100, (state.xp / state.xpRequired) * 100)}%`);
    this.setText('passive-point-timer', `技能点 +10/秒 · ${Math.ceil(state.passivePointTimeLeft)}s`);
    this.el('upgrade-ready').classList.toggle('hidden', state.points <= 0);
    if (state.points > 0) {
      this.setText('hud-points-badge', String(state.points));
    }

    // Update tactical bar buttons
    this.el('btn-toggle-auto-attack').classList.toggle('active', state.autoAttack);
    this.el('btn-toggle-auto-counter').classList.toggle('active', state.autoCounter);
    this.el('btn-toggle-mouse-steer').classList.toggle('active', state.mouseSteer);

    this.setText('hunger-value', number(state.hunger));
    this.setText('thirst-value', number(state.thirst));
    this.setText('fuel-value', number(state.fuel));
    this.setStyle('hunger-bar', 'width', `${state.hunger}%`);
    this.setStyle('thirst-bar', 'width', `${state.thirst}%`);
    this.setStyle('fuel-bar', 'width', `${state.fuel}%`);

    this.el('cond-bleed').classList.toggle('hidden', !state.bleeding);
    this.el('cond-pain').classList.toggle('hidden', !state.pain);
    this.el('cond-regen').classList.toggle('hidden', !state.regen);

    this.setText('heat-value', `${Math.round(state.heat)}%`);
    this.setStyle('heat-liquid', 'height', `${state.heat}%`);
    const heatPanel = this.el('heat-panel');
    heatPanel.classList.toggle('awake', state.heatActive);
    this.setText('heat-state', state.heatActive ? `觉醒 ${state.heatTimeLeft.toFixed(1)}s` : '充能 +3%/s');
    this.setText('heat-bonus', state.heatActive ? `秒杀半径 30m` : `半径 30m / ${state.heatDuration.toFixed(1)}s`);

    const headingDeg = ((state.heading * 180) / Math.PI + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[Math.round(headingDeg / 45) % 8];
    this.setText('compass-value', `${dir} ${String(Math.round(headingDeg)).padStart(3, '0')}°`);
    this.setText('threat-value', `威胁 ${state.threat}`);
    this.setText('kills-value', `击杀 ${state.kills}`);

    this.el('low-hp-vignette').classList.toggle('active', state.hp / state.maxHp < 0.3);

    const crosshair = this.el('crosshair');
    crosshair.style.left = `${mouseX}px`;
    crosshair.style.top = `${mouseY}px`;
    crosshair.classList.toggle('hot', state.engagementMode === 'counter' || state.engagementMode === 'auto');
    const chLabel = document.getElementById('ch-label');
    if (chLabel) {
      chLabel.textContent =
        state.engagementMode === 'counter'
          ? 'COUNTER'
          : state.engagementMode === 'auto'
            ? 'AUTO-LOCK'
            : 'CANNON';
    }

    const targetPanel = this.el('target-panel');
    targetPanel.classList.toggle('hidden', !state.target);
    if (state.target) {
      const panelWidth = 195;
      const panelLeft = Math.min(window.innerWidth - panelWidth - 38, mouseX);
      const panelTop = Math.min(window.innerHeight - 92, mouseY);
      targetPanel.style.left = `${Math.max(6, panelLeft)}px`;
      targetPanel.style.top = `${Math.max(6, panelTop)}px`;
      this.setText('target-name', state.target.name);
      const modePrefix =
        state.engagementMode === 'counter'
          ? '⚡反击 · '
          : state.engagementMode === 'auto'
            ? '◎自动 · '
            : '';
      this.setText('target-state', `${modePrefix}${state.target.state}`);
      this.setText('target-hp', `${number(state.target.hp)} / ${number(state.target.maxHp)}`);
      this.setStyle('target-bar', 'width', `${Math.max(0, (state.target.hp / state.target.maxHp) * 100)}%`);
    }

    const bossPanel = this.el('boss-panel');
    bossPanel.classList.toggle('hidden', !state.boss);
    if (state.boss) {
      this.setText('boss-value', `${Math.round((state.boss.hp / state.boss.maxHp) * 100)}%`);
      this.setStyle('boss-bar', 'width', `${Math.max(0, (state.boss.hp / state.boss.maxHp) * 100)}%`);
    }
  }

  updateRadar(playerX: number, playerZ: number, heading: number, enemies: RadarEnemy[], loot: RadarLoot[], time: number): void {
    const canvas = this.el<HTMLCanvasElement>('radar');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const range = 195;
    const scale = (w / 2 - 14) / range;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 5, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(3,18,22,.82)';
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    grad.addColorStop(0, 'rgba(69,216,197,.07)');
    grad.addColorStop(0.7, 'rgba(69,216,197,.025)');
    grad.addColorStop(1, 'rgba(69,216,197,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Sweep.
    const sweep = time * 0.65;
    const sweepGrad = ctx.createConicGradient(sweep, cx, cy);
    sweepGrad.addColorStop(0, 'rgba(69,216,197,0.16)');
    sweepGrad.addColorStop(0.08, 'rgba(69,216,197,0.015)');
    sweepGrad.addColorStop(1, 'rgba(69,216,197,0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(69,216,197,.34)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * w * 0.48, cy + Math.sin(sweep) * w * 0.48);
    ctx.stroke();

    // Rings and axes.
    ctx.strokeStyle = 'rgba(116,204,193,.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (w / 2 - 8) * (i / 3), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx, h - 8);
    ctx.moveTo(8, cy);
    ctx.lineTo(w - 8, cy);
    ctx.stroke();

    // Islands.
    for (const island of ISLANDS) {
      const dx = island.x - playerX;
      const dz = island.z - playerZ;
      if (Math.abs(dx) > range + 50 || Math.abs(dz) > range + 50) continue;
      const x = cx + dx * scale;
      const y = cy - dz * scale;
      ctx.fillStyle = 'rgba(118,125,101,.32)';
      ctx.strokeStyle = 'rgba(169,176,145,.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, island.radius * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Loot.
    for (const item of loot) {
      const x = cx + (item.x - playerX) * scale;
      const y = cy - (item.z - playerZ) * scale;
      if (Math.hypot(x - cx, y - cy) > w / 2 - 9) continue;
      ctx.fillStyle = '#ffc04c';
      ctx.shadowColor = '#ffc04c';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Enemies.
    for (const enemy of enemies) {
      const x = cx + (enemy.x - playerX) * scale;
      const y = cy - (enemy.z - playerZ) * scale;
      if (Math.hypot(x - cx, y - cy) > w / 2 - 9) continue;
      if (enemy.boss) {
        ctx.fillStyle = '#ff9d3c';
        ctx.shadowColor = '#ff7b24';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,157,60,.45)';
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ed594b';
        ctx.shadowColor = '#ed594b';
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Player arrow.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);
    ctx.fillStyle = '#62e3cf';
    ctx.shadowColor = '#62e3cf';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    ctx.strokeStyle = 'rgba(140,210,203,.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  setPrompt(loot: { id: ItemId; amount: number } | null): void {
    const prompt = this.el('loot-prompt');
    prompt.classList.toggle('hidden', !loot);
    if (loot) {
      this.setText('loot-name', `${ITEMS[loot.id].name} ×${loot.amount}`);
    }
  }

  toast(text: string, kind: ToastKind = 'info'): void {
    const rail = this.el('toast-rail');
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.textContent = t(text);
    rail.appendChild(toast);
    while (rail.children.length > 5) rail.removeChild(rail.firstChild!);
    const timer = window.setTimeout(() => {
      toast.classList.add('out');
      window.setTimeout(() => toast.remove(), 380);
      this.toastTimers.delete(timer);
    }, 3200);
    this.toastTimers.add(timer);
  }

  killFeed(name: string, crit = false): void {
    const feed = this.el('kill-feed');
    const item = document.createElement('div');
    item.className = 'kill-item';
    item.innerHTML = `<b>${t(crit ? '暴击摧毁' : '已摧毁')}</b> ${t(name)}`;
    feed.appendChild(item);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild!);
    window.setTimeout(() => {
      item.style.opacity = '0';
      item.style.transition = 'opacity 350ms';
      window.setTimeout(() => item.remove(), 380);
    }, 4800);
  }

  showDamageNumber(x: number, y: number, amount: number, crit: boolean): void {
    const hud = this.el('hud');
    const node = document.createElement('div');
    node.className = `damage-number${crit ? ' crit' : ''}`;
    node.textContent = crit ? `${Math.round(amount)}!` : `${Math.round(amount)}`;
    node.style.left = `${x + (Math.random() - 0.5) * 18}px`;
    node.style.top = `${y - 10}px`;
    hud.appendChild(node);
    window.setTimeout(() => node.remove(), 850);
  }

  triggerDamage(): void {
    const flash = this.el('damage-flash');
    flash.classList.add('active');
    window.clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = window.setTimeout(() => flash.classList.remove('active'), 150);
  }

  setHeatFlash(active: boolean): void {
    this.el('heat-flash').classList.toggle('active', active);
  }

  showAbilityBanner(duration: number): void {
    const banner = this.el('ability-banner');
    banner.classList.remove('hidden');
    const text = banner.querySelector('span:last-child');
    if (text) text.textContent = t(`30 米内机械海兽瞬间熔毁 · ${duration.toFixed(1)} 秒`);
    window.clearTimeout(this.abilityTimer);
    this.abilityTimer = window.setTimeout(() => banner.classList.add('hidden'), 2500);
  }

  hideAbilityBanner(): void {
    window.clearTimeout(this.abilityTimer);
    this.el('ability-banner').classList.add('hidden');
  }

  showGameOver(level: number, kills: number, time: number, maxHeat: number): void {
    this.hideAllOverlays();
    this.el('screen-gameover').classList.remove('hidden');
    this.el('hud').classList.add('hidden');
    this.currentOverlay = 'none';
    this.setText('go-level', String(level));
    this.setText('go-kills', String(kills));
    this.setText('go-time', formatTime(time));
    this.setText('go-heat', `${Math.round(maxHeat)}%`);
    const copy = this.el('gameover-copy');
    copy.textContent =
      kills >= 25
        ? t('你把这片海域变成了机械坟场，但怒潮仍不会停。')
        : kills >= 10
          ? t('渔船的灯熄灭了，声呐上只剩潮汐的杂音。')
          : t('大海收回了它的铁皮。下一次，记得带着补给回来。');
  }

  flashSaved(): void {
    this.toast('进度已保存', 'good');
  }

  get overlay(): string {
    return this.currentOverlay;
  }

  setOverlay(overlay: 'none' | 'upgrade' | 'inventory' | 'pause' | 'help' | 'txt'): void {
    this.currentOverlay = overlay;
  }
}
