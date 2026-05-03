import { createRequire } from "node:module";
import type { Client } from "bedrock-protocol";
import { getLogger } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const SubChunk118 = require("prismarine-chunk/src/bedrock/1.18/SubChunk");
const Stream = require("prismarine-chunk/src/bedrock/common/Stream");
const StorageType = require("prismarine-chunk/src/bedrock/common/constants").StorageType;

interface PendingChunk {
  x: number;
  z: number;
  dimension: number;
  column: any;
  remaining: Set<number>;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_REQUESTS_PER_BATCH = 24;
const REQUEST_BATCH_INTERVAL_MS = 50;
const CHUNK_TIMEOUT_MS = 10000;
const SECTION_MIN_Y = -4;
const SECTION_MAX_Y = 19;
const CHUNKS_PER_FLUSH = 4;

export class SubchunkRequestManager {
  private client: Client;
  private pending = new Map<string, PendingChunk>();
  private requestQueue: Array<{ x: number; z: number; dimension: number; column: any }> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  onLevelChunk(x: number, z: number, dimension: number, column: any): void {
    const key = `${x},${z},${dimension}`;
    if (this.pending.has(key)) return;
    const remaining = new Set<number>();
    for (let y = SECTION_MIN_Y; y <= SECTION_MAX_Y; y++) remaining.add(y);
    const timer = setTimeout(() => {
      getLogger().warn({ x, z }, "Subchunk request timed out");
      this.pending.delete(key);
    }, CHUNK_TIMEOUT_MS);
    this.pending.set(key, { x, z, dimension, column, remaining, timer });
    this.requestQueue.push({ x, z, dimension, column });
    this.scheduleBatch();
  }

  onSubchunk(packet: any): void {
    const key = `${packet.origin.x},${packet.origin.z},${packet.dimension}`;
    const pending = this.pending.get(key);
    if (!pending) return;
    const entries: Array<{ dx: number; dy: number; dz: number; result: string | number; payload?: Uint8Array }> = packet.entries ?? [];
    for (const entry of entries) {
      pending.remaining.delete(entry.dy);
      if ((entry.result === "success" || entry.result === 1) && entry.payload) {
        this.decodeSection(pending.column, entry.dy, entry.payload);
      }
    }
    if (pending.remaining.size === 0) {
      clearTimeout(pending.timer);
      this.pending.delete(key);
    }
  }

  onUpdateSubchunkBlocks(packet: any): void {
    getLogger().debug(
      { sx: packet.x, sy: packet.y, sz: packet.z, count: packet.blocks?.length ?? 0 },
      "update_subchunk_blocks received (not yet handled)"
    );
  }

  destroy(): void {
    if (this.batchTimer) { clearTimeout(this.batchTimer); this.batchTimer = null; }
    for (const [, p] of this.pending) clearTimeout(p.timer);
    this.pending.clear();
    this.requestQueue.length = 0;
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => { this.batchTimer = null; this.flushBatch(); }, REQUEST_BATCH_INTERVAL_MS);
  }

  private flushBatch(): void {
    if (this.requestQueue.length === 0) return;
    const entries = this.requestQueue.splice(0, CHUNKS_PER_FLUSH);
    for (const { x, z, dimension } of entries) {
      const requests: Array<{ dx: number; dy: number; dz: number }> = [];
      for (let y = SECTION_MIN_Y; y <= SECTION_MAX_Y; y++) requests.push({ dx: 0, dy: y, dz: 0 });
      this.client.queue("subchunk_request", { dimension, origin: { x, y: 0, z }, requests });
    }
    if (this.requestQueue.length > 0) this.scheduleBatch();
  }

  private decodeSection(column: any, y: number, payload: Uint8Array): void {
    try {
      const section = new SubChunk118(column.registry, column.Block, { y, subChunkVersion: column.subChunkVersion ?? 9 });
      const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      const stream = new Stream(buf);
      section.decode(StorageType.Runtime, stream);
      column.setSection(y, section);
    } catch (e: any) {
      getLogger().error({ err: e, y }, "Failed to decode subchunk section");
    }
  }
}
