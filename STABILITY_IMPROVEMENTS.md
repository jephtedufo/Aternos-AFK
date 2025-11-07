# Bot Stability Improvements for 24/7 Operation

## Summary
This document outlines all the improvements made to ensure the AFK bot runs reliably 24/7 on Railway or any hosting platform.

## Key Improvements

### 1. **Increased Connection Timeouts**
- `closeTimeout`: Increased from 60s to 120s (2 minutes)
- `checkTimeoutInterval`: Increased from 30s to 60s (1 minute)
- Gives the bot more time to handle network fluctuations

### 2. **Keep-Alive Mechanism**
- TCP keep-alive enabled in bot configuration
- Automatic movement packets every 30 seconds
- Prevents idle disconnections from the server
- Small head movements to show activity without affecting gameplay

### 3. **Improved Reconnection Logic**
- **Exponential backoff**: Starts at 5s, doubles each attempt (max 60s)
- **Duplicate prevention**: Prevents multiple simultaneous reconnection attempts
- **State management**: Proper cleanup of intervals and timers on disconnect
- **Automatic retry**: Never gives up - keeps trying to reconnect indefinitely

### 4. **Better Error Handling**
- Handles multiple connection error types: ECONNRESET, ECONNREFUSED, ETIMEDOUT, ENOTFOUND, EAI_AGAIN
- Safe error handling that doesn't crash the bot
- Proper try-catch blocks around all critical operations
- Graceful shutdown handlers for SIGINT and SIGTERM

### 5. **State Tracking**
- `isReconnecting` flag prevents duplicate reconnection attempts
- `reconnectAttempts` counter tracks retry attempts (resets on successful connection)
- `connected` flag accurately reflects connection state
- All AI intervals properly cleared on disconnect

### 6. **Event Monitoring**
- Monitors `login`, `spawn`, `end`, `kicked`, `error`, `health`, and `disconnect` events
- Comprehensive logging for debugging
- Disconnect reasons logged for troubleshooting

## How It Works

### Normal Operation
1. Bot connects to server
2. On spawn, resets all reconnection counters
3. AI system activates after 5 seconds
4. Keep-alive packets sent every 30 seconds

### Handling Disconnections
1. Connection error occurs (ECONNRESET, etc.)
2. Error handler updates state and waits for 'end' event
3. 'end' event triggers reconnection with exponential backoff
4. Bot attempts to reconnect automatically
5. On successful reconnection, counters reset and bot resumes normal operation

### Preventing Crashes
- All `bot.quit()` calls wrapped in try-catch
- Type checking before calling bot methods
- Proper null/undefined checks
- Safe interval and timeout cleanup

## Testing Status

✅ Connection error handling
✅ Automatic reconnection
✅ Keep-alive mechanism
✅ Safe shutdown
✅ State management
✅ Duplicate prevention

## Railway-Specific Notes

The bot is now optimized for Railway deployment:
- Handles connection resets gracefully
- Never crashes on network errors
- Keeps trying to reconnect indefinitely
- Minimal resource usage during reconnection attempts

## Expected Behavior on Railway

When the Minecraft server (Aternos) is:
- **Online**: Bot connects, spawns, and operates normally
- **Offline**: Bot retries connection with increasing delays (5s → 10s → 20s → 40s → 60s)
- **Intermittent**: Bot reconnects automatically when server becomes available

## Aternos-Specific Considerations

Aternos servers automatically shut down when no players are online. The bot now:
1. Detects when the server is offline (ECONNRESET)
2. Waits with exponential backoff
3. Reconnects automatically when the server comes back online
4. Starts the server if it joins as the first player (if auto-start is enabled)

## Logs to Monitor

Key log messages to watch for:
- `[Bot] Connecting to...` - Connection attempt
- `Bot spawned!` - Successful connection
- `[Bot] Connection error detected` - Temporary issue
- `[Bot] Reconnecting in Xs` - Automatic retry in progress
- `Connection: STABLE` - Bot is running normally

## Conclusion

The bot is now production-ready for 24/7 operation with:
- ✅ Robust error handling
- ✅ Automatic reconnection
- ✅ No crashes or hangs
- ✅ Keep-alive to prevent idle kicks
- ✅ Minimal resource usage
- ✅ Comprehensive logging
