# Minecraft AFK Bot for Aternos

## Overview
This is a Minecraft AFK bot designed to keep a player active on an Aternos Minecraft server. The bot uses the mineflayer library to connect to a Minecraft server and performs random movements to prevent being kicked for inactivity.

## Project Architecture
- **Main Bot Logic** (`index.js`): Connects to Minecraft server using mineflayer and implements random movement patterns
- **Keep-Alive Web Server** (`keep_alive.js`): Runs an Express server on port 5000 to keep the Replit instance active
- **Configuration** (`config.json`): Contains server IP, port, and bot username

## Features
- Connects to Minecraft servers (designed for 1.16.5)
- **Intelligent obstacle avoidance** - detects walls and navigates around them
- **Smart pathfinding** - uses mineflayer-pathfinder for navigation
- Explores freely within 30 blocks of spawn point
- **Automatic chest interaction** - periodically visits a chest to take and eat items
  - Walks to chest at coordinates (2319, 77, 2975)
  - Right-clicks chest to open it
  - Takes first item from chest
  - Presses ESC to close chest
  - Consumes/eats the item
  - Returns to wandering
  - Random interval: 30 seconds to 2 minutes between visits
- **Walks instead of running** - bot moves at normal walking speed for more realistic behavior
- Automatically finds reachable destinations
- Random jumping for realistic movement
- Web server for health checks and keeping Replit instance alive

## Configuration
Edit `config.json` to set your server details:
- `ip`: Your Aternos server address (e.g., "yourserver.aternos.me")
- `port`: Server port (default: "25565")
- `name`: Bot username

To change chest location, edit `index.js`:
- `chestPosition`: Location of the chest (currently 2319, 77, 2975)
- `standingPosition`: Where bot stands to open chest (currently 2319, 77, 2976)

## Technical Details
- Language: Node.js
- Main Dependencies:
  - `mineflayer`: Minecraft bot framework
  - `mineflayer-pathfinder`: A* pathfinding with obstacle detection
  - `vec3`: Vector mathematics for position calculations
  - `express`: Web server for keep-alive functionality
- Web server runs on port 5000 (0.0.0.0)
- Navigation system:
  - Uses A* pathfinding algorithm to navigate terrain
  - Automatically detects walls, lava, cliffs, and other obstacles
  - Wanders within 30 blocks of spawn point
  - Picks random destinations and finds safe paths
  - If path is blocked, automatically tries new destination
  - Random jumping every 3 seconds for realism
  - Non-destructive (doesn't break or place blocks)

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
