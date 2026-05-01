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
  spawned: { x: number; y: number; z: number; yaw: number; pitch: number };
  health_change: { health: number; maxHealth: number };
  player_position: { x: number; y: number; z: number; yaw: number; pitch: number };
  block_update: { x: number; y: number; z: number; blockStateId: number };
  entity_spawn: { id: bigint; type: string; x: number; y: number; z: number };
  entity_despawn: { id: bigint };
  entity_move: { id: bigint; x: number; y: number; z: number };
  inventory_change: { slot: number; item: { id: number; count: number; metadata: number } | null };
  player_death: { message: string };
  disconnect: { reason: string };
  error: { message: string; error: Error };
}
