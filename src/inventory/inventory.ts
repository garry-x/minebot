import { getLogger } from "../utils/logger.js";
import type { InventorySlot } from "../world/types.js";

export const INVENTORY_SLOTS = 36;
export const HOTBAR_SIZE = 9;
export const ARMOR_SLOTS = 4;
export const OFFHAND_SLOT = 1;

export const ARMOR_HELMET = 0;
export const ARMOR_CHESTPLATE = 1;
export const ARMOR_LEGGINGS = 2;
export const ARMOR_BOOTS = 3;

export class Inventory {
  private static ARMOR_PRIORITY: Record<string, number> = {
    leather: 1,
    chainmail: 2,
    gold: 3,
    iron: 4,
    diamond: 5,
    netherite: 6,
  };

  private slots: Map<number, InventorySlot> = new Map();
  private armorSlots: Map<number, InventorySlot> = new Map();
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

  setArmor(slot: number, item: InventorySlot | null): void {
    if (item) {
      this.armorSlots.set(slot, item);
    } else {
      this.armorSlots.delete(slot);
    }
  }

  getArmor(slot: number): InventorySlot | null {
    return this.armorSlots.get(slot) ?? null;
  }

  hasArmorEquipped(): boolean {
    return this.armorSlots.size > 0;
  }

  getArmorMaterial(slot: number): string | null {
    const item = this.getArmor(slot);
    if (!item?.name) return null;
    const name = item.name.replace("minecraft:", "");
    const parts = name.split("_");
    if (parts.length > 1) return parts[0];
    return null;
  }

  isBetterArmor(current: string | null, candidate: string): boolean {
    if (!current) return true;
    const currPriority = Inventory.ARMOR_PRIORITY[current] ?? 0;
    const candPriority = Inventory.ARMOR_PRIORITY[candidate] ?? 0;
    return candPriority > currPriority;
  }

  getArmorType(slot: number): string {
    return ["helmet", "chestplate", "leggings", "boots"][slot] ?? "unknown";
  }

  findBestArmor(slot: number): number {
    const armorType = this.getArmorType(slot);
    const current = this.getArmorMaterial(slot);
    let bestSlot = -1;
    let bestPriority = current ? (Inventory.ARMOR_PRIORITY[current] ?? 0) : -1;

    for (const [slotId, item] of this.slots) {
      if (!item.name) continue;
      if (!item.name.includes(armorType)) continue;
      const material = this.getMaterialFromName(item.name);
      const priority = Inventory.ARMOR_PRIORITY[material] ?? 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestSlot = slotId;
      }
    }
    return bestSlot;
  }

  private getMaterialFromName(name: string): string {
    const parts = name.replace("minecraft:", "").split("_");
    return parts[0] ?? parts[1];
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

  getEmptyHotbarSlot(): number {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (!this.slots.has(i)) return i;
    }
    return -1;
  }

  isFull(): boolean {
    return this.slots.size >= INVENTORY_SLOTS;
  }

  getAllItems(): Map<number, InventorySlot> {
    return new Map(this.slots);
  }

  clear(): void {
    this.slots.clear();
    this.armorSlots.clear();
    this.selectedSlot = 0;
  }

  logContents(): void {
    const logger = getLogger();
    logger.info("--- Inventory ---");
    for (const [slot, item] of this.slots) {
      logger.info(`  Slot ${slot}: ${item.name ?? item.itemId} x${item.count}`);
    }
    logger.info("--- Armor ---");
    for (const [slot, item] of this.armorSlots) {
      logger.info(`  Armor[${slot}] (${this.getArmorType(slot)}): ${item.name ?? item.itemId} x${item.count}`);
    }
    logger.info(`  Selected slot: ${this.selectedSlot}`);
  }
}
