export type ToastKind = 'info' | 'good' | 'warn' | 'bad';

export interface GameEventMap {
  toast: { text: string; kind?: ToastKind };
  kill: { name: string; crit?: boolean };
  xp: { amount: number; total: number };
  levelUp: { level: number; points: number };
  heatStart: { duration: number; radius: number };
  heatEnd: Record<string, never>;
  loot: { item: string; amount: number };
  damage: { amount: number; kind: 'enemy' | 'survival' };
  gameOver: { kills: number; level: number; time: number; maxHeat: number };
  saved: Record<string, never>;
  target: { name: string; hp: number; maxHp: number; state: string } | null;
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class EventBus {
  private handlers = new Map<keyof GameEventMap, Set<(payload: unknown) => void>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => set?.delete(handler as (payload: unknown) => void);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
