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
var isGettingFood = false;

// Reconnection variables
let reconnectAttempts = 0;
const maxReconnectDelay = 60000;
const initialReconnectDelay = 5000;
let bot;
let reconnectTimeout = null;
let isReconnecting = false;

// AI Loop interval IDs to prevent duplicates
let aiIntervals = [];
let aiStarted = false;

// Keep-alive interval
let keepAliveInterval = null;

// Speed change timeout to prevent memory leaks
let speedChangeTimeout = null;

// ==================== ENHANCED AI DECISION SYSTEM ====================
// AI Behavioral Moods - changes how the bot makes decisions
var currentMood = 'curious';
var moodChangeTimeout = null;

// Movement variation
var movementStyle = 'normal';
var isCrouching = false;
var lastActionTime = Date.now();

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
    closeTimeout: 120000, // Increased to 2 minutes
    checkTimeoutInterval: 60000, // Increased to 1 minute
    keepAlive: true, // Enable TCP keep-alive
    hideErrors: false // Show all errors for debugging
  };

  console.log(`[Bot] Connecting to ${config.host}${config.port ? ':' + config.port : ''}...`);
  console.log(`[Bot] Note: If using Aternos, make sure the server is online first!`);
  
  try {
    bot = mineflayer.createBot(config);
    bot.loadPlugin(pathfinder);
    
    // Set up keep-alive to prevent idle disconnections
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
    
    // Send a small movement packet every 30 seconds to keep connection alive
    keepAliveInterval = setInterval(() => {
      if (bot && connected && bot.entity) {
        try {
          // Just look around slightly to show activity
          bot.look(bot.entity.yaw + 0.01, bot.entity.pitch, true);
        } catch (e) {
          // Ignore errors
        }
      }
    }, 30000);
    
    return bot;
  } catch (error) {
    console.error('[Bot] Failed to create bot:', error.message);
    return null;
  }
}

bot = createBot();
setupEventHandlers();

// ==================== ENHANCED AI DECISION ENGINE ====================

// Randomly change the bot's behavioral mood
function changeMood() {
  if (!aiReady || !connected) return;
  
  const moods = ['curious', 'energetic', 'cautious', 'playful', 'focused'];
  const oldMood = currentMood;
  
  // Don't pick the same mood
  const availableMoods = moods.filter(m => m !== currentMood);
  currentMood = availableMoods[Math.floor(Math.random() * availableMoods.length)];
  
  console.log(`[AI] Mood changed from ${oldMood} to ${currentMood}`);
  
  // Update maxDistance based on new mood
  maxDistance = moodProfiles[currentMood].wanderRadius;
  
  // Schedule next mood change (30 seconds to 3 minutes)
  const nextMoodChange = 30000 + Math.random() * 150000;
  if (moodChangeTimeout) clearTimeout(moodChangeTimeout);
  moodChangeTimeout = setTimeout(() => changeMood(), nextMoodChange);
}

// Get current mood profile for decision making
function getMoodProfile() {
  return moodProfiles[currentMood] || moodProfiles.curious;
}

// Weighted random decision maker
function shouldDoAction(actionChance) {
  return Math.random() < actionChance;
}

// ==================== CORE AI FUNCTIONS ====================

