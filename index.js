const mineflayer = require('mineflayer');
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
var isGettingFood = false;

// Reconnection variables - STABILIZED to prevent rapid leave/rejoin
let reconnectAttempts = 0;
const maxReconnectDelay = 300000; // Max 5 minutes between attempts
const initialReconnectDelay = 30000; // Start with 30 seconds (servers need time)
let bot;
let reconnectTimeout = null;
let isReconnecting = false;
let lastConnectTime = 0;
const MIN_CONNECTION_INTERVAL = 60000; // Minimum 60 seconds between connection attempts

// OPTIMIZED: Single interval tracking to prevent memory leaks
let mainAIInterval = null;
let keepAliveInterval = null;
let watchdogInterval = null;
let moodChangeTimeout = null;

// OPTIMIZED: Action timeout watchdog - prevents bot from getting stuck
let actionStartTime = 0;
const ACTION_TIMEOUT = 15000; // Max 15 seconds for any action

// AI Behavioral Moods
var currentMood = 'curious';

// Movement variation
var isCrouching = false;
var lastActionTime = Date.now();
var lastActivityTime = Date.now();

// Decision weights that change based on mood
const moodProfiles = {
  curious: {
    exploreChance: 0.7,
    interactChance: 0.6,
    followChance: 0.4,
    pauseChance: 0.2,
    sprintChance: 0.3,
    crouchChance: 0.2,
    wanderRadius: 20,
    hungerThreshold: 12
  },
  energetic: {
    exploreChance: 0.9,
    interactChance: 0.5,
    followChance: 0.7,
    pauseChance: 0.1,
    sprintChance: 0.7,
    crouchChance: 0.1,
    wanderRadius: 25,
    hungerThreshold: 10
  },
  cautious: {
    exploreChance: 0.4,
    interactChance: 0.3,
    followChance: 0.2,
    pauseChance: 0.4,
    sprintChance: 0.1,
    crouchChance: 0.5,
    wanderRadius: 10,
    hungerThreshold: 16
  },
  playful: {
    exploreChance: 0.6,
    interactChance: 0.8,
    followChance: 0.6,
    pauseChance: 0.3,
    sprintChance: 0.5,
    crouchChance: 0.4,
    wanderRadius: 18,
    hungerThreshold: 14
  },
  focused: {
    exploreChance: 0.5,
    interactChance: 0.4,
    followChance: 0.3,
    pauseChance: 0.2,
    sprintChance: 0.4,
    crouchChance: 0.2,
    wanderRadius: 15,
    hungerThreshold: 15
  }
};

function createBot() {
  const config = {
    host: data["ip"],
    port: data["port"] ? parseInt(data["port"]) : undefined,
    username: data["name"],
    version: data["version"] || false,
    closeTimeout: 120000,
    checkTimeoutInterval: 60000,
    keepAlive: true,
    hideErrors: false
  };

  console.log(`[Bot] Connecting to ${config.host}${config.port ? ':' + config.port : ''}...`);
  console.log(`[Bot] Note: If using Aternos, make sure the server is online first!`);
  
  try {
    bot = mineflayer.createBot(config);
    bot.loadPlugin(pathfinder);
    
    setupKeepAlive();
    setupWatchdog();
    
    return bot;
  } catch (error) {
    console.error('[Bot] Failed to create bot:', error.message);
    return null;
  }
}

// OPTIMIZED: Better keep-alive system
function setupKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  
  keepAliveInterval = setInterval(() => {
    if (bot && connected && bot.entity) {
      try {
        // Small movement to show activity
        bot.look(bot.entity.yaw + 0.01, bot.entity.pitch, true);
        lastActivityTime = Date.now();
      } catch (e) {
        // Ignore errors
      }
    }
  }, 30000);
}

// OPTIMIZED: Watchdog to detect and fix stuck states
function setupWatchdog() {
  if (watchdogInterval) clearInterval(watchdogInterval);
  
  watchdogInterval = setInterval(() => {
    if (!connected || !aiReady) return;
    
    const now = Date.now();
    
    // Check if action has been running too long
    if (isPerformingAction && actionStartTime > 0) {
      if (now - actionStartTime > ACTION_TIMEOUT) {
        console.log('[Watchdog] Action timeout - forcing reset');
        forceResetState();
      }
    }
    
    // Check if bot has been idle too long (60 seconds without activity)
    if (now - lastActivityTime > 60000 && !isMoving && !isPerformingAction) {
      console.log('[Watchdog] Bot appears idle - triggering activity');
      lastActivityTime = now;
      if (aiReady && !isFollowingPlayer) {
        startWandering();
      }
    }
    
    // Memory cleanup - force garbage collection hint
    if (global.gc) {
      global.gc();
    }
  }, 5000);
}

