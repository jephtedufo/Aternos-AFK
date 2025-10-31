const mineflayer = require('mineflayer')
const fs = require('fs');
const { keep_alive } = require("./keep_alive");
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');

keep_alive();

let rawdata = fs.readFileSync('config.json');
let data = JSON.parse(rawdata);

// Core State Variables
var spawnPoint = null;
var connected = false;
var isMoving = false;
var maxDistance = 15;
var isPerformingAction = false;
var followingPlayer = null;
var isFollowingPlayer = false;
var currentSpeed = 'walk';
var aiReady = false;

// Reconnection variables
let reconnectAttempts = 0;
const maxReconnectDelay = 60000; // 1 minute max
let bot;

// AI Loop interval IDs to prevent duplicates
let aiIntervals = [];
let aiStarted = false;

function createBot() {
  const config = {
    host: data["ip"],
    port: data["port"] ? parseInt(data["port"]) : undefined,
    username: data["name"],
    version: data["version"] || false,
    closeTimeout: 60000,
    checkTimeoutInterval: 30000
  };

  console.log(`[Bot] Connecting to ${config.host}${config.port ? ':' + config.port : ''}...`);
  console.log(`[Bot] Note: If using Aternos, make sure the server is online first!`);
  
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);
  
  return bot;
}

bot = createBot();
setupEventHandlers();

// ==================== CORE AI FUNCTIONS ====================

function getSmartWanderPosition() {
  if (!spawnPoint) return null;
  
  const dist = 5 + Math.random() * maxDistance;
  const angle = Math.random() * Math.PI * 2;
  
  const x = spawnPoint.x + Math.cos(angle) * dist;
  const z = spawnPoint.z + Math.sin(angle) * dist;
  const y = spawnPoint.y;
  
  return new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
}

function startWandering() {
  if (!aiReady || !connected || isMoving || isPerformingAction || isFollowingPlayer) return;
  
  const targetPos = getSmartWanderPosition();
  if (!targetPos) return;
  
  const shouldSprint = (currentSpeed === 'sprint');
  const movements = new Movements(bot);
  movements.canDig = false;
  movements.allow1by1towers = false;
  movements.scafoldingBlocks = [];
  movements.sprint = shouldSprint;
  
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
  
  isMoving = true;
  console.log(`[Move] ${shouldSprint ? 'Running' : 'Walking'} to X=${targetPos.x}, Z=${targetPos.z}`);
}

function randomSpeedChange() {
  if (!aiReady) return;
  
  const rand = Math.random();
  
  if (rand < 0.7) {
    currentSpeed = 'walk';
  } else if (rand < 0.9) {
    currentSpeed = 'sprint';
  } else {
    currentSpeed = 'pause';
    if (isMoving) {
      bot.pathfinder.setGoal(null);
      isMoving = false;
      console.log('[AI] Pausing...');
    }
  }
  
  const duration = currentSpeed === 'sprint' ? 3000 + Math.random() * 3000 : 
                   currentSpeed === 'pause' ? 2000 + Math.random() * 2000 :
                   8000 + Math.random() * 7000;
  
  setTimeout(() => randomSpeedChange(), duration);
}

// Random item holding
async function randomlyHoldItem() {
  if (!aiReady || isPerformingAction || isGettingFood) return;
  
  const items = bot.inventory.items();
  if (items.length === 0) return;
  
  const randomItem = items[Math.floor(Math.random() * items.length)];
  
  try {
    await bot.equip(randomItem, 'hand');
    console.log(`[AI] Now holding ${randomItem.name}`);
  } catch (error) {
    // Silently fail if can't equip
  }
}

