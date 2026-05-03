# Bedrock 1.26 Subchunk Protocol Adapter — Design

## Overview

Adapt the `minebot` connection layer to support Minecraft Bedrock 1.26's subchunk polling mechanism, enabling the bot to receive and decode chunk block data on servers running Bedrock 1.26.0+. The adapter is implemented as a protocol-layer encapsulation inside `Connection` — the bot layer remains unchanged and unaware of the subchunk handshake.

## Problem

**Target server:** Bedrock 1.26.0 (protocol 924), running on a user-controlled remote host.

`bedrock-protocol` v3.55.1 can connect to 1.26 servers successfully. However:

1. All `level_chunk` packets arrive with `sub_chunk_count = -2` — the server signals "Subchunk Polling Mode."
2. Chunks with `sub_chunk_count = -2` contain only biome data, heightmap data, and border blocks — **no block section data.**
3. The client must explicitly request sub-chunk block data via `subchunk_request` packets (packet ID 0xaf).
4. The server responds with `subchunk` packets (packet ID 0xae) containing the actual block data.
5. `bedrock-protocol` v3.55.1 has **no code** to send `subchunk_request` or handle `subchunk` responses. This is not a protocol definition gap — `minecraft-data` v3.109.1 includes full packet definitions for 1.26.0 and 26.10. The gap is purely in the runtime logic.

**Result:** Every `getBlock()` call returns "air" because chunk column sections are empty. The bot cannot see terrain or resources.

## Architecture

```
Connection (existing)
  │
  ├── level_chunk handler (existing)
  │     sub_chunk_count >= 0 → emit chunk_loaded as-is (legacy path)
  │     sub_chunk_count = -2 → delegate to SubchunkRequestManager
  │
  ├── SubchunkRequestManager (new)
  │     ├── handleRequestModeChunk() — store base column, send subchunk_request
  │     ├── handleSubchunkResponse() — decode + assemble, emit chunk_loaded
  │     └── handleUpdateSubchunkBlocks() — apply block updates
  │
  └── subchunk / update_subchunk_blocks listeners (new)
        wire subchunk response packets to SubchunkRequestManager
```

**Principle:** The bot layer sees only normal `chunk_loaded` events with decoded block data. The subchunk request/response handshake is transparent.

## SubchunkRequestManager

### File: `src/connection/subchunk-manager.ts`

### State

```typescript
interface PendingChunk {
  column: any;                              // pr ChunkColumn (already populated with biome data)
  requestedSubchunks: Set<number>;          // sub-chunk Y indices requested
  receivedSubchunks: Set<number>;           // sub-chunk Y indices received
  dimension: number;
  x: number;
  z: number;
  requestedAt: number;
}

class SubchunkRequestManager {
  private pending = new Map<string, PendingChunk>();
  private client: Client;                   // bedrock-protocol Client (for queueing packets)
  private events: EventBus<BotEvents>;
  private timeoutMs: number = 5000;
  private viewDistance: number;
}
```

### Methods

#### `constructor(client, events, getColumn, viewDistance)`
Stores references. `getColumn: (x, z) => ChunkColumn | null` is a callback to retrieve the column from WorldState. `viewDistance` comes from bot config (default 8).

#### `handleRequestModeChunk(x, z, payload, dimension): void`

Called when `level_chunk` arrives with `sub_chunk_count = -2`.

1. **Get or create column.** Delegate to a provided `getColumn(x, z)` callback. If column exists (redundant chunk), skip. The column should be the one from `bot.world`.

2. **Extract biome/border data.** Call `column.networkDecodeNoCache(payload, 0)` — passing `0` tells it to only decode biome, heightmap, border blocks (existing logic skips section loading when sectionCount ≤ 0).

3. **Store as pending.** `pending.set("x,z,dim", { column, requestedSubchunks: new Set(), receivedSubchunks: new Set(), ... })`.

