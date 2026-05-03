# Subchunk Protocol Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the bot to load block data from Bedrock 1.26 servers by implementing the subchunk request protocol (packet 0xaf/0xae).

**Architecture:** A `SubchunkRequestManager` class in the connection layer handles the subchunk polling loop. When `level_chunk` arrives with `sub_chunk_count = -2`, the manager sends `subchunk_request` for all 24 sections (Y=-4..19). The server responds with `subchunk` packets containing per-section payloads. The manager decodes each payload into a `SubChunk118` and installs it into the chunk column.

**Tech Stack:** TypeScript, `bedrock-protocol` v3.55.1 (for queue/write/event system), `prismarine-chunk` v1.40.0 (SubChunk118 + Stream + StorageType), `createRequire` for CommonJS interop.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/connection/subchunk-manager.ts` | **Create** | Subchunk polling loop, request batching, payload decoding |
| `src/connection/connection.ts` | **Modify** | Route `subchunk`/`update_subchunk_blocks` packets + `level_chunk(-2)` to manager |
| `src/bot.ts` | **Modify** | Change `chunk_loaded` handler: decode biomes for subChunkCount=-2, don't skip |

---

### Task 1: SubchunkRequestManager — Core Class

**Files:**
- Create: `src/connection/subchunk-manager.ts`

- [ ] **Step 1: Create the file with the module skeleton**

```typescript
import { createRequire } from "node:module";
import type { Client } from "bedrock-protocol";
import { getLogger } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const SubChunk118 = require("prismarine-chunk/src/bedrock/1.18/SubChunk");
const { Stream } = require("prismarine-chunk/src/bedrock/common/Stream");
const { StorageType } = require("prismarine-chunk/src/bedrock/common/constants");

interface PendingChunk {
  x: number;
  z: number;
  dimension: number;
  column: any; // ChunkColumn180 instance
  remaining: Set<number>; // section Y indices still waiting
  timer: ReturnType<typeof setTimeout>;
}

interface SubchunkEntry {
  dx: number;
  dy: number;
  dz: number;
  result: number;
  payload?: Uint8Array;
}

const MAX_REQUESTS_PER_BATCH = 24;
const REQUEST_BATCH_INTERVAL_MS = 50;
const CHUNK_TIMEOUT_MS = 10000;
const SECTION_MIN_Y = -4;
const SECTION_MAX_Y = 19;
const SECTION_COUNT = SECTION_MAX_Y - SECTION_MIN_Y + 1; // 24

export class SubchunkRequestManager {
  private client: Client;
  private pending = new Map<string, PendingChunk>();
  private requestQueue: Array<{
    x: number;
    z: number;
    dimension: number;
    column: any;
  }> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  // ... methods below
}
```

- [ ] **Step 2: Implement `onLevelChunk(x, z, dimension, column)`**

Add this method to `SubchunkRequestManager`:

```typescript
  onLevelChunk(x: number, z: number, dimension: number, column: any): void {
    const key = `${x},${z},${dimension}`;
    if (this.pending.has(key)) return;

    const remaining = new Set<number>();
    for (let y = SECTION_MIN_Y; y <= SECTION_MAX_Y; y++) {
      remaining.add(y);
    }

    const timer = setTimeout(() => {
      getLogger().warn({ x, z }, "Subchunk request timed out, releasing");
      this.pending.delete(key);
    }, CHUNK_TIMEOUT_MS);

    this.pending.set(key, { x, z, dimension, column, remaining, timer });
    this.requestQueue.push({ x, z, dimension, column });
    this.scheduleBatch();
  }
```

- [ ] **Step 3: Implement `scheduleBatch()` and `flushBatch()`**

```typescript
  private scheduleBatch(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushBatch();
    }, REQUEST_BATCH_INTERVAL_MS);
  }

  private flushBatch(): void {
    if (this.requestQueue.length === 0) return;

    const entries = this.requestQueue.splice(0, this.requestQueue.length);
    for (const { x, z, dimension, column } of entries) {
      const key = `${x},${z},${dimension}`;

      const requests: Array<{ dx: number; dy: number; dz: number }> = [];
      for (let y = SECTION_MIN_Y; y <= SECTION_MAX_Y; y++) {
        requests.push({ dx: 0, dy: y, dz: 0 });
      }

      this.client.queue("subchunk_request", {
        dimension,
        origin: { x, y: 0, z },
        requests,
      });
    }
  }
