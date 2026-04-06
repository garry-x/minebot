# Bot Inspect Command Design

## Overview
Add a new `minebot bot inspect <botId>` command that displays detailed bot behavior information in a terminal-friendly table format with ANSI colors.

## Requirements

### Display Information
1. **Health & Status**
   - Current health (max 20)
   - Food level (max 20)
   - Food saturation
   - Bot state (ALIVE/DEAD/DISCONNECTED)
   - Connected status
   - Dead reason (if applicable)

2. **Resource Collection**
   - Total inventory count
   - Breakdown by resource type (wood, stone, etc.)
   - Current crafting materials
   - Recent collection activity

3. **Movement State**
   - Current position (x, y, z coordinates)
   - Movement status (MOVING/IDLE/STANDING)
   - Pathfinding queue length
   - Recent travel distance

4. **Attack/Defense Status**
   - Attack cooldown state
   - Target information (if attacking)
   - Defense mode status
   - Recent damage taken

5. **Evolution Status**
   - Evolution engine enabled (yes/no)
   - Experience count
   - Last fitness score
   - Active strategy weights
   - Autonomous decision-making status

6. **Position Information**
   - Absolute coordinates
   - Biome information (if available)
   - Sky light level
   - Block type at current position

## Command Usage

```bash
minebot bot inspect <botId>
```

Example:
```bash
minebot bot inspect bot_123
```

## Implementation Plan

### 1. API Endpoint (`bot_server.js`)
Add new endpoint: `GET /api/bot/:botId/inspect`

Returns comprehensive bot data including:
- Basic status (health, food, state)
- Position and movement
- Inventory contents
- Evolution stats
- Behavior state

### 2. CLI Handler (`cli.js`)
Add `inspect` case to bot control switch:
- Validate botId is provided
- Fetch bot data from API
- Format and display in colored table
- Handle error cases gracefully

### 3. Error Handling
- Bot not found: Show error + available bot list
- Server not running: Prompt to start server
- Invalid botId: Clear error message

### 4. Output Format
Use ANSI color codes for:
- Health: green (healthy) → red (critical)
- Status: green (active) → red (dead) → yellow (disconnected)
- Movement: cyan (moving) → gray (idle)
- Evolution: blue (enabled) → gray (disabled)

## Success Criteria

- ✅ Command works with valid botId
- ✅ Shows all 6 information categories
- ✅ Clean, readable table format
- ✅ Proper error handling and messages
- ✅ Colors enhance readability
- ✅ Follows existing CLI patterns

## Future Enhancements

- `--json` flag for machine-readable output
- `--watch` flag for continuous monitoring
- `--history <seconds>` for recent activity log
- Export to file option
