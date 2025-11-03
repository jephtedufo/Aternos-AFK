# Minecraft Version Compatibility Guide

## Current Status (November 2025)

**Maximum Supported Version: 1.21.8 (Protocol 767)**

This bot uses the PrismarineJS/mineflayer library, which depends on minecraft-data for protocol support.

## Why 1.21.10 Doesn't Work

Minecraft 1.21.10 introduced protocol version 773, which is **not yet supported** by the minecraft-data library (currently at v3.99.1).

When you try to connect to a 1.21.10 server, you'll see:
```
Error: unsupported protocol version: 1.21.10
```

This is a limitation of the underlying libraries, not this bot.

## What You Can Do

### Option 1: Downgrade Your Server (Recommended)
- Change your Minecraft server to version 1.21.8 or earlier
- For Aternos servers: Change the server version in the server settings
- Update `config.json` to set `"version": "1.21.8"`

### Option 2: Wait for Library Updates
Monitor these repositories for 1.21.10 support:
- https://github.com/PrismarineJS/minecraft-data
- https://github.com/PrismarineJS/node-minecraft-protocol
- https://github.com/PrismarineJS/mineflayer

When support is added:
1. Run `npm update` to get the latest packages
2. Update `version` in `config.json` to `"1.21.10"`
3. Restart the bot

## Supported Versions

The bot currently supports Minecraft Java Edition:
- **1.8 through 1.21.8** (full support)
- 1.21.9, 1.21.10, and newer: **Not yet supported**

## Technical Details

- **mineflayer**: Installed from GitHub (PrismarineJS/mineflayer)
- **minecraft-data**: v3.99.1 (supports up to protocol 767)
- **minecraft-protocol**: v1.62.0

## How to Check for Updates

```bash
# Check latest minecraft-data version
npm info minecraft-data version

# Check if new versions are available
npm outdated

# Update all packages
npm update
```

## Questions?

If you're having version-related issues, check:
1. Your Minecraft server version matches what's in `config.json`
2. The version you're trying to use is listed as supported above
3. Your packages are up to date with `npm update`