// OPTIMIZED: Force reset stuck states
function forceResetState() {
  console.log('[State] Forcing state reset');
  isPerformingAction = false;
  isMoving = false;
  isGettingFood = false;
  actionStartTime = 0;
  isCrouching = false;
  
  if (bot && bot.pathfinder) {
    try {
      bot.pathfinder.setGoal(null);
      bot.setControlState('sneak', false);
      bot.setControlState('jump', false);
    } catch (e) {
      // Ignore errors
    }
  }
  
  lastActivityTime = Date.now();
}

bot = createBot();
setupEventHandlers();

// Randomly change the bot's behavioral mood
function changeMood() {
  if (!aiReady || !connected) return;
  
  const moods = ['curious', 'energetic', 'cautious', 'playful', 'focused'];
  const oldMood = currentMood;
  
  const availableMoods = moods.filter(m => m !== currentMood);
  currentMood = availableMoods[Math.floor(Math.random() * availableMoods.length)];
  
  console.log(`[AI] Mood changed from ${oldMood} to ${currentMood}`);
  maxDistance = moodProfiles[currentMood].wanderRadius;
  
  // Schedule next mood change (1-3 minutes)
  const nextMoodChange = 60000 + Math.random() * 120000;
  if (moodChangeTimeout) clearTimeout(moodChangeTimeout);
  moodChangeTimeout = setTimeout(() => changeMood(), nextMoodChange);
}

function getMoodProfile() {
  return moodProfiles[currentMood] || moodProfiles.curious;
}

function shouldDoAction(actionChance) {
  return Math.random() < actionChance;
}

function getSmartWanderPosition() {
  if (!spawnPoint) return null;
  
  const mood = getMoodProfile();
  const baseDistance = 5;
  const dist = baseDistance + Math.random() * mood.wanderRadius;
  const angle = Math.random() * Math.PI * 2;
  
  const pattern = Math.random();
  let x, z;
  
  if (pattern < 0.3) {
    x = spawnPoint.x + Math.cos(angle) * dist;
    z = spawnPoint.z + Math.sin(angle) * dist;
  } else if (pattern < 0.6) {
    x = spawnPoint.x + Math.cos(angle) * dist + Math.sin(angle * 2) * (dist * 0.5);
    z = spawnPoint.z + Math.sin(angle) * dist;
  } else {
    x = spawnPoint.x + (Math.random() - 0.5) * mood.wanderRadius * 2;
    z = spawnPoint.z + (Math.random() - 0.5) * mood.wanderRadius * 2;
  }
  
  const y = spawnPoint.y;
  return new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
}

function startWandering() {
  if (!aiReady || !connected || isMoving || isPerformingAction || isFollowingPlayer) return;
  if (!bot || !bot.pathfinder) return;
  
  const targetPos = getSmartWanderPosition();
  if (!targetPos) return;
  
  const shouldSprint = (currentSpeed === 'sprint');
  const shouldCrouch = (currentSpeed === 'crouch');
  
  try {
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.scafoldingBlocks = [];
    movements.sprint = shouldSprint && !shouldCrouch;
    
    if (shouldCrouch && bot.entity) {
      bot.setControlState('sneak', true);
      isCrouching = true;
    } else if (isCrouching) {
      bot.setControlState('sneak', false);
      isCrouching = false;
    }
    
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
    
    isMoving = true;
    lastActivityTime = Date.now();
    const moveType = shouldCrouch ? 'Crouching' : (shouldSprint ? 'Running' : 'Walking');
    console.log(`[Move] ${moveType} to X=${targetPos.x}, Z=${targetPos.z} (Mood: ${currentMood})`);
  } catch (error) {
    isMoving = false;
  }
}