```

- [ ] **Step 4: Implement `onSubchunk(packet)` — decode and install sections**

```typescript
  onSubchunk(packet: any): void {
    const key = `${packet.origin.x},${packet.origin.z},${packet.dimension}`;
    const pending = this.pending.get(key);
    if (!pending) return;

    const entries: SubchunkEntry[] = packet.entries ?? [];
    for (const entry of entries) {
      const sectionY = entry.dy;
      pending.remaining.delete(sectionY);

      if (entry.result === 1 && entry.payload) {
        this.decodeSection(pending.column, sectionY, entry.payload);
      }
    }

    if (pending.remaining.size === 0) {
      clearTimeout(pending.timer);
      this.pending.delete(key);
    }
  }

  private decodeSection(column: any, y: number, payload: Uint8Array): void {
    const section = new SubChunk118(column.registry, column.Block, {
      y,
      subChunkVersion: column.subChunkVersion ?? 9,
    });

    const stream = new Stream(Buffer.isBuffer(payload) ? payload : Buffer.from(payload));
    section.decode(StorageType.Runtime, stream);
    column.setSection(y, section);
  }
```

- [ ] **Step 5: Implement `onUpdateSubchunkBlocks(packet)`**

```typescript
  onUpdateSubchunkBlocks(packet: any): void {
    // Apply block updates to loaded chunks
    // packet.x, packet.y, packet.z define the subchunk position
    // packet.blocks[{position:{x,y,z,x_component,y_component,z_component}, runtime_id, flags}]
    // For now: log and skip (full block update parsing is Phase 2)
    getLogger().debug(
      { sx: packet.x, sy: packet.y, sz: packet.z, count: packet.blocks?.length ?? 0 },
      "update_subchunk_blocks received (not yet handled)"
    );
  }
```

- [ ] **Step 6: Implement `destroy()` to clean up**

```typescript
  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
    this.requestQueue.length = 0;
  }
```

- [ ] **Step 7: Run typecheck to verify**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/connection/subchunk-manager.ts
git commit -m "feat(connection): add SubchunkRequestManager for 1.26 subchunk protocol"
```

---

### Task 2: Wire SubchunkRequestManager into Connection

**Files:**
- Modify: `src/connection/connection.ts:42-58` (add field)
- Modify: `src/connection/connection.ts:60-130` (init in connect, cleanup in disconnect)
- Modify: `src/connection/connection.ts:144-153` (route level_chunk(-2))
- Modify: `src/connection/connection.ts:363` (add subchunk/update listeners)

- [ ] **Step 1: Import the manager and add field**

In `connection.ts`, add after line 6:

```typescript
import { SubchunkRequestManager } from "./subchunk-manager.js";
```

Add field in class body (after line 48):

```typescript
  private subchunkManager: SubchunkRequestManager | null = null;
```

- [ ] **Step 2: Initialize in `connect()`**

In `connect()`, after `this.client = createClient(clientOpts)` (line 101), add:

```typescript
    this.subchunkManager?.destroy();
    this.subchunkManager = null;
```

Actually, initialize it where the client is set up, right after:

```typescript
    this.subchunkManager = new SubchunkRequestManager(this.client);
```

Find the `this.client = createClient(clientOpts);` line at ~101 and add after:

```typescript
    this.subchunkManager = new SubchunkRequestManager(this.client);
```

- [ ] **Step 3: Clean up in `disconnect()`**

In `disconnect()` (line ~391), add at the start of `if (client)` block:

```typescript
      this.subchunkManager?.destroy();
      this.subchunkManager = null;
```

Place it right after `if (client)` and `if (!this.disconnectEmitted)` block:

```typescript
    if (client) {
      this.subchunkManager?.destroy();
      this.subchunkManager = null;
      if (!this.disconnectEmitted) {
        // ... existing code
```

- [ ] **Step 4: Route `level_chunk` with `sub_chunk_count = -2`**

Replace the `level_chunk` handler (lines 144-153) with:

