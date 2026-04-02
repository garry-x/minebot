# Enhanced BotDetail Component Design

## Overview

Enhance the BotDetail component to provide a comprehensive bot management interface with real-time 3D position tracking, death information display, and detailed control commands for gathering, building, and automatic modes.

## Requirements

### 1. Real-time 3D Position Display (5s refresh)
- Display bot's current X, Y, Z coordinates
- Auto-refresh every 5 seconds
- Visual indicator showing position is live/updating

### 2. Death Information Display
- When bot state is "DEAD", prominently display death reason
- Show death cause (e.g., "fell from a high place", "was slain by Zombie")
- Visual styling to make death state obvious (red alert style)

### 3. Detailed Control Commands

#### 3.1 Gather Mode (收集)
- Quick action buttons for common resources:
  - 收集木材 (Gather Wood): oak_log, birch_log
  - 收集岩石 (Gather Stone): cobblestone, stone
  - 收集矿石 (Gather Ores): coal_ore, iron_ore, diamond_ore
  - 收集食物 (Gather Food): wheat, carrots, potatoes
- Custom gather option with dropdown for specific blocks
- Radius configuration (default 30 blocks)

#### 3.2 Build Mode (建造)
- Quick templates:
 - 建造房屋 (Build House): 7x7x4 with oak_planks
  - 建造围墙 (Build Wall): 10x3x1 with cobblestone
  - 建造塔楼 (Build Tower): 3x3x10 with stone_bricks
- Custom build with:
  - Width, Length, Height inputs
  - Block type dropdown
  - Offset configuration (relative to bot position)

#### 3.3 Automatic Mode (全自动)
- Single button to enable full autonomous behavior
- Bot will:
  - Automatically gather resources as needed
  - Build structures when materials available
  - Fight enemies and defend itself
  - Maintain health and food levels
  - Explore and map the world
- Status indicators showing what the bot is currently doing

### 4. UI/UX Requirements
- Clean, organized layout with clear sections
- Collapsible/expandable sections for each control type
- Loading states for all async operations
- Error handling with user-friendly messages
- Responsive design that works at various screen sizes

## Technical Implementation

### Data Flow
1. BotDetail receives `bot` prop with current bot data
2. Position updates via WebSocket real-time updates
3. Control commands use existing API endpoints
4. Component maintains local state for UI controls

### API Integration
- Reuse existing `/api/bot/:botId/gather` endpoint
- Reuse existing `/api/bot/:botId/build` endpoint
- Reuse existing `/api/bot/automatic` endpoint
- Use WebSocket for real-time position updates

### State Management
```javascript
// Position tracking with auto-refresh
const [currentPosition, setCurrentPosition] = useState(bot?.position);
const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

// Control panel states
const [activePanel, setActivePanel] = useState(null); // 'gather' | 'build' | 'automatic'
const [gatherConfig, setGatherConfig] = useState({ ... });
const [buildConfig, setBuildConfig] = useState({ ... });
```

## Design Mockup

```
┌─────────────────────────────────────────────────────┐
│ Bot: testuser                    ● alive          │
│ ID: bot_1775...                                     │
├─────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Health   │ │ Food     │ │ Position │ │ Mode     │ │
│ │ 20/20    │ │ 20/20    │ │Live: 5s  │ │ survival │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│ Position: X: 9.5, Y: 69.0, Z: 8.5                  │
├─────────────────────────────────────────────────────┤
│ DEATH ALERT: Bot died (fell from a high place)    │  ← Only when DEAD
├─────────────────────────────────────────────────────┤
│ Control Commands                                    │
├─────────────────────────────────────────────────────┤
│ [📦 Gather] [🏗️ Build] [🤖 Automatic]             │
├─────────────────────────────────────────────────────┤
│ ▼ Gather Resources                                  │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Quick Actions:                                  │ │
│ │ [🪵 Wood] [🪨 Stone] [⛏️ Ores] [🥕 Food]        │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Custom Gather:                                  │ │
│ │ Target: [oak_log_________]  Radius: [30] blocks   │ │
│ │                    [Start Gather]                │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ ▼ Build Structure                                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Quick Templates:                                │ │
│ │ [🏠 House] [🧱 Wall] [🏰 Tower]                │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Custom Build:                                   │ │
│ │ Width: [5] Length: [5] Height: [3]              │ │
│ │ Block: [oak_planks ▼] Offset: [0,0,0]           │ │
│ │                    [Start Build]               │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ ▼ Automatic Mode                                    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Status: 🟡 Standby                              │ │
│ │                                                 │ │
│ │ Bot will automatically:                        │ │
│ │ • Gather resources when needed                 │ │
│ │ • Build structures with available materials    │ │
│ │ • Fight enemies and defend itself             │ │
│ │ • Maintain health and food levels             │ │
│ │ • Explore and map the world                    │ │
│ │                                                 │ │
│ │          [🤖 Start Automatic Mode]               │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ Quick Actions                                       │
├─────────────────────────────────────────────────────┤
│ [⏸ Stop] [🔄 Restart] [🗑️ Remove]                   │
└─────────────────────────────────────────────────────┘
```

## Acceptance Criteria

1. ✅ Real-time 3D position display with 5-second auto-refresh
2. ✅ Death reason prominently displayed when bot is dead
3. ✅ Gather mode with quick presets and custom configuration
4. ✅ Build mode with quick templates and custom configuration
5. ✅ Automatic mode with full autonomous behavior
6. ✅ All API integrations working correctly
7. ✅ Responsive UI with loading and error states

## Next Steps

1. Review and approve this design document
2. Create implementation plan using writing-plans skill
3. Implement the enhanced BotDetail component
4. Test all features and edge cases
5. Deploy and verify in production