// Random movements (crouch/jump)
async function randomMovements() {
  if (!aiReady || isPerformingAction) return;
  
  const rand = Math.random();
  
  if (rand < 0.3) {
    // Crouch for a few seconds
    const duration = 2000 + Math.random() * 3000;
    console.log('[AI] Crouching...');
    bot.setControlState('sneak', true);
    
    setTimeout(() => {
      bot.setControlState('sneak', false);
      console.log('[AI] Stopped crouching');
    }, duration);
    
  } else if (rand < 0.6) {
    // Jump a few times
    const jumps = 2 + Math.floor(Math.random() * 3);
    console.log(`[AI] Jumping ${jumps} times`);
    
    for (let i = 0; i < jumps; i++) {
      bot.setControlState('jump', true);
      await new Promise(resolve => setTimeout(resolve, 100));
      bot.setControlState('jump', false);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
}

// Scan for interactable objects
function scanForInteractables() {
  if (!aiReady || !bot.entity || isPerformingAction) return null;
  
  const pos = bot.entity.position;
  const radius = 15;
  const interactables = [];
  
  const targetBlocks = ['oak_door', 'spruce_door', 'birch_door', 'jungle_door', 
                        'acacia_door', 'dark_oak_door', 'iron_door', 'chest', 
                        'lever', 'stone_button', 'oak_button'];
  
  for (let x = -radius; x <= radius; x += 2) {
    for (let y = -2; y <= 2; y++) {
      for (let z = -radius; z <= radius; z += 2) {
        const block = bot.blockAt(pos.offset(x, y, z));
        if (block && targetBlocks.includes(block.name)) {
          const distance = pos.distanceTo(block.position);
          if (distance > 3) {
            interactables.push({ block, distance });
          }
        }
      }
    }
  }
  
  return interactables.length > 0 ? interactables : null;
}

async function interactWithObject(block) {
  if (!block) return;
  
  console.log(`[AI] Interacting with ${block.name}`);
  isPerformingAction = true;
  isMoving = false;
  bot.pathfinder.setGoal(null);
  
  try {
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.sprint = false;
    
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    bot.pathfinder.setGoal(null);
    
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
    await new Promise(resolve => setTimeout(resolve, 400));
    
    if (block.name.includes('door')) {
      await bot.activateBlock(block);
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      const doorBlock = bot.blockAt(block.position);
      if (doorBlock) await bot.activateBlock(doorBlock);
    } else if (block.name === 'chest') {
      const window = await bot.openContainer(block);
      await new Promise(resolve => setTimeout(resolve, 500));
      bot.closeWindow(window);
    } else {
      await bot.activateBlock(block);
    }
    
    console.log('[AI] Interaction complete');
  } catch (error) {
    console.log('[AI] Interaction failed');
  } finally {
    isPerformingAction = false;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function checkEnvironment() {
  if (!aiReady || isPerformingAction || isFollowingPlayer) return;
  
  const interactables = scanForInteractables();
  if (!interactables) return;
  
  interactables.sort((a, b) => a.distance - b.distance);
  const closest = interactables.slice(0, Math.min(2, interactables.length));
  const target = closest[Math.floor(Math.random() * closest.length)];
  
  await interactWithObject(target.block);
}

// Player detection and following
function detectNearbyPlayers() {
  if (!aiReady || !bot.entity) return null;
  
  const players = Object.values(bot.entities).filter(entity => 
    entity.type === 'player' && 
    entity !== bot.entity &&
    entity.position &&
    entity.username !== bot.username &&
    bot.entity.position.distanceTo(entity.position) <= 10
  );
  
  return players.length > 0 ? players : null;
}

function getNearestPlayer(players) {
  if (!players || players.length === 0) return null;
  
  let nearest = players[0];
  let minDistance = bot.entity.position.distanceTo(nearest.position);
  
  for (let i = 1; i < players.length; i++) {
    const distance = bot.entity.position.distanceTo(players[i].position);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = players[i];
    }
  }
  
  return nearest;
}

async function followPlayer(player) {
  if (!player || !player.position) return;
  
  console.log(`[AI] Following ${player.username} for 30 seconds`);
  isFollowingPlayer = true;
  followingPlayer = player;
  isMoving = false;
  
  const followDistance = 2 + Math.random();
  const movements = new Movements(bot);
  movements.canDig = false;
  movements.sprint = (currentSpeed === 'sprint');
  
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new goals.GoalFollow(player, followDistance), true);
  
  setTimeout(() => {
    stopFollowing();
    console.log('[AI] 30 seconds elapsed, returning to normal activity');
  }, 30000);
}

function stopFollowing() {
  if (isFollowingPlayer) {
    console.log('[AI] Stopped following');
    bot.pathfinder.setGoal(null);
    isFollowingPlayer = false;
    followingPlayer = null;
    isMoving = false;
  }
}

async function checkForPlayers() {
  if (!aiReady || isPerformingAction || isFollowingPlayer) return;
  
  const players = detectNearbyPlayers();
  if (!players) return;
  
  if (Math.random() < 0.5) {
    const nearestPlayer = getNearestPlayer(players);
    if (nearestPlayer) {
      await followPlayer(nearestPlayer);
    }
  }
}

// Hunger and eating management
var isGettingFood = false;
const foodChestLocation = new Vec3(2319, 77, 2975);

function findSteakInInventory() {
  const items = bot.inventory.items();
  return items.find(item => item.name === 'cooked_beef' || item.name === 'beef');
}

async function goToChestAndGetSteak() {
  if (isGettingFood || isPerformingAction) return;
  
  console.log('[AI] No steak in inventory, going to chest to get food');
  isGettingFood = true;
  isPerformingAction = true;
  
  try {
    bot.pathfinder.setGoal(null);
    isMoving = false;
    
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.sprint = false;
    
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(foodChestLocation.x, foodChestLocation.y, foodChestLocation.z, 2));
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    bot.pathfinder.setGoal(null);
    
    const chestBlock = bot.blockAt(foodChestLocation);
    if (!chestBlock || chestBlock.name !== 'chest') {
      console.log('[AI] Could not find chest at expected location');
      isGettingFood = false;
      isPerformingAction = false;
      return;
    }
    
    console.log('[AI] Opening chest to get steak');
    await bot.lookAt(chestBlock.position.offset(0.5, 0.5, 0.5));
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const window = await bot.openContainer(chestBlock);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const steakInChest = window.containerItems().find(item => 
      item.name === 'cooked_beef' || item.name === 'beef'
    );
    
    if (steakInChest) {
      console.log(`[AI] Found ${steakInChest.name} in chest, taking it`);
      await window.withdraw(steakInChest.type, null, steakInChest.count);
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      console.log('[AI] No steak found in chest');
    }
    
    bot.closeWindow(window);
    console.log('[AI] Closed chest');
    
  } catch (error) {
    console.log('[AI] Failed to get food from chest:', error.message);
  } finally {
    isGettingFood = false;
    isPerformingAction = false;
  }
}

async function checkHungerAndEat() {
  if (!aiReady || !bot.entity || isGettingFood || isPerformingAction) return;
  
  const food = bot.food || 20;
  const hungerThreshold = 14;
  
  if (food < hungerThreshold) {
    console.log(`[AI] Hunger is low (${food}/20), looking for food`);
    isPerformingAction = true;
    
    try {
      let steakItem = findSteakInInventory();
      
      if (!steakItem) {
        console.log('[AI] No steak in inventory');
        isPerformingAction = false;
        await goToChestAndGetSteak();
        await new Promise(resolve => setTimeout(resolve, 1000));
        steakItem = findSteakInInventory();
        isPerformingAction = true;
      }
      
      if (steakItem) {
        console.log(`[AI] Found ${steakItem.name} in inventory, preparing to eat`);
        
        await bot.equip(steakItem, 'hand');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`[AI] Eating ${steakItem.name}...`);
        bot.activateItem();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`[AI] Finished eating! Hunger now: ${bot.food}/20`);
      } else {
        console.log('[AI] Still no steak available after checking chest');
      }
    } catch (error) {
      console.log('[AI] Failed to eat:', error.message);
    } finally {
      isPerformingAction = false;
    }
  }
}

