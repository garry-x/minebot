import worldLoader from "prismarine-world";
import ChunkLoader from "prismarine-chunk";
import Registry from "prismarine-registry";
import { Vec3 } from "vec3";
import type { Vec3 as Vec3Type } from "../utils/vec3.js";
import { vec3 } from "../utils/vec3.js";
import { BlockCategory, CLIMBABLE_BLOCKS, WATER_BLOCKS, MINEABLE_BLOCKS, DOOR_BLOCKS } from "./types.js";
import type { EntityInfo, WorldBlockUpdate } from "./types.js";

export class WorldState {
  world: any;
  registry: any;
  private ChunkColumn: ReturnType<typeof ChunkLoader>;
  private entities = new Map<bigint, EntityInfo>();
  private playerPosition: Vec3Type = vec3(0, 0, 0);
  private currentDimension = 0; // 0=overworld, 1=nether, 2=end

  static RESOURCE_TYPES = new Set([
    "coal_ore", "deepslate_coal_ore",
    "iron_ore", "deepslate_iron_ore",
    "copper_ore", "deepslate_copper_ore",
    "gold_ore", "deepslate_gold_ore",
    "diamond_ore", "deepslate_diamond_ore",
    "emerald_ore", "deepslate_emerald_ore",
    "redstone_ore", "deepslate_redstone_ore",
    "lapis_ore", "deepslate_lapis_ore",
    "oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log",
    "stone", "cobblestone", "diorite", "andesite", "granite", "deepslate",
  ]);

  constructor(version: string) {
    this.registry = Registry(version);
    this.ChunkColumn = ChunkLoader(this.registry);
    this.world = new (worldLoader(version))(
      (chunkX: number, chunkZ: number) =>
        new this.ChunkColumn({ x: chunkX, z: chunkZ })
    );
  }

  private itemRuntimeToName = new Map<number, string>();

  loadItemStates(itemstates: Array<{ name: string; runtime_id: number; component_based: boolean }>): void {
    (this.registry as any).loadItemStates(itemstates);
    for (const state of itemstates) {
      this.itemRuntimeToName.set(state.runtime_id, state.name);
    }
  }

  getItemName(runtimeId: number): string | undefined {
    const name = this.itemRuntimeToName.get(runtimeId);
    if (name) return name;

    const item = this.registry.items?.[runtimeId];
    if (item?.name) {
      this.itemRuntimeToName.set(runtimeId, item.name);
      return item.name;
    }
    return undefined;
  }

  updatePlayerPosition(pos: Vec3Type): void {
    this.playerPosition = pos;
  }

  getPlayerPosition(): Vec3Type {
    return this.playerPosition;
  }

  setDimension(dim: number): void {
    this.currentDimension = dim;
  }

  getDimension(): number {
    return this.currentDimension;
  }

  getBlock(pos: Vec3Type): any | null {
    const chunk = this.world.getLoadedColumn(pos.x >> 4, pos.z >> 4);
    if (!chunk) return null;
    return chunk.getBlock(this._toPrismarineVec3(pos));
  }

  async addColumn(x: number, z: number, column: any): Promise<void> {
    return this.world.setColumn(x, z, column);
  }

  getColumn(x: number, z: number): any | null {
    return this.world.getLoadedColumn(x, z);
  }

  createColumn(x: number, z: number): any {
    return new this.ChunkColumn({ x, z });
  }

  /**
   * Get all loaded chunk columns.
   * NOTE: Accesses internal `prismarine-world` property `columns`.
   * Compatible with prismarine-world v3.x.
   */
  getColumns(): Map<string, any> {
    const result = new Map<string, any>();
    const columns = (this.world as any).columns ?? {};
    for (const key of Object.keys(columns)) {
      result.set(key, columns[key]);
    }
    return result;
  }

  addEntity(entity: EntityInfo): void {
    this.entities.set(entity.id, entity);
  }

  removeEntity(id: bigint): void {
    this.entities.delete(id);
  }

  updateEntityPosition(runtimeId: bigint, pos: Vec3Type): void {
    for (const entity of this.entities.values()) {
      if (entity.runtimeId === runtimeId) {
        entity.position = pos;
        return;
      }
    }
  }

