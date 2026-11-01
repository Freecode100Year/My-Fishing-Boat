import { BOAT, GAME_VERSION, ITEMS, ItemId, PROGRESSION, SaveData, UpgradeKey } from '../config/balance';
import { clamp, formatTime } from '../utils/math';

const KEY = 'rattide.save.v1';
const TXT_MARKER_START = '=== RAT TIDE SAVE DATA START ===';
const TXT_MARKER_END = '=== RAT TIDE SAVE DATA END ===';

export class SaveSystem {
  save(data: SaveData): boolean {
    try {
      const normalized = this.normalizeSaveData(data) ?? data;
      localStorage.setItem(KEY, JSON.stringify(normalized));
      return true;
    } catch (err) {
      console.warn('Unable to save game', err);
      return false;
    }
  }

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return this.normalizeSaveData(parsed);
    } catch (err) {
      console.warn('Unable to load save', err);
      return null;
    }
  }

  hasSave(): boolean {
    return !!this.load();
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Storage may be disabled; fail silently.
    }
  }

  getMetaLabel(): string {
    const data = this.load();
    if (!data) return '';
    const date = new Date(data.timestamp);
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return `LV ${data.level} · ${data.kills} 击杀 · ${stamp}`;
  }

  /** Format SaveData into a human-readable + machine-parseable .txt archive string */
  exportToTxtString(data: SaveData): string {
    const normalized = this.normalizeSaveData(data) ?? data;
    const date = new Date(normalized.timestamp);
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

    const u = normalized.upgrades;
    const invSummary = (Object.keys(normalized.inventory) as ItemId[])
      .filter((k) => (normalized.inventory[k] ?? 0) > 0)
      .map((k) => `${ITEMS[k]?.name ?? k}x${normalized.inventory[k]}`)
      .join(', ') || '无';

    const lines = [
      '# RAT TIDE / 机械怒潮 — 航行存档文件 (.txt)',
      `# 导出时间: ${stamp}`,
      `# 船长等级: LV ${normalized.level} (${Math.round(normalized.xp)} XP) | 可用强化点: ${normalized.points}`,
      `# 累计击杀: ${normalized.kills} | 航行时长: ${formatTime(normalized.playTime)} | 当前热力: ${Math.round(normalized.heat)}%`,
      `# 船体状态: HP ${Math.round(normalized.hp)} | 饥饿 ${Math.round(normalized.hunger)} | 淡水 ${Math.round(normalized.thirst)} | 柴油 ${Math.round(normalized.fuel)}`,
      `# 强化等级: 装甲Lv.${u.armor} | 耐久Lv.${u.hull} | 攻击Lv.${u.damage} | 频率Lv.${u.frequency} | 暴击Lv.${u.crit} | 动力Lv.${u.power}`,
      `# 船舱物资: ${invSummary}`,
      '# 请勿破坏下方数据块标记，可通过游戏内「导入 TXT 存档」直接恢复进度。',
      TXT_MARKER_START,
      JSON.stringify(normalized, null, 2),
      TXT_MARKER_END,
      '',
    ];
    return lines.join('\n');
  }

  /** Trigger browser download of the .txt save file */
  downloadTxtSave(data: SaveData): string {
    const txt = this.exportToTxtString(data);
    const date = new Date(data.timestamp || Date.now());
    const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    const filename = `rat_tide_save_LV${data.level}_${datePart}.txt`;

    try {
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
    } catch (err) {
      console.warn('Blob download fallback required', err);
    }
    return txt;
  }

  /** Parse a .txt save file (supports our formatted .txt, raw JSON, or base64 JSON) */
  parseTxtSave(rawText: string): SaveData | null {
    if (!rawText || typeof rawText !== 'string') return null;
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    let jsonCandidate = trimmed;

    const startIdx = trimmed.indexOf(TXT_MARKER_START);
    const endIdx = trimmed.indexOf(TXT_MARKER_END);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonCandidate = trimmed.slice(startIdx + TXT_MARKER_START.length, endIdx).trim();
    } else {
      // Fallback: find the first '{' and last '}' in the text file
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
      }
    }

    try {
      const parsed = JSON.parse(jsonCandidate) as Partial<SaveData>;
      return this.normalizeSaveData(parsed);
    } catch (err) {
      console.warn('Failed to parse TXT save file', err);
      return null;
    }
  }

  normalizeSaveData(raw: Partial<SaveData> | null | undefined): SaveData | null {
    if (!raw || typeof raw !== 'object') return null;
    // Allow version 1 or omitted version in hand-edited txt saves
    if (raw.version !== undefined && raw.version !== GAME_VERSION && raw.version !== 1 && raw.version !== 2) {
      return null;
    }

    const upgrades: Record<UpgradeKey, number> = {
      armor: 0,
      hull: 0,
      damage: 0,
      frequency: 0,
      crit: 0,
      power: 0,
    };
    const rawUpgrades = (raw.upgrades ?? {}) as Record<string, number>;
    (Object.keys(upgrades) as UpgradeKey[]).forEach((k) => {
      const val = rawUpgrades[k] ?? (k === 'power' ? rawUpgrades.mobility : 0) ?? 0;
      const level = Number(val) || 0;
      upgrades[k] = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
    });

    const maxHp = BOAT.maxHp + upgrades.hull * PROGRESSION.upgrades.hull.perLevel;
    const inventory: Partial<Record<ItemId, number>> = {};
    if (raw.inventory && typeof raw.inventory === 'object') {
      (Object.keys(ITEMS) as ItemId[]).forEach((id) => {
        const count = Math.floor(Number((raw.inventory as Record<string, number>)[id]) || 0);
        if (count > 0) inventory[id] = clamp(count, 0, ITEMS[id].maxStack * 24);
      });
    }

    return {
      version: GAME_VERSION,
      timestamp: Number(raw.timestamp) || Date.now(),
      playTime: Math.max(0, Number(raw.playTime) || 0),
      kills: Math.max(0, Math.floor(Number(raw.kills) || 0)),
      playerX: clamp(Number(raw.playerX) || 0, -400, 400),
      playerZ: clamp(Number(raw.playerZ) || 0, -400, 400),
      heading: Number(raw.heading) || 0,
      level: Math.max(1, Math.floor(Number(raw.level) || 1)),
      xp: Math.max(0, Number(raw.xp) || 0),
      points: Number.isFinite(Number(raw.points)) ? Math.max(0, Math.floor(Number(raw.points))) : 0,
      passivePointTimer: clamp(Number(raw.passivePointTimer) || 0, 0, PROGRESSION.passivePointInterval - 0.01),
      upgrades,
      hp: clamp(Number(raw.hp ?? maxHp), 1, maxHp),
      hunger: clamp(Number(raw.hunger ?? 100), 0, 100),
      thirst: clamp(Number(raw.thirst ?? 100), 0, 100),
      fuel: clamp(Number(raw.fuel ?? BOAT.fuelMax), 0, BOAT.fuelMax),
      inventory,
      heat: clamp(Number(raw.heat ?? 0), 0, 99.9),
      maxHeatReached: clamp(Number(raw.maxHeatReached ?? 0), 0, 100),
      autoAttack: raw.autoAttack ?? true,
      autoCounter: raw.autoCounter ?? true,
      mouseSteer: raw.version === 1 ? false : raw.mouseSteer ?? false,
    };
  }
}