// Clear all AI intervals
function clearAIIntervals() {
  aiIntervals.forEach(intervalId => clearInterval(intervalId));
  aiIntervals = [];
  aiStarted = false;
}

// Main AI Loop
function startAI() {
  // Prevent duplicate AI loops
  if (aiStarted) {
    console.log('[AI] AI loop already running, skipping duplicate start');
    return;
  }
  
  aiStarted = true;
  randomSpeedChange();
  
  // Environment check every 8-12 seconds
  aiIntervals.push(setInterval(() => {
    if (aiReady && Math.random() < 0.2) {
      checkEnvironment();
    }
  }, 8000 + Math.random() * 4000));
  
  // Player check every 5-8 seconds
  aiIntervals.push(setInterval(() => {
    if (aiReady && Math.random() < 0.4) {
      checkForPlayers();
    }
  }, 5000 + Math.random() * 3000));
  
  // Hunger check every 3 seconds
  aiIntervals.push(setInterval(() => {
    if (aiReady) {
      checkHungerAndEat();
    }
  }, 3000));
  
  // Random item holding every 10-20 seconds
  aiIntervals.push(setInterval(() => {
    if (aiReady && Math.random() < 0.3) {
      randomlyHoldItem();
    }
  }, 10000 + Math.random() * 10000));
  
  // Random movements (crouch/jump) every 8-15 seconds
  aiIntervals.push(setInterval(() => {
    if (aiReady && Math.random() < 0.4) {
      randomMovements();
    }
  }, 8000 + Math.random() * 7000));
  
  // Wander loop every 3-6 seconds
  aiIntervals.push(setInterval(() => {
    if (aiReady && !isMoving && !isPerformingAction && !isFollowingPlayer) {
      startWandering();
    }
  }, 3000 + Math.random() * 3000));
  
  setTimeout(() => startWandering(), 2000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Bot] Shutting down gracefully...');
  if (bot) {
    bot.quit();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot] Shutting down gracefully...');
  if (bot) {
    bot.quit();
  }
  process.exit(0);
});