4. **Send subchunk_request.** Build the request and queue via `client.queue('subchunk_request', params)`. Mark all 24 sub-chunk Y indices in `requestedSubchunks`.

5. **Set timeout.** `setTimeout(() => cleanupTimeout(key), this.timeoutMs)`.

> **Note:** The column is already added to the world by the bot's `chunk_loaded` handler. SubchunkRequestManager does NOT re-create or re-add the column — it only populates sections. The bot's handler must be modified to NOT skip `-2` chunks (previously it returned early) and instead call `networkDecodeNoCache(payload, 0)` for biome data, then pass to the manager.

#### `handleSubchunkResponse(packet): void`

Called when `subchunk` packet arrives.

1. **Compute chunk coordinates.** `chunkX = origin.x, chunkZ = origin.z`.
2. **Look up pending.** `key = "chunkX,chunkZ,dimension"`. If not found, warn and return.
3. **For each entry:**
   - Calculate sub-chunk absolute Y: `subChunkY = origin.y + dy`.
   - **Check result code.** If `result === 6` (success_all_air), mark as received and continue (no payload to decode).
   - If `result !== 1` (not success), log warning and continue.
   - Decode the sub-chunk: instantiate `SubChunk` (subChunkVersion 9), wrap payload in a `Stream`, call `section.decode(StorageType.Runtime, stream)`.
   - Insert into column: `column.setSection(subChunkY + 4, section)` (the `+4` maps Y=-4 to index 0 for Caves & Cliffs offset).
   - Mark `receivedSubchunks.add(subChunkY)`.
4. **Check completion.** If `receivedSubchunks.size === requestedSubchunks.size`:
   - Remove from `pending`.
   - Log info: `"Chunk (x,z) fully loaded via subchunk polling"`.
   - No `chunk_loaded` re-emit — the column is already in the world with all sections populated. `getBlock()` returns correct results immediately.

#### `handleUpdateSubchunkBlocks(packet): void`

Called when `update_subchunk_blocks` packet arrives (packet ID 0xac). This packet carries block updates within already-loaded sub-chunks (e.g., player-placed or broken blocks).

```
packet:
  dimension: zigzag32
  origin: { x: i32, y: i32, z: i32 }
  blocks: [
    {
      offset: { x: u8, y: u8, z: u8 },   // block offset within sub-chunk
      layer0: varint,                      // block runtime ID for layer 0
      layer1: varint,                      // block runtime ID for layer 1 (water/waterlogged)
    }
  ]
```

1. **Find column.** Locate the loaded column at (origin.x, origin.z).
2. **Find section.** Locate the sub-chunk at `origin.y` within the column.
3. **For each block entry:**
   - Compute absolute block coords: `bx = origin.x*16 + offset.x, by = origin.y*16 + offset.y, bz = origin.z*16 + offset.z`.
   - Look up `blocksByRuntimeId[layer0]` for the block state ID.
   - Set block state in the section's storage: `section.setBlockState(localX, localY, localZ, layer0StateId, layer1StateId)`.
4. **Emit event** (optional). Could emit `subchunk_block_update` for telemetry or pathfinding invalidation, but for MVP this is not required — subsequent `getBlock()` calls will pick up the update.

#### `cleanup(): void`

Called from the tick loop (or on a timer) to remove timed-out pending chunks.

1. Scan `pending` for entries where `Date.now() - requestedAt > timeoutMs`.
2. For each timed-out entry: log warning, remove from pending, optionally re-request.

#### `clear(): void`

Called on disconnect. Cancels all pending timeouts, clears the pending map.

### Lifetime

- Created in `Connection.connect()` alongside the client.
- Destroyed in `Connection.disconnect()` (clears pending, cancels timeouts).

## Connection Changes

### File: `src/connection/connection.ts`

**New field:**
```typescript
private subchunkManager: SubchunkRequestManager | null = null;
```

**In `connect()`:**
```typescript
this.subchunkManager = new SubchunkRequestManager(this.client, this.events, this.opts.viewDistance ?? 8);
```

