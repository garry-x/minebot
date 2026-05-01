import { getLogger } from "../utils/logger.js";
import type { InventorySlot } from "../world/types.js";

export const INVENTORY_SLOTS = 36;
export const HOTBAR_SIZE = 9;
export const ARMOR_SLOTS = 4;
export const OFFHAND_SLOT = 1;

export class Inventory {
  private slots: Map<number, InventorySlot> = new Map();
  private selectedSlot = 0;

  setSlot(slot: number, item: InventorySlot | null): void {
    if (item) {
      this.slots.set(slot, item);
    } else {
      this.slots.delete(slot);
    }
  }

  getSlot(slot: number): InventorySlot | null {
    return this.slots.get(slot) ?? null;
  }

  setSelectedSlot(slot: number): void {
    this.selectedSlot = Math.min(Math.max(0, slot), HOTBAR_SIZE - 1);
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  getSelectedItem(): InventorySlot | null {
    return this.getSlot(this.selectedSlot);
  }

  hasItem(name: string): boolean {
    return this.findItem(name) !== -1;
  }

  countItem(name: string): number {
    let total = 0;
    for (const [, item] of this.slots) {
      if (item.name === name) {
        total += item.count;
      }
    }
    return total;
  }

  findItem(name: string): number {
    for (const [slot, item] of this.slots) {
      if (item.name === name) return slot;
    }
    return -1;
  }

  findHotbarItem(name: string): number {
    for (const [slot, item] of this.slots) {
      if (slot < HOTBAR_SIZE && item.name === name) return slot;
    }
    return -1;
  }

  getEmptySlots(): number[] {
    const empty: number[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      if (!this.slots.has(i)) empty.push(i);
    }
    return empty;
  }

  isFull(): boolean {
    return this.slots.size >= INVENTORY_SLOTS;
  }

  getAllItems(): Map<number, InventorySlot> {
    return new Map(this.slots);
  }

  clear(): void {
    this.slots.clear();
    this.selectedSlot = 0;
  }

  logContents(): void {
    const logger = getLogger();
    logger.info("--- Inventory ---");
    for (const [slot, item] of this.slots) {
      logger.info(`  Slot ${slot}: ${item.name ?? item.itemId} x${item.count}`);
    }
    logger.info(`  Selected slot: ${this.selectedSlot}`);
  }
}