  clearEntities(): void {
    this.entities.clear();
  }

  purgeEntitiesPastDistance(center: Vec3Type, distance: number): number {
    const dist2 = distance * distance;
    let removed = 0;
    for (const [id, entity] of this.entities) {
      const dx = entity.position.x - center.x;
      const dy = entity.position.y - center.y;
      const dz = entity.position.z - center.z;
      if (dx * dx + dy * dy + dz * dz > dist2) {
        this.entities.delete(id);
        removed++;
      }
    }
    return removed;
  }

  getEntities(): EntityInfo[] {
    return Array.from(this.entities.values());
  }

  getNearbyEntities(pos: Vec3Type, radius: number): EntityInfo[] {
    const r2 = radius * radius;
    return this.getEntities().filter((e) => {
      const dx = e.position.x - pos.x;
      const dy = e.position.y - pos.y;
      const dz = e.position.z - pos.z;
      return dx * dx + dy * dy + dz * dz <= r2;
    });
  }

  findBlocks(
    predicate: (block: any) => boolean,
    center: Vec3Type,
    radius: number
  ): Vec3Type[] {
    const results: Vec3Type[] = [];
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const pos = vec3(cx + dx, cy + dy, cz + dz);
          const block = this.getBlock(pos);
          if (block && predicate(block)) {
            results.push(pos);
          }
        }
      }
    }
    return results;
  }

  findOres(center: Vec3Type, radius: number): Vec3Type[] {
    return this.findBlocks(
      (block) => WorldState.RESOURCE_TYPES.has(block.name),
      center,
      radius
    );
  }

  isBlockSolid(pos: Vec3Type): boolean {
    const block = this.getBlock(pos);
    if (!block) return false;
    return block.boundingBox !== "empty";
  }

  isWaterBlock(pos: Vec3Type): boolean {
    const block = this.getBlock(pos);
    if (!block) return false;
    return WATER_BLOCKS.has(block.name);
  }

  isWaterSurface(pos: Vec3Type): boolean {
    if (!this.isWaterBlock(pos)) return false;
    const above = this.getBlock({ x: pos.x, y: pos.y + 1, z: pos.z });
    return !above || above.boundingBox === "empty";
  }

  isClimbable(pos: Vec3Type): boolean {
    const block = this.getBlock(pos);
    if (!block) return false;
    return CLIMBABLE_BLOCKS.has(block.name);
  }

  isMineable(pos: Vec3Type): boolean {
    const block = this.getBlock(pos);
    if (!block) return false;
    return MINEABLE_BLOCKS.has(block.name);
  }

  isDoor(pos: Vec3Type): boolean {
    const block = this.getBlock(pos);
    if (!block) return false;
    return DOOR_BLOCKS.has(block.name);
  }

  getBlockCategory(pos: Vec3Type): BlockCategory {
    const block = this.getBlock(pos);
    if (!block) return BlockCategory.AIR;
    if (WATER_BLOCKS.has(block.name)) return BlockCategory.LIQUID;
    if (CLIMBABLE_BLOCKS.has(block.name)) return BlockCategory.CLIMBABLE;
    if (DOOR_BLOCKS.has(block.name)) return BlockCategory.DOOR;
    if (MINEABLE_BLOCKS.has(block.name)) return BlockCategory.MINEABLE;
    if (block.boundingBox !== "empty") return BlockCategory.SOLID;
    return BlockCategory.AIR;
  }

  applyBlockUpdate(update: WorldBlockUpdate): void {
    const chunk = this.world.getLoadedColumn(
      update.position.x >> 4,
      update.position.z >> 4
    );
    if (!chunk) return;
    const rx = update.position.x & 15;
    const ry = update.position.y;
    const rz = update.position.z & 15;
    chunk.setBlockStateId(new Vec3(rx, ry, rz), update.blockStateId);
  }

  private _toPrismarineVec3(pos: Vec3Type): Vec3 {
    return new Vec3(pos.x, pos.y, pos.z);
  }
}
