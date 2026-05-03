export type EventHandler<T = unknown> = (payload: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ListenerEntry {
  handler: EventHandler<any>;
  once: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = Record<string, any>;

export class EventBus<TEvents extends EventMap = EventMap> {
  private listeners = new Map<keyof TEvents, ListenerEntry[]>();

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const entries: ListenerEntry[] = this.listeners.get(event) ?? [];
    entries.push({ handler, once: false });
    this.listeners.set(event, entries);
  }

  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const entries: ListenerEntry[] = this.listeners.get(event) ?? [];
    entries.push({ handler, once: true });
    this.listeners.set(event, entries);
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;
    this.listeners.set(
      event,
      entries.filter((e) => e.handler !== handler)
    );
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const entries = this.listeners.get(event);
    if (!entries) return;
    const onceToRemove: EventHandler[] = [];
    for (const entry of entries) {
      entry.handler(payload);
      if (entry.once) onceToRemove.push(entry.handler);
    }
    for (const h of onceToRemove) {
      this.off(event, h);
    }
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

// Global bot event types
export interface BotEvents {
  spawned: { x: number; y: number; z: number; yaw: number; pitch: number; itemstates?: any[]; block_network_ids_are_hashes?: boolean };
  item_registry: { itemstates: any[] };
  chunk_loaded: { x: number; z: number; payload: Buffer; subChunkCount: number; dimension?: number };
  health_change: { health: number; maxHealth: number };
  player_position: { x: number; y: number; z: number; yaw: number; pitch: number };
  block_update: { x: number; y: number; z: number; blockStateId: number };
  entity_spawn: { uniqueId: bigint; runtimeId: bigint; type: string; x: number; y: number; z: number; velocity: { x: number; y: number; z: number }; isHostile: boolean };
  entity_despawn: { uniqueId: bigint };
  entity_move: { runtimeId: bigint; x: number; y: number; z: number; yaw: number; pitch: number };
  inventory_change: { slot: number; item: { id: number; count: number; metadata: number; damage?: number } | null };
  hunger_change: { hunger: number; saturation: number; exhaustion: number };
  player_death: { message: string };
  disconnect: { reason: string };
  fatal_disconnect: { reason: string };
  error: { message: string; error: Error };
  crafting_data: { recipes: any[] };
  dimension_change: { dimension: number; x: number; y: number; z: number };
  boss_event: { entityId: bigint; eventType: number; progress?: number; title?: string };
  portal_event: { eventType: number };
  level_event: { eventId: number; x: number; y: number; z: number };
  time_change: { time: number };
}
