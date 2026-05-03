export interface EventEntry {
  timestamp: string;   // "HH:MM:SS"
  source: string;      // "BT" | "GATHER" | "COMBAT" | "CRAFT" | "SYS"
  message: string;
}

export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private _count = 0;

  constructor(private capacity: number = 200) {
    this.buffer = new Array<T>(capacity);
  }

  push(item: T): void {
    this.buffer[this.head % this.capacity] = item;
    this.head++;
    this._count++;
  }

  toArray(): T[] {
    const actual = Math.min(this._count, this.capacity);
    if (this.head <= this.capacity) {
      return this.buffer.slice(0, this.head) as T[];
    }
    const start = this.head % this.capacity;
    return [...this.buffer.slice(start), ...this.buffer.slice(0, start)] as T[];
  }

  get length(): number {
    return Math.min(this._count, this.capacity);
  }

  clear(): void {
    this.head = 0;
    this._count = 0;
    this.buffer = new Array<T>(this.capacity);
  }
}