```typescript
    this.client.on("level_chunk", (packet: any) => {
      trace("level_chunk");
      this.metrics?.recordPacket("in", "level_chunk");
      const subChunkCount = packet.sub_chunk_count ?? 0;
      const eventData = {
        x: packet.x,
        z: packet.z,
        payload: packet.payload,
        subChunkCount,
        dimension: packet.dimension ?? 0,
      };
      this.events.emit("chunk_loaded", eventData);

      if (subChunkCount === -2 && this.subchunkManager) {
        // -2 = subchunk request mode: trigger polling
        // bot.ts creates the column from chunk_loaded; we need it passed back
        // Instead, we'll handle this via bot.ts
      }
    });
```

Wait — the manager needs the column reference. The column is created in `bot.ts`'s `chunk_loaded` handler. Need a different approach.

**Revised approach:** Don't route through the manager from connection. Instead, let bot.ts handle the flow:

1. `connection` emits `chunk_loaded` with subChunkCount=-2 + dimension
2. `bot.ts` creates the column, decodes biomes, then calls `this.connection.subchunkManager?.onLevelChunk(x, z, dimension, column)`

So connection.ts needs to expose the manager. Add a getter:

```typescript
  getSubchunkManager(): SubchunkRequestManager | null {
    return this.subchunkManager;
  }
```

Place it in the public API section. The `level_chunk` handler stays as-is (just emit). The `subchunk` handler needs to be added for incoming responses.

- [ ] **Step 5: Add `subchunk` and `update_subchunk_blocks` listeners**

After the `item_registry` handler (~line 142), add:

```typescript
    this.client.on("subchunk", (packet: any) => {
      trace("subchunk", { origin: packet.origin, entries: packet.entries?.length ?? 0 });
      this.metrics?.recordPacket("in", "subchunk");
      this.subchunkManager?.onSubchunk(packet);
    });

    this.client.on("update_subchunk_blocks", (packet: any) => {
      trace("update_subchunk_blocks", { x: packet.x, z: packet.z, blocks: packet.blocks?.length ?? 0 });
      this.metrics?.recordPacket("in", "update_subchunk_blocks");
      this.subchunkManager?.onUpdateSubchunkBlocks(packet);
    });
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/connection/connection.ts
git commit -m "feat(connection): wire SubchunkRequestManager into Connection"
```

---

### Task 3: Update bot.ts chunk_loaded handler for subchunk mode

**Files:**
- Modify: `src/bot.ts:259-274`
- Modify: `src/events/event-bus.ts:66`

- [ ] **Step 0: Add `dimension` to `chunk_loaded` event type**

In `src/events/event-bus.ts`, line 66, change:

```typescript
  chunk_loaded: { x: number; z: number; payload: Buffer; subChunkCount: number };
```

to:

```typescript
  chunk_loaded: { x: number; z: number; payload: Buffer; subChunkCount: number; dimension?: number };
```

Reason: The `level_chunk` packet carries a `dimension` field that bot.ts needs to pass to `SubchunkRequestManager.onLevelChunk()`.

- [ ] **Step 1: Change `chunk_loaded` handler to handle -2 chunks**

Replace the handler (lines 259-274) with:

```typescript
    this.events.on("chunk_loaded", ({ x, z, payload, subChunkCount, dimension }) => {
      try {
        let column = this.world.getColumn(x, z);
        if (!column) {
          column = this.world.createColumn(x, z);
          this.world.addColumn(x, z, column);
        }
        if (subChunkCount === -1) {
          return;
        }
        if (subChunkCount === -2) {
          // Subchunk request mode: decode biomes only, then request sections
          (column as any).networkDecodeNoCache(payload, -2);
          const manager = this.connection.getSubchunkManager();
          if (manager) {
            manager.onLevelChunk(x, z, dimension ?? this.world.getDimension(), column);
          }
          return;
        }
        (column as any).networkDecodeNoCache(payload, subChunkCount);
      } catch (err: any) {
        getLogger().error({ err, chunkX: x, chunkZ: z, subChunkCount }, "Failed to load chunk");
      }
    });
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): enable subchunk request flow for 1.26 servers"
```

---

### Task 4: Verification

- [ ] **Step 1: Typecheck the full project**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Run existing tests**

```bash
npx tsx --test tests/**/*.test.ts
```

Expected: all 43 tests pass

- [ ] **Step 3: Live server smoke test**

```bash
npx tsx src/index.ts --host 115.191.51.70 --port 19132 --email duozui@yeah.net 2>&1 | head -30
```

Expected: no `[CHUNK_ERR]` output, dashboard shows `Chunks:N` > 0

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
git diff --stat
# Commit if needed
```