**Modify `level_chunk` handler:**
```typescript
this.client.on("level_chunk", (packet: any) => {
  trace("level_chunk");
  this.metrics?.recordPacket("in", "level_chunk");

  if (packet.sub_chunk_count === -2) {
    // Emit chunk_loaded for bot to create column + biome decode
    this.events.emit("chunk_loaded", {
      x: packet.x,
      z: packet.z,
      payload: packet.payload,
      subChunkCount: 0,   // signal: biome-only, no sections
      dimension: packet.dimension,
    });
    // Delegate subchunk polling to manager
    this.subchunkManager?.handleRequestModeChunk(
      packet.x, packet.z, packet.payload,
      packet.dimension ?? 0
    );
    return;
  }

  // Legacy path: sub_chunk_count >= 0
  this.events.emit("chunk_loaded", {
    x: packet.x,
    z: packet.z,
    payload: packet.payload,
    subChunkCount: packet.sub_chunk_count ?? 0,
    dimension: packet.dimension,
  });
});
```

**New listener: `subchunk`**
```typescript
this.client.on("subchunk", (packet: any) => {
  trace("subchunk");
  this.metrics?.recordPacket("in", "subchunk");
  this.subchunkManager?.handleSubchunkResponse(packet);
});
```

**New listener: `update_subchunk_blocks`**
```typescript
this.client.on("update_subchunk_blocks", (packet: any) => {
  trace("update_subchunk_blocks");
  this.metrics?.recordPacket("in", "update_subchunk_blocks");
  this.subchunkManager?.handleUpdateSubchunkBlocks(packet);
});
```

**In `disconnect()`:**
```typescript
this.subchunkManager?.clear();
this.subchunkManager = null;
```

## Bot Changes

### File: `src/bot.ts`

**Minimal change.** The `chunk_loaded` handler's `if (subChunkCount === -1) return;` check must be relaxed: allow `subChunkCount === 0` to pass through for biome decode.

```typescript
this.events.on("chunk_loaded", ({ x, z, payload, subChunkCount }) => {
  try {
    let column = this.world.getColumn(x, z);
    if (!column) {
      column = this.world.createColumn(x, z);
      this.world.addColumn(x, z, column);
    }
    if (subChunkCount === -1) {
      return;
    }
    // subChunkCount === 0: biome-only chunk (subchunk polling mode)
    // subChunkCount > 0: full chunk (legacy or assembled)
    if (subChunkCount >= 0 && payload) {
      (column as any).networkDecodeNoCache(payload, subChunkCount);
    }
    // Note: for subChunkCount === 0, networkDecodeNoCache skips sections
    // (condition: sectionCount !== -1 && sectionCount !== -2, and 0 passes
    //  so it will reset sections and loop 0 times — safe)
  } catch (err) {
    getLogger().error({ err, chunkX: x, chunkZ: z }, "Failed to load chunk");
  }
});
```

The `networkDecodeNoCache(payload, 0)` call resets sections to `[]` (empty) then loops 0 times — so only biome, heightmap, and border blocks are decoded. Sections will be populated later by `SubchunkRequestManager.handleSubchunkResponse`.

## Protocol Details (Verified)

### subchunk_request (0xaf, client→server)

| Field | Type | Value |
|-------|------|-------|
| dimension | zigzag32 | 0=overworld, 1=nether, 2=end |
| origin.x | i32 | chunk X coordinate |
| origin.y | i32 | sub-chunk Y center (0 for requesting all) |
| origin.z | i32 | chunk Z coordinate |
| request_count | lu32 | number of offsets (24 for full height) |
| requests[i].dx | i8 | offset dx from origin |
| requests[i].dy | i8 | offset dy from origin |
| requests[i].dz | i8 | offset dz from origin |

Source: `minecraft-data/data/bedrock/1.26.0/proto.yml:3717`

### subchunk (0xae, server→client)

