# Minecraft AFK Bot for Aternos

## Overview
This is a Minecraft AFK bot designed to keep a player active on an Aternos Minecraft server. The bot uses the mineflayer library to connect to a Minecraft server and performs random movements to prevent being kicked for inactivity.

## Project Architecture
- **Main Bot Logic** (`index.js`): Connects to Minecraft server using mineflayer and implements random movement patterns
- **Keep-Alive Web Server** (`keep_alive.js`): Runs an Express server on port 5000 to keep the Replit instance active
- **Configuration** (`config.json`): Contains server IP, port, and bot username

## Features

### Enhanced AI Decision System
- **Behavioral Moods**: Bot switches between 5 personality states (curious, energetic, cautious, playful, focused)
  - Each mood changes decision-making patterns and behavior
  - Mood changes every 30 seconds to 3 minutes unpredictably
  - Different moods affect: exploration range, interaction frequency, movement speed preferences
  
### Movement Patterns (Never Repeating)
- **4 Movement Modes**: Walking, sprinting, crouching, pausing (mood-dependent)
- **3 Path Patterns**: Circular, figure-8, random exploration (chosen randomly each time)
- **Dynamic Timing**: Movement intervals vary from 2-8 seconds (never fixed)
- Smooth transitions between different movement styles

### Advanced Actions & Interactions
- **Varied Random Actions**:
  - Crouch & look around (1-4 seconds)
  - Quick successive jumps (1-5 jumps)
  - Spaced playful bouncing
  - 360° spinning
  - Looking up/down to observe
  - Crouch-jump combinations
- **Environmental Interactions**: Opens doors, presses buttons, activates levers, opens/closes chests
- **Player Following**: Detects nearby players and follows them for 30 seconds
- **Item Holding**: Randomly switches between inventory items

### Intelligent Hunger Management
- **Proactive Eating**: Eats before getting too hungry (threshold varies by mood: 10-16)
- **Multi-Food Support**: Recognizes 20+ food types (cooked beef, bread, potatoes, fish, etc.)
- **Continuous Eating**: Keeps eating until fully satisfied
- **Auto-Restocking**: Visits food chest at (2319, 77, 2975) when inventory is empty
- **Priority System**: Prefers cooked food over raw

### Smart Navigation
- **Intelligent obstacle avoidance** - detects walls and navigates around them
- **A* pathfinding** - finds optimal paths automatically
- Explores within mood-based radius (10-25 blocks from spawn)
- Non-destructive (doesn't break or place blocks)

### Reliability
- Web server for health checks and keeping Replit instance alive
- Auto-reconnection with exponential backoff
- Graceful error handling

## Configuration
Edit `config.json` to set your server details:
- `ip`: Your Aternos server address (e.g., "yourserver.aternos.me")
- `port`: Server port (default: "25565")
- `name`: Bot username
- `version`: Minecraft version (set to "1.21.8" for maximum compatibility)

To change food chest location, edit `index.js`:
- Line 597: `const foodChestLocation = new Vec3(2319, 77, 2975)`
- Update coordinates to match your chest location

## Technical Details
- Language: Node.js 22
- Main Dependencies:
  - `mineflayer`: Minecraft bot framework (from GitHub for latest features)
  - `mineflayer-pathfinder`: A* pathfinding with obstacle detection
  - `vec3`: Vector mathematics for position calculations
  - `express`: Web server for keep-alive functionality
- Web server runs on port 5000 (0.0.0.0)

### AI System Architecture
- **Mood-Based Decision Engine**: 5 behavioral profiles with different action probabilities
- **Dynamic Interval System**: All actions use variable timing (no fixed patterns)
- **Weighted Random Decisions**: Each action has mood-dependent probability
- **Continuous Behavior Loop**: Multiple async systems running in parallel:
  - Hunger monitoring (2-5 second intervals)
  - Environment scanning (5-15 second intervals)
  - Player detection (3-10 second intervals)
  - Random movements (4-20 second intervals)
  - Item interactions (8-30 second intervals)
  - Wandering (2-8 second intervals)
- **Conflict Prevention**: Actions check for ongoing activities before executing

## Important Notes
- **Version Compatibility**: Bot supports Minecraft Java Edition 1.8 through 1.21.8
- **Version 1.21.10 NOT SUPPORTED**: The minecraft-data library doesn't support protocol 773 (1.21.10) yet
- **Current Configuration**: Set to version 1.21.8 in config.json
- If server has login plugins or antibot protection, whitelist the bot
- Current setup uses Node.js 22 for best compatibility
- mineflayer installed from GitHub (PrismarineJS/mineflayer) for latest updates

## Version Compatibility
**See VERSION_COMPATIBILITY.md for detailed version information**

### Current Limitation (November 2025)
- Maximum supported version: **Minecraft 1.21.8** (protocol 767)
- Minecraft 1.21.10 (protocol 773) is **not yet supported** by minecraft-data
- If your server is running 1.21.10, you must downgrade it to 1.21.8 or earlier
- Monitor https://github.com/PrismarineJS/minecraft-data for 1.21.10 support updates

## Recent Changes
- 2025-11-06: **MAJOR UPDATE - Enhanced AI Decision System**
  - Implemented behavioral mood system (5 moods with unique decision patterns)
  - Added 3 varied movement patterns (circular, figure-8, random)
  - Enhanced movement modes (walk, sprint, crouch, pause)
  - Created 6 different random action types (jumps, spins, observations, etc.)
  - Implemented dynamic interval system (no fixed timing, completely unpredictable)
  - Enhanced hunger management with 20+ food types and proactive eating
  - Mood-based decision weights for all actions
  - All behaviors now truly varied and non-repeating like a real AI

- 2025-11-03: Version compatibility updates
  - Updated mineflayer to latest GitHub version (PrismarineJS/mineflayer)
  - Documented version 1.21.10 limitation
  - Created VERSION_COMPATIBILITY.md guide
  - Updated README.md with clear version requirements
  - Configured bot for maximum supported version (1.21.8)
- 2025-10-31: Production-ready deployment improvements
  - **Auto-reconnection** with exponential backoff (5s → 60s max delay)
  - **Robust error handling** for ECONNRESET, EPIPE, and network errors
  - No more crashes on disconnect - bot automatically reconnects
  - Fixed duplicate AI timers on reconnection (proper interval cleanup)
  - Added graceful shutdown handlers (SIGINT/SIGTERM)
  - Added version specification support in config.json
  - Connection timeout settings (60s close timeout, 30s check interval)
  - Created comprehensive bot description (DESCRIPTION.md)

- 2025-10-31: Advanced AI behaviors
  - **Player following** - detects and follows nearest player for 30 seconds
  - **Smart hunger management** - checks inventory for food, visits chest if needed
  - **Random item holding** - switches between inventory items naturally
  - **Spontaneous movements** - random crouching and jumping while active
  - Interacts with environment (doors, buttons, levers, chests)
  - Upgraded to Node.js 22 for better compatibility

- 2025-10-31: Core AI and navigation
  - Intelligent pathfinding with obstacle avoidance
  - Wanders within 30 blocks of spawn with varied movement patterns
  - Natural walking/sprinting behavior with random pauses
  - A* algorithm for safe pathfinding around obstacles
  - Non-destructive exploration
