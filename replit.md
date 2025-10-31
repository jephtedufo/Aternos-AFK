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
- Bot is designed for Minecraft 1.16.5 servers
- For other versions, server needs ViaVersion and ViaRewind plugins
- If server has login plugins or antibot protection, whitelist the bot
- Current setup uses Node.js 20 (mineflayer recommends 22, but should work)

## Recent Changes
- 2025-10-31: Improved chest interaction and movement
  - Bot now walks instead of runs (sprint disabled)
  - Properly right-clicks chest using activateBlock()
  - Closes chest with ESC (closeWindow) after taking item
  - Better logging to track chest visit progress
  - More robust error handling for chest interactions

- 2025-10-31: Added automatic chest interaction system
  - Bot visits chest at (2319, 77, 2975) at random intervals (30s-2min)
  - Automatically opens chest, takes first item, and eats it
  - Returns to normal wandering after chest interaction
  - Handles errors gracefully if chest is empty or unreachable
  - Uses async/await for smooth chest operations

- 2025-10-31: Implemented intelligent pathfinding with obstacle avoidance
  - Integrated mineflayer-pathfinder for smart navigation
  - Bot now detects and avoids walls automatically
  - Explores freely instead of following fixed patterns
  - Uses A* algorithm to find safe paths
  - Automatically retries when paths are blocked
  - Non-destructive exploration (doesn't break blocks)

- 2025-10-31: Enhanced bot movement system
  - Reduced movement interval from 2s to 0.8s (much more active)
  - Added jumping functionality (40% chance while moving)
  - Added sprinting capability (30% chance)
  - Bot now moves more naturally with varied paths and actions
  
- 2025-10-31: Initial Replit environment setup
  - Fixed keep_alive.js to properly export function
  - Updated Express server to use port 5000 and bind to 0.0.0.0
  - Added .gitignore for Node.js
  - Installed all dependencies
  - Configured workflow for automatic startup