| Field | Type | Description |
|-------|------|-------------|
| cache_enabled | bool | false for minebot (always disabled) |
| dimension | zigzag32 | 0=overworld, 1=nether, 2=end |
| origin.x | i32 | sub-chunk X (chunk coordinate) |
| origin.y | i32 | sub-chunk Y center |
| origin.z | i32 | sub-chunk Z (chunk coordinate) |
| entry_count | lu32 | number of entries |
| entries[i].dx | i8 | sub-chunk X offset |
| entries[i].dy | i8 | sub-chunk Y offset |
| entries[i].dz | i8 | sub-chunk Z offset |
| entries[i].result | u8 | 0=undefined, 1=success, 2=chunk_not_found, 3=invalid_dimension, 4=player_not_found, 5=index_oob, **6=success_all_air** |
| entries[i].payload | ByteArray | raw sub-chunk binary (SubChunk v9) — absent if result=6 (all air) |
| entries[i].heightmap_type | HeightMapDataType | enum |
| entries[i].heightmap | buffer[256] | heightmap data when has_data |
| entries[i].render_heightmap_type | HeightMapDataType | enum |
| entries[i].render_heightmap | buffer[256] | render heightmap when has_data |

When `result = 6` (success_all_air), the sub-chunk is entirely air — skip decoding and mark as received. The `payload` field is absent in this case.

### update_subchunk_blocks (0xac, server→client)

| Field | Type | Description |
|-------|------|-------------|
| dimension | zigzag32 | Dimension |
| origin | vec3i | Sub-chunk position |
| block_count | lu32 | Number of blocks |
| blocks[i].offset | vec3u8 | Block offset within sub-chunk (0-15, 0-15, 0-15) |
| blocks[i].layer0 | varint | Block runtime ID for layer 0 (primary) |
| blocks[i].layer1 | varint | Block runtime ID for layer 1 (waterlogged) |

Source: `minecraft-data/data/bedrock/1.26.0/proto.yml:3693`

## Error Handling

| Scenario | Handling |
|----------|----------|
| subchunk_request times out (5s) | Log warning, remove from pending, chunk becomes air (existing behavior) |
| subchunk response for unknown chunk | Log warning, ignore |
| Duplicate sub-chunk response | Log debug, ignore (idempotent) |
| SubChunk decode failure | Log error with chunk position, skip entry |
| Server sends legacy chunks (sub_chunk_count >= 0) | Bypass SubchunkRequestManager entirely — emit as-is |
| Connection drops mid-request | `clear()` cancels all pending timeouts |

## Testing Strategy

1. **Unit test: PendingChunk lifecycle** — create, add sub-chunks, complete, emit event
2. **Integration test: Connection handler routing** — verify `-2` chunks go to manager, `>= 0` chunks bypass
3. **Smoke test: Real 1.26 server** — connect, verify chunks load with non-air blocks, resource scan finds ores/blocks
4. **Regression test:** Existing test suite still passes (pathfinding, skill-manager, etc.)

## Dependencies

**New npm packages:** None. Uses existing `bedrock-protocol` (for `Client.queue()` and `SubChunk` import from `prismarine-chunk`).

**New files:**
- `src/connection/subchunk-manager.ts` — ~200 lines

**Modified files:**
- `src/connection/connection.ts` — ~30 lines added

**Unchanged files:** All bot, skill, movement, pathfinding, inventory, world, and BT files.

## Acceptance Criteria

1. Bot connects to Bedrock 1.26.0 server without errors.
2. `getBlock()` returns correct block names (not always "air") at the bot's position.
3. Resource scanning (gathering skill's `findOres()`) finds actual ores/blocks within the scan radius.
4. Bot navigates terrain using the existing pathfinding system (A* over real blocks).
5. Existing code paths (legacy chunks, non-1.26 servers) continue to work unchanged.
6. TypeScript compilation passes with zero errors.
7. Existing test suite passes (43 tests).