function randomSpeedChange() {
  if (!aiReady || !connected) return;
  
  const mood = getMoodProfile();
  const rand = Math.random();
  
  let newSpeed;
  if (rand < mood.sprintChance) {
    newSpeed = 'sprint';
  } else if (rand < mood.sprintChance + mood.crouchChance) {
    newSpeed = 'crouch';
  } else if (rand < mood.sprintChance + mood.crouchChance + mood.pauseChance) {
    newSpeed = 'pause';
  } else {
    newSpeed = 'walk';
  }
  
  if (newSpeed !== currentSpeed) {
    currentSpeed = newSpeed;
    
    if (currentSpeed === 'pause') {
      if (isMoving && bot && bot.pathfinder) {
        bot.pathfinder.setGoal(null);
        isMoving = false;
        console.log('[AI] Taking a break...');
      }
    } else if (currentSpeed === 'crouch' && !isCrouching) {
      console.log('[AI] Moving cautiously (crouching)');
    } else if (currentSpeed === 'sprint') {
      console.log('[AI] Feeling energetic, time to run!');
    }
  }
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
    lastActivityTime = Date.now();
  } catch (error) {
    // Silently fail
  }
}

// OPTIMIZED: Simpler random movements with timeout protection
async function randomMovements() {
  if (!aiReady || isPerformingAction) return;
  
  const actionType = Math.random();
  
  try {
    lastActivityTime = Date.now();
    
    if (actionType < 0.3) {
      // Quick crouch
      bot.setControlState('sneak', true);
      await sleep(1000 + Math.random() * 2000);
      bot.setControlState('sneak', false);
      
    } else if (actionType < 0.5) {
      // Jump
      const jumps = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < jumps; i++) {
        bot.setControlState('jump', true);
        await sleep(100);
        bot.setControlState('jump', false);
        await sleep(300);
      }
      
    } else if (actionType < 0.7) {
      // Look around
      if (bot && bot.entity) {
        const startYaw = bot.entity.yaw;
        for (let i = 0; i < 4; i++) {
          await bot.look(startYaw + (Math.PI * i / 2), 0, true);
          await sleep(200);
        }
      }
      
    } else {
      // Look up/down
      if (bot && bot.entity) {
        await bot.look(bot.entity.yaw, -Math.PI / 4, true);
        await sleep(400);
        await bot.look(bot.entity.yaw, Math.PI / 6, true);
        await sleep(400);
        await bot.look(bot.entity.yaw, 0, true);
      }
    }
  } catch (error) {
    // Silently handle errors
  }
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// OPTIMIZED: Interaction with timeout protection
async function interactWithObject(block) {
  if (!block || !bot || !bot.pathfinder) return;
  
  console.log(`[AI] Interacting with ${block.name}`);
  isPerformingAction = true;
  actionStartTime = Date.now();
  isMoving = false;
  
  try {
    bot.pathfinder.setGoal(null);
    
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.sprint = false;
    
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
    
    await sleep(3000);
    bot.pathfinder.setGoal(null);
    
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
    await sleep(400);
    
    if (block.name.includes('door')) {
      await bot.activateBlock(block);
      await sleep(1000 + Math.random() * 1000);
      const doorBlock = bot.blockAt(block.position);
      if (doorBlock) await bot.activateBlock(doorBlock);
    } else if (block.name === 'chest') {
      const window = await bot.openContainer(block);
      await sleep(500);
      bot.closeWindow(window);
    } else {
      await bot.activateBlock(block);
    }
    
    console.log('[AI] Interaction complete');
    lastActivityTime = Date.now();
  } catch (error) {
    console.log('[AI] Interaction failed:', error.message);
  } finally {
    isPerformingAction = false;
    actionStartTime = 0;
    await sleep(500);
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
  if (!bot || !bot.pathfinder) return;
  
  console.log(`[AI] Following ${player.username} for 30 seconds`);
  isFollowingPlayer = true;
  followingPlayer = player;
  isMoving = false;
  lastActivityTime = Date.now();
  
  try {
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
  } catch (error) {
    console.log('[AI] Failed to follow player');
    isFollowingPlayer = false;
    followingPlayer = null;
  }
}

function stopFollowing() {
  if (isFollowingPlayer) {
    console.log('[AI] Stopped following');
    if (bot && bot.pathfinder) {
      try {
        bot.pathfinder.setGoal(null);
      } catch (e) {
        // Ignore
      }
    }
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

// Food management
const foodChestLocation = new Vec3(2319, 77, 2975);

function findFoodInInventory() {
  const items = bot.inventory.items();
  const foodItems = [
    'cooked_beef', 'beef', 'cooked_porkchop', 'porkchop',
    'cooked_chicken', 'chicken', 'cooked_mutton', 'mutton',
    'bread', 'baked_potato', 'potato', 'carrot', 'apple',
    'cooked_salmon', 'salmon', 'cooked_cod', 'cod', 'cookie',
    'melon_slice', 'sweet_berries', 'golden_apple', 'golden_carrot'
  ];
  
  for (const foodName of foodItems) {
    const food = items.find(item => item.name === foodName);
    if (food) return food;
  }
  
  return null;
}

function findSteakInInventory() {
  const items = bot.inventory.items();
  return items.find(item => item.name === 'cooked_beef' || item.name === 'beef');
}

async function goToChestAndGetSteak() {
  if (isGettingFood || isPerformingAction || !bot || !bot.pathfinder) return;
  
  console.log('[AI] No steak in inventory, going to chest to get food');
  isGettingFood = true;
  isPerformingAction = true;
  actionStartTime = Date.now();
  
  try {
    bot.pathfinder.setGoal(null);
    isMoving = false;
    
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.sprint = false;
    
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(foodChestLocation.x, foodChestLocation.y, foodChestLocation.z, 2));
    
    await sleep(5000);
    bot.pathfinder.setGoal(null);
    
    const chestBlock = bot.blockAt(foodChestLocation);
    if (!chestBlock || chestBlock.name !== 'chest') {
      console.log('[AI] Could not find chest at expected location');
      return;
    }
    
    console.log('[AI] Opening chest to get steak');
    await bot.lookAt(chestBlock.position.offset(0.5, 0.5, 0.5));
    await sleep(300);
    
    const window = await bot.openContainer(chestBlock);
    await sleep(500);
    
    const steakInChest = window.containerItems().find(item => 
      item.name === 'cooked_beef' || item.name === 'beef'
    );
    
    if (steakInChest) {
      console.log(`[AI] Found ${steakInChest.name} in chest, taking it`);
      await window.withdraw(steakInChest.type, null, steakInChest.count);
      await sleep(300);
    } else {
      console.log('[AI] No steak found in chest');
    }
    
    bot.closeWindow(window);
    console.log('[AI] Closed chest');
    lastActivityTime = Date.now();
    
  } catch (error) {
    console.log('[AI] Failed to get food from chest:', error.message);
  } finally {
    isGettingFood = false;
    isPerformingAction = false;
    actionStartTime = 0;
  }
}

async function checkHungerAndEat() {
  if (!aiReady || !bot.entity || isGettingFood || isPerformingAction) return;
  
  const mood = getMoodProfile();
  const currentHunger = bot.food || 20;
  const hungerThreshold = mood.hungerThreshold;
  
  if (currentHunger < hungerThreshold) {
    console.log(`[AI] Hunger at ${currentHunger}/20 (threshold: ${hungerThreshold}), time to eat`);
    isPerformingAction = true;
    actionStartTime = Date.now();
    
    try {
      let foodItem = findFoodInInventory();
      
      if (!foodItem) {
        console.log('[AI] No food in inventory, heading to food chest');
        isPerformingAction = false;
        actionStartTime = 0;
        await goToChestAndGetSteak();
        await sleep(1000);
        foodItem = findFoodInInventory();
        isPerformingAction = true;
        actionStartTime = Date.now();
      }
      
      if (foodItem) {
        console.log(`[AI] Found ${foodItem.name} in inventory, preparing to eat`);
        
        await bot.equip(foodItem, 'hand');
        await sleep(500);
        
        console.log(`[AI] Eating ${foodItem.name}... nom nom nom`);
        bot.activateItem();
        
        await sleep(2000);
        
        const newHunger = bot.food || 20;
        console.log(`[AI] Finished eating! Hunger: ${currentHunger} -> ${newHunger}/20`);
        lastActivityTime = Date.now();
        
      } else {
        console.log('[AI] Still no food available after checking chest');
      }
    } catch (error) {
      console.log('[AI] Failed to eat:', error.message);
    } finally {
      isPerformingAction = false;
      actionStartTime = 0;
    }
  }
}

// OPTIMIZED: Clear all AI-related intervals
function clearAllIntervals() {
  if (mainAIInterval) {
    clearInterval(mainAIInterval);
    mainAIInterval = null;
  }
  if (moodChangeTimeout) {
    clearTimeout(moodChangeTimeout);
    moodChangeTimeout = null;
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

// OPTIMIZED: Single unified AI loop instead of multiple intervals
function startAI() {
  if (mainAIInterval) {
    console.log('[AI] AI loop already running, skipping duplicate start');
    return;
  }
  
  console.log('[AI] Starting optimized AI decision system...');
  
  changeMood();
  randomSpeedChange();
  
  // Single main loop that handles all decisions - much more efficient
  mainAIInterval = setInterval(() => {
    if (!aiReady || !connected) return;
    
    // Make a decision each tick
    const decision = Math.random();
    
    // Priority 1: Check hunger (20% chance each tick)
    if (decision < 0.2 && !isPerformingAction && !isGettingFood) {
      checkHungerAndEat();
    }
    // Priority 2: Wandering (30% chance if not busy)
    else if (decision < 0.5 && !isMoving && !isPerformingAction && !isFollowingPlayer) {
      const mood = getMoodProfile();
      if (shouldDoAction(mood.exploreChance)) {
        startWandering();
      }
    }
    // Priority 3: Random movements (15% chance)
    else if (decision < 0.65 && !isPerformingAction) {
      if (shouldDoAction(0.5)) {
        randomMovements();
      }
    }
    // Priority 4: Check for players (10% chance)
    else if (decision < 0.75 && !isPerformingAction && !isFollowingPlayer) {
      const mood = getMoodProfile();
      if (shouldDoAction(mood.followChance)) {
        checkForPlayers();
      }
    }
    // Priority 5: Environment interaction (10% chance)
    else if (decision < 0.85 && !isPerformingAction && !isFollowingPlayer) {
      const mood = getMoodProfile();
      if (shouldDoAction(mood.interactChance * 0.5)) {
        checkEnvironment();
      }
    }
    // Priority 6: Random item holding (5% chance)
    else if (decision < 0.9 && !isPerformingAction && !isGettingFood) {
      if (shouldDoAction(0.3)) {
        randomlyHoldItem();
      }
    }
    // Priority 7: Speed change (10% chance)
    else {
      if (shouldDoAction(0.3)) {
        randomSpeedChange();
      }
    }
  }, 2000); // Run every 2 seconds
  
  // Start initial wander
  setTimeout(() => {
    if (aiReady) startWandering();
  }, 2000);
  
  console.log('[AI] Optimized AI system active - single loop, no memory leaks');
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('[Bot] Shutting down gracefully...');
  clearAllIntervals();
  if (bot && typeof bot.quit === 'function') {
    try { bot.quit(); } catch (e) {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot] Shutting down gracefully...');
  clearAllIntervals();
  if (bot && typeof bot.quit === 'function') {
    try { bot.quit(); } catch (e) {}
  }
  process.exit(0);
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('[Bot] Uncaught exception:', err.message);
  // Don't exit, try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Bot] Unhandled rejection:', reason);
  // Don't exit, try to recover
});

function setupEventHandlers() {
  bot.on('login', function(){
    console.log("Logged In");
  });

  bot.on('spawn', function() {
    console.log("Bot spawned!");
    connected = true;
    aiReady = false;
    reconnectAttempts = 0; // Reset on successful spawn
    isReconnecting = false;
    lastActivityTime = Date.now();
    lastConnectTime = Date.now(); // Track successful connection time
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    setTimeout(() => {
      if (bot && bot.entity && bot.entity.position) {
        spawnPoint = bot.entity.position.clone();
        console.log(`\n${"=".repeat(50)}`);
        console.log(`M3GAN AI System Initializing...`);
        console.log(`Spawn: X=${spawnPoint.x.toFixed(1)}, Y=${spawnPoint.y.toFixed(1)}, Z=${spawnPoint.z.toFixed(1)}`);
        console.log(`Connection: STABLE | Mode: OPTIMIZED`);
        console.log("=".repeat(50));
        
        setTimeout(() => {
          aiReady = true;
          console.log("[AI] M3GAN is now active and optimized for 24/7 operation\n");
          startAI();
        }, 3000);
      }
    }, 2000);
  });

  bot.on('goal_reached', function() {
    if (isFollowingPlayer) return;
    console.log('[Move] Reached destination');
    isMoving = false;
    lastActivityTime = Date.now();
  });

  bot.on('path_update', function(results) {
    if (isFollowingPlayer) return;
    
    if (results.status === 'noPath') {
      isMoving = false;
    }
  });

  bot.on('end', function(reason) {
    console.log('[Bot] Disconnected from server. Reason:', reason || 'Unknown');
    connected = false;
    aiReady = false;
    isMoving = false;
    isPerformingAction = false;
    isFollowingPlayer = false;
    actionStartTime = 0;
    
    // Clear main AI interval
    if (mainAIInterval) {
      clearInterval(mainAIInterval);
      mainAIInterval = null;
    }
    if (moodChangeTimeout) {
      clearTimeout(moodChangeTimeout);
      moodChangeTimeout = null;
    }
    
    if (isReconnecting) {
      console.log('[Bot] Reconnection already in progress, skipping...');
      return;
    }
    
    // Check if we need to wait before reconnecting (prevent rapid leave/rejoin)
    const now = Date.now();
    const timeSinceLastConnect = now - lastConnectTime;
    
    if (timeSinceLastConnect < MIN_CONNECTION_INTERVAL) {
      const waitTime = MIN_CONNECTION_INTERVAL - timeSinceLastConnect;
      console.log(`[Bot] Waiting ${Math.ceil(waitTime/1000)}s before reconnecting (cooldown)...`);
    }
    
    isReconnecting = true;
    reconnectAttempts++;
    
    // Calculate delay - start at 30s, max 5 minutes
    let delay = Math.min(initialReconnectDelay * Math.pow(1.5, Math.min(reconnectAttempts - 1, 6)), maxReconnectDelay);
    
    // Ensure minimum interval between connections
    if (timeSinceLastConnect < MIN_CONNECTION_INTERVAL) {
      delay = Math.max(delay, MIN_CONNECTION_INTERVAL - timeSinceLastConnect);
    }
    
    console.log(`[Bot] Reconnecting in ${Math.ceil(delay/1000)}s (attempt ${reconnectAttempts})...`);
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    
    reconnectTimeout = setTimeout(attemptReconnection, delay);
    
    function attemptReconnection() {
      try {
        console.log('[Bot] Attempting to reconnect...');
        lastConnectTime = Date.now();
        const newBot = createBot();
        if (newBot) {
          bot = newBot;
          setupEventHandlers();
          isReconnecting = false;
        } else {
          console.log('[Bot] Failed to create bot, will retry in 60 seconds...');
          isReconnecting = false;
          reconnectTimeout = setTimeout(attemptReconnection, 60000);
        }
      } catch (error) {
        console.error('[Bot] Reconnection error:', error.message);
        isReconnecting = false;
        console.log('[Bot] Will retry in 60 seconds...');
        reconnectTimeout = setTimeout(attemptReconnection, 60000);
      }
    }
  });

  bot.on('kicked', function(reason) {
    console.log('[Bot] Kicked from server:', reason);
    connected = false;
    aiReady = false;
  });

  bot.on('error', function(err) {
    if (!err) return;
    
    console.error(`[Bot] Error occurred:`, {
      code: err.code || 'UNKNOWN',
      message: err.message || 'Unknown error',
      syscall: err.syscall || 'N/A'
    });
    
    const connectionErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
    if (connectionErrors.includes(err.code)) {
      console.log(`[Bot] Connection error detected (${err.code}). Server may be offline or unreachable.`);
      
      if (connected) {
        connected = false;
        aiReady = false;
        isMoving = false;
        isPerformingAction = false;
        isFollowingPlayer = false;
        actionStartTime = 0;
        
        if (mainAIInterval) {
          clearInterval(mainAIInterval);
          mainAIInterval = null;
        }
      }
      
      console.log(`[Bot] Waiting for 'end' event to trigger reconnection...`);
    }
  });
  
  bot.on('health', function() {
    lastActivityTime = Date.now();
  });
  
  bot.on('disconnect', function(packet) {
    console.log('[Bot] Received disconnect packet:', packet.reason);
  });
}
