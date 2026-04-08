# MineBot Modern TUI Admin Console - Interaction Guide

## Overview
A modern Ink-based TUI admin console for MineBot with intuitive menu-based interaction using arrow keys and keyboard shortcuts.

## Files Created/Updated

### 1. `/data/code/minebot/tui/components/SelectableMenu.jsx`
- **Purpose**: Reusable dropdown/select component for menu navigation
- **Features**:
  - Arrow key navigation (handled by parent component)
  - Visual selection indicator (›)
  - Support for disabled items
  - Focus state with border highlighting
  - Built-in instructions footer

### 2. `/data/code/minebot/tui/views/ServerControl.jsx` (REDESIGNED)
- **Purpose**: Server control panel with side-by-side menus
- **Layout**:
  - Two panels: [Minecraft Actions] | [Bot Server Actions]
  - Server status display above each panel
  - Tab key switches focus between panels
- **Menu Items** (no m1-m5/b1-b4 prefixes):
  - **Minecraft Actions**:
    1. Start Server
    2. Stop Server
    3. Restart Server
    4. Force Stop
    5. Backup World
  - **Bot Server Actions**:
    1. Start Bot Server
    2. Stop Bot Server
    3. Restart Bot Server
    4. View Logs

### 3. `/data/code/minebot/tui/index.jsx` (UPDATED)
- **Purpose**: Main TUI application
- **Features**:
  - Top navigation bar: [1]Dashboard [2]Bot Management [3]Server Control etc.
  - View content area with SelectableMenu where applicable
  - Global keyboard handling
  - Action message display

## Interaction Model

### Keyboard Controls

| Key | Action |
|-----|--------|
| **1-6** | Switch between views (Dashboard, Bot Management, Server Control, etc.) |
| **Tab** | Switch focus between Minecraft Actions and Bot Server Actions panels |
| **↑ ↓** | Navigate menu items within focused panel |
| **Enter** | Execute selected action |
| **Escape** | Cancel/go back |
| **q** | Quit the application |
| **h** | Show help |
| **r** | Refresh (placeholder) |
| **m** | Back to main menu (Dashboard) |

### Navigation Flow
1. Press **3** to go to Server Control view
2. Use **Tab** to switch between Minecraft and Bot panels
3. Use **↑ ↓** arrows to navigate menu items
4. Press **Enter** to execute selected action
5. Press **1-6** to switch to other views at any time

## Technical Implementation

### Key Components
- **SelectableMenu**: Pure display component, receives selection state via props
- **ServerControl**: Handles keyboard input for its panels using `useCallback`
- **index.jsx**: Global keyboard handler with view switching

### Keyboard Handling
- Uses Ink's `useInput` hook
- Arrow keys: `key.upArrow`, `key.downArrow`
- Special keys: `key.return` (Enter), `key.escape`, `key.tab`
- Character input: `input` parameter for 1-6, q, h, r, m

### State Management
- `activePanel`: Tracks which panel has focus ('minecraft' or 'bot')
- `selectedIndex`: Tracks selected item in each menu
- `currentView`: Tracks which view is active (Dashboard, Server Control, etc.)

## Running the TUI

```bash
# From the minebot directory
node tui/index.jsx
```

Or use the existing admin interface:
```bash
# If there's an existing entry point
node tui/admin-tui.jsx
```

## Design Principles

1. **Clean Interface**: No m1-m5/b1-b4 prefixes - pure arrow navigation
2. **Visual Feedback**: Selected item highlighted with › and green color
3. **Context Awareness**: Footer shows current focus and available actions
4. **Consistency**: Same interaction pattern across all menus
5. **Accessibility**: Clear visual hierarchy and keyboard-only operation

## Benefits Over Previous Design

1. **Intuitive**: Arrow keys are standard for menu navigation
2. **Discoverable**: Footer shows available actions at all times
3. **Efficient**: Tab switching between related panels
4. **Modern**: Follows TUI best practices and user expectations
5. **Maintainable**: Reusable components with clear separation of concerns