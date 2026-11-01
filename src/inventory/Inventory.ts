import { ITEMS, ItemId, ItemMap } from '../config/balance';

export interface InventorySlot {
  id: ItemId;
  count: number;
}

export class Inventory {
  readonly capacity = 24;
  slots: InventorySlot[] = [];

  reset(): void {
    this.slots = [];
  }

  get usedSlots(): number {
    return this.slots.length;
  }

  add(id: ItemId, amount: number): number {
    const def = ITEMS[id];
    let remaining = Math.max(0, Math.floor(amount));
    let added = 0;

    for (const slot of this.slots) {
      if (slot.id !== id || slot.count >= def.maxStack) continue;
      const space = def.maxStack - slot.count;
      const take = Math.min(space, remaining);
      slot.count += take;
      remaining -= take;
      added += take;
      if (remaining <= 0) return added;
    }

    while (remaining > 0 && this.slots.length < this.capacity) {
      const take = Math.min(def.maxStack, remaining);
      this.slots.push({ id, count: take });
      remaining -= take;
      added += take;
    }

    return added;
  }

  count(id: ItemId): number {
    return this.slots.reduce((sum, slot) => (slot.id === id ? sum + slot.count : sum), 0);
  }

  remove(id: ItemId, amount = 1): boolean {
    if (this.count(id) < amount) return false;
    let remaining = amount;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (slot.id !== id) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) this.slots.splice(i, 1);
    }
    return true;
  }

  clear(): void {
    this.slots = [];
  }

  toMap(): Partial<ItemMap> {
    const map: Partial<ItemMap> = {};
    for (const slot of this.slots) {
      map[slot.id] = (map[slot.id] ?? 0) + slot.count;
    }
    return map;
  }

  loadMap(map: Partial<ItemMap> | undefined): void {
    this.slots = [];
    if (!map) return;
    (Object.keys(map) as ItemId[]).forEach((id) => {
      if (!ITEMS[id]) return;
      const amount = Math.max(0, Math.floor(map[id] ?? 0));
      if (amount > 0) this.add(id, amount);
    });
  }
}