function getSmartWanderPosition() {
  if (!spawnPoint) return null;
  
  const mood = getMoodProfile();
  const baseDistance = 5;
  const dist = baseDistance + Math.random() * mood.wanderRadius;
  const angle = Math.random() * Math.PI * 2;
  
  // Sometimes wander in a circle pattern, sometimes random
  const pattern = Math.random();
  let x, z;
  
  if (pattern < 0.3) {
    // Circular pattern
    x = spawnPoint.x + Math.cos(angle) * dist;
    z = spawnPoint.z + Math.sin(angle) * dist;
  } else if (pattern < 0.6) {
    // Figure-8 pattern
    x = spawnPoint.x + Math.cos(angle) * dist + Math.sin(angle * 2) * (dist * 0.5);
    z = spawnPoint.z + Math.sin(angle) * dist;
  } else {
    // Random exploration
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
  
  const mood = getMoodProfile();
  const shouldSprint = (currentSpeed === 'sprint');
  const shouldCrouch = (currentSpeed === 'crouch');
  
  try {
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.scafoldingBlocks = [];
    movements.sprint = shouldSprint && !shouldCrouch;
    
    // Apply crouching if that's the current speed
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
  
  // Mood-based speed decisions with more variety
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
  
  // Only change if it's actually different
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
  
  // Variable duration based on speed and mood
  const baseDuration = {
    sprint: 2000 + Math.random() * 4000,
    crouch: 3000 + Math.random() * 5000,
    pause: 1000 + Math.random() * 3000,
    walk: 5000 + Math.random() * 10000
  };
  
  const duration = baseDuration[currentSpeed] || 5000;
  
  if (speedChangeTimeout) {
    clearTimeout(speedChangeTimeout);
  }
  speedChangeTimeout = setTimeout(() => randomSpeedChange(), duration);
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

// Enhanced random movements with more variety
async function randomMovements() {
  if (!aiReady || isPerformingAction) return;
  
  const mood = getMoodProfile();
  const actionType = Math.random();
  
  try {
    if (actionType < 0.25) {
      // Crouch for varying duration
      const duration = 1000 + Math.random() * 4000;
      console.log('[AI] Crouching and looking around...');
      bot.setControlState('sneak', true);
      
      // Look around while crouching
      setTimeout(async () => {
        if (bot && bot.entity) {
          const randomYaw = bot.entity.yaw + (Math.random() - 0.5) * Math.PI;
          await bot.look(randomYaw, 0, true);
        }
      }, duration / 2);
      
      setTimeout(() => {
        if (bot) bot.setControlState('sneak', false);
      }, duration);
      
    } else if (actionType < 0.45) {
      // Jump varying amounts
      const jumps = 1 + Math.floor(Math.random() * 5);
      const jumpStyle = Math.random();
      
      if (jumpStyle < 0.5) {
        // Quick successive jumps
        console.log(`[AI] Jumping excitedly ${jumps} times`);
        for (let i = 0; i < jumps; i++) {
          bot.setControlState('jump', true);
          await new Promise(resolve => setTimeout(resolve, 100));
          bot.setControlState('jump', false);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        // Spaced out jumps
        console.log(`[AI] Bouncing around playfully`);
        for (let i = 0; i < jumps; i++) {
          bot.setControlState('jump', true);
          await new Promise(resolve => setTimeout(resolve, 100));
          bot.setControlState('jump', false);
          await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
        }
      }
      
    } else if (actionType < 0.65) {
      // Spin around
      console.log('[AI] Spinning around');
      if (bot && bot.entity) {
        const startYaw = bot.entity.yaw;
        const spinSteps = 8;
        for (let i = 0; i < spinSteps; i++) {
          await bot.look(startYaw + (Math.PI * 2 * i / spinSteps), 0, true);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
    } else if (actionType < 0.80) {
      // Look up and down (like observing)
      console.log('[AI] Observing surroundings');
      if (bot && bot.entity) {
        await bot.look(bot.entity.yaw, -Math.PI / 4, true); // Look up
        await new Promise(resolve => setTimeout(resolve, 500));
        await bot.look(bot.entity.yaw, Math.PI / 6, true); // Look down
        await new Promise(resolve => setTimeout(resolve, 500));
        await bot.look(bot.entity.yaw, 0, true); // Look straight
      }
      
    } else {
      // Crouch-jump combo
      console.log('[AI] Performing crouch-jump');
      bot.setControlState('sneak', true);
      await new Promise(resolve => setTimeout(resolve, 300));
      bot.setControlState('jump', true);
      await new Promise(resolve => setTimeout(resolve, 100));
      bot.setControlState('jump', false);
      await new Promise(resolve => setTimeout(resolve, 200));
      bot.setControlState('sneak', false);
    }
  } catch (error) {
    // Silently handle errors
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
  if (!block || !bot || !bot.pathfinder) return;
  
  console.log(`[AI] Interacting with ${block.name}`);
  isPerformingAction = true;
  isMoving = false;
  
  try {
    bot.pathfinder.setGoal(null);
    
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
    console.log('[AI] Interaction failed:', error.message);
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
  if (!bot || !bot.pathfinder) return; // Safety check
  
  console.log(`[AI] Following ${player.username} for 30 seconds`);
  isFollowingPlayer = true;
  followingPlayer = player;
  isMoving = false;
  
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
        // Ignore pathfinder errors
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

// Enhanced hunger and eating management
const foodChestLocation = new Vec3(2319, 77, 2975);

// Find any edible food in inventory
function findFoodInInventory() {
  const items = bot.inventory.items();
  const foodItems = [
    'cooked_beef', 'beef', 'cooked_porkchop', 'porkchop',
    'cooked_chicken', 'chicken', 'cooked_mutton', 'mutton',
    'bread', 'baked_potato', 'potato', 'carrot', 'apple',
    'cooked_salmon', 'salmon', 'cooked_cod', 'cod', 'cookie',
    'melon_slice', 'sweet_berries', 'golden_apple', 'golden_carrot'
  ];
  
  // Prefer cooked food over raw
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
  
  const mood = getMoodProfile();
  const currentHunger = bot.food || 20;
  const hungerThreshold = mood.hungerThreshold;
  
  // Proactive eating - eat before getting too hungry based on mood
  if (currentHunger < hungerThreshold) {
    console.log(`[AI] Hunger at ${currentHunger}/20 (threshold: ${hungerThreshold}), time to eat`);
    isPerformingAction = true;
    
    try {
      let foodItem = findFoodInInventory();
      
      if (!foodItem) {
        console.log('[AI] No food in inventory, heading to food chest');
        isPerformingAction = false;
        await goToChestAndGetSteak();
        await new Promise(resolve => setTimeout(resolve, 1000));
        foodItem = findFoodInInventory();
        isPerformingAction = true;
      }
      
      if (foodItem) {
        console.log(`[AI] Found ${foodItem.name} in inventory, preparing to eat`);
        
        await bot.equip(foodItem, 'hand');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`[AI] Eating ${foodItem.name}... nom nom nom`);
        bot.activateItem();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const newHunger = bot.food || 20;
        console.log(`[AI] Finished eating! Hunger: ${currentHunger} -> ${newHunger}/20`);
        
        // Eat more if still hungry
        if (newHunger < hungerThreshold - 2) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await checkHungerAndEat();
        }
      } else {
        console.log('[AI] Still no food available after checking chest - will try again soon');
      }
    } catch (error) {
      console.log('[AI] Failed to eat:', error.message);
    } finally {
      isPerformingAction = false;
    }
  }
}

// Clear all AI intervals and timeouts
function clearAIIntervals() {
  aiIntervals.forEach(intervalId => clearInterval(intervalId));
  aiIntervals = [];
  aiStarted = false;
  
  if (speedChangeTimeout) {
    clearTimeout(speedChangeTimeout);
    speedChangeTimeout = null;
  }
  
  if (moodChangeTimeout) {
    clearTimeout(moodChangeTimeout);
    moodChangeTimeout = null;
  }
}

// Dynamic decision maker - constantly varying intervals
function createDynamicInterval(action, baseMin, baseMax, chanceFunc) {
  function scheduleNext() {
    if (!aiReady || !aiStarted) return;
    
    const mood = getMoodProfile();
    const shouldAct = chanceFunc ? shouldDoAction(chanceFunc(mood)) : true;
    
    if (shouldAct) {
      action();
    }
    
    // Highly variable timing - never the same twice
    const nextDelay = baseMin + Math.random() * (baseMax - baseMin);
    const timeoutId = setTimeout(scheduleNext, nextDelay);
    aiIntervals.push(timeoutId);
  }
  
  scheduleNext();
}

// Enhanced Main AI Loop with dynamic decision making
function startAI() {
  if (aiStarted) {
    console.log('[AI] AI loop already running, skipping duplicate start');
    return;
  }
  
  aiStarted = true;
  console.log('[AI] Starting enhanced AI decision system...');
  
  // Initialize mood system
  changeMood();
  randomSpeedChange();
  
  // Hunger check - most critical, check frequently (2-5 seconds)
  createDynamicInterval(() => {
    if (aiReady) checkHungerAndEat();
  }, 2000, 5000);
  
  // Environment interaction - varies by mood (5-15 seconds)
  createDynamicInterval(() => {
    if (aiReady && !isPerformingAction && !isFollowingPlayer) {
      const mood = getMoodProfile();
      if (shouldDoAction(mood.interactChance)) {
        checkEnvironment();
      }
    }
  }, 5000, 15000);
  
  // Player detection - varies by mood (3-10 seconds)
  createDynamicInterval(() => {
    if (aiReady && !isPerformingAction && !isFollowingPlayer) {
      const mood = getMoodProfile();
      if (shouldDoAction(mood.followChance)) {
        checkForPlayers();
      }
    }
  }, 3000, 10000);
  
  // Random movements - highly variable (4-20 seconds)
  createDynamicInterval(() => {
    if (aiReady && !isPerformingAction) {
      if (shouldDoAction(0.5)) {
        randomMovements();
      }
    }
  }, 4000, 20000);
  
  // Item holding - occasional and unpredictable (8-30 seconds)
  createDynamicInterval(() => {
    if (aiReady && !isPerformingAction && !isGettingFood) {
      if (shouldDoAction(0.4)) {
        randomlyHoldItem();
      }
    }
  }, 8000, 30000);
  
  // Wandering - most common activity (2-8 seconds)
  createDynamicInterval(() => {
    if (aiReady && !isMoving && !isPerformingAction && !isFollowingPlayer) {
      const mood = getMoodProfile();
      if (shouldDoAction(mood.exploreChance)) {
        startWandering();
      }
    }
  }, 2000, 8000);
  
  // Start initial wander
  setTimeout(() => {
    if (aiReady) startWandering();
  }, 2000);
  
  console.log('[AI] Enhanced AI system active - behavior patterns will vary dynamically');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Bot] Shutting down gracefully...');
  if (bot && typeof bot.quit === 'function') {
    try {
      bot.quit();
    } catch (e) {
      console.log('[Bot] Error during quit:', e.message);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot] Shutting down gracefully...');
  if (bot && typeof bot.quit === 'function') {
    try {
      bot.quit();
    } catch (e) {
      console.log('[Bot] Error during quit:', e.message);
    }
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
    reconnectAttempts = 0; // Reset reconnection counter on successful spawn
    isReconnecting = false; // Reset reconnection flag
    
    // Clear any pending reconnection timeouts
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
        console.log(`Connection: STABLE | Reconnect attempts: 0`);
        console.log("=".repeat(50));
        
        setTimeout(() => {
          aiReady = true;
          console.log("[AI] M3GAN is now active and ready for 24/7 operation\n");
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

  bot.on('end', function(reason) {
    console.log('[Bot] Disconnected from server. Reason:', reason || 'Unknown');
    connected = false;
    aiReady = false;
    isMoving = false;
    isPerformingAction = false;
    isFollowingPlayer = false;
    
    // Clear all AI intervals to prevent duplicates on reconnect
    clearAIIntervals();
    
    // Clear keep-alive interval
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    
    // Prevent duplicate reconnection attempts
    if (isReconnecting) {
      console.log('[Bot] Reconnection already in progress, skipping...');
      return;
    }
    
    isReconnecting = true;
    
    // Auto-reconnect with exponential backoff
    reconnectAttempts++;
    const delay = Math.min(initialReconnectDelay * Math.pow(2, Math.min(reconnectAttempts - 1, 4)), maxReconnectDelay);
    console.log(`[Bot] Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts})...`);
    
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    
    reconnectTimeout = setTimeout(attemptReconnection, delay);
    
    function attemptReconnection() {
      try {
        console.log('[Bot] Attempting to reconnect...');
        const newBot = createBot();
        if (newBot) {
          bot = newBot;
          setupEventHandlers();
          isReconnecting = false;
        } else {
          console.log('[Bot] Failed to create bot, will retry in 5 seconds...');
          isReconnecting = false;
          reconnectTimeout = setTimeout(attemptReconnection, 5000);
        }
      } catch (error) {
        console.error('[Bot] Reconnection error:', error.message);
        isReconnecting = false;
        console.log('[Bot] Will retry in 5 seconds...');
        reconnectTimeout = setTimeout(attemptReconnection, 5000);
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
    
    // Handle connection errors (ECONNRESET, ECONNREFUSED, etc.)
    const connectionErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
    if (connectionErrors.includes(err.code)) {
      console.log(`[Bot] Connection error detected (${err.code}). Server may be offline or unreachable.`);
      
      // Don't manually handle disconnection - let the 'end' event handle it
      // Just update the state
      if (connected) {
        connected = false;
        aiReady = false;
        isMoving = false;
        isPerformingAction = false;
        isFollowingPlayer = false;
        clearAIIntervals();
      }
      
      // The 'end' event will trigger automatically and handle reconnection
      console.log(`[Bot] Waiting for 'end' event to trigger reconnection...`);
    }
  });
  
  // Add health check
  bot.on('health', function() {
    // Bot is alive and responding
  });
  
  // Monitor connection state
  bot.on('disconnect', function(packet) {
    console.log('[Bot] Received disconnect packet:', packet.reason);
  });
}