function setupEventHandlers() {
  bot.on('login', function(){
    console.log("Logged In")
  });

  bot.on('spawn', function() {
    console.log("Bot spawned!");
    connected = true;
    aiReady = false;
    reconnectAttempts = 0;
    
    setTimeout(() => {
      if (bot.entity && bot.entity.position) {
        spawnPoint = bot.entity.position.clone();
        console.log(`\n${"=".repeat(50)}`);
        console.log(`M3GAN AI System Initializing...`);
        console.log(`Spawn: X=${spawnPoint.x.toFixed(1)}, Y=${spawnPoint.y.toFixed(1)}, Z=${spawnPoint.z.toFixed(1)}`);
        console.log("=".repeat(50));
        
        setTimeout(() => {
          aiReady = true;
          console.log("[AI] M3GAN is now active\n");
          startAI();
        }, 3000);
      }
    }, 2000);
  });

  bot.on('goal_reached', function() {
    if (isFollowingPlayer) return;
    console.log('[Move] Reached destination');
    isMoving = false;
  });

  bot.on('path_update', function(results) {
    if (isFollowingPlayer) return;
    
    if (results.status === 'noPath') {
      isMoving = false;
    }
  });

  bot.on('end', function() {
    console.log('[Bot] Disconnected from server');
    connected = false;
    aiReady = false;
    isMoving = false;
    isPerformingAction = false;
    isFollowingPlayer = false;
    
    // Clear all AI intervals to prevent duplicates on reconnect
    clearAIIntervals();
    
    // Auto-reconnect with exponential backoff
    reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), maxReconnectDelay);
    console.log(`[Bot] Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts})...`);
    
    setTimeout(() => {
      bot = createBot();
      setupEventHandlers();
    }, delay);
  });

  bot.on('kicked', function(reason) {
    console.log('[Bot] Kicked from server:', reason);
    connected = false;
    aiReady = false;
  });

  bot.on('error', function(err) {
    console.error(`[Bot] Error occurred:`, {
      code: err.code,
      message: err.message,
      syscall: err.syscall
    });
    
    // Handle connection errors (ECONNRESET, ECONNREFUSED, etc.)
    if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log(`[Bot] Connection error detected. The server might be offline.`);
      
      // Don't trigger reconnect immediately if already disconnected
      if (!connected) {
        console.log(`[Bot] Already disconnected, waiting for 'end' event to trigger reconnect...`);
        return;
      }
      
      // Manually trigger disconnect handling
      connected = false;
      aiReady = false;
      isMoving = false;
      isPerformingAction = false;
      isFollowingPlayer = false;
      clearAIIntervals();
      
      // Try to disconnect gracefully
      if (bot) {
        try {
          bot.quit();
        } catch (e) {
          // Ignore quit errors
        }
      }
    }
  });
}
