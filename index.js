const mineflayer = require('mineflayer')
const fs = require('fs');
const { keep_alive } = require("./keep_alive");
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');

keep_alive();

let rawdata = fs.readFileSync('config.json');
let data = JSON.parse(rawdata);

var host = data["ip"];
var username = data["name"]
var bot = mineflayer.createBot({
  host: host,
  username: username
});

// Load pathfinder plugin for intelligent navigation
bot.loadPlugin(pathfinder);

var spawnPoint = null;
var connected = false;
var isMoving = false;
var maxDistance = 30; // Maximum distance to wander from spawn
var isDoingChestTask = false;
var shouldSprint = false; // Track if bot should be sprinting
var wallCheckInterval = null; // Interval for checking nearby walls

// AI Behavior System
var behaviorInterval = null;
var currentMood = 'neutral'; // curious, cautious, energetic, calm, neutral
var isPerformingBehavior = false;
var lastBehaviorTime = Date.now();
var decisionTimer = null;

// Chest configuration
const chestPosition = new Vec3(2319, 77, 2975);
const standingPosition = new Vec3(2319, 77, 2976);

bot.on('login', function(){
  console.log("Logged In")
});

bot.on('spawn', function() {
  console.log("Bot spawned!");
  connected = true;
  
  setTimeout(() => {
    if (bot.entity && bot.entity.position) {
      spawnPoint = bot.entity.position.clone();
      console.log(`Spawn point: X=${spawnPoint.x.toFixed(2)}, Y=${spawnPoint.y.toFixed(2)}, Z=${spawnPoint.z.toFixed(2)}`);
      console.log("Starting intelligent exploration with obstacle avoidance...");
      console.log("Bot will walk and occasionally run, staying away from walls");
      console.log("=".repeat(50));
      
      // Start AI behavior system
      startAIBehaviors();
      
      // Start wandering
      startWandering();
      
      // Schedule random chest visits
      scheduleNextChestVisit();
    }
  }, 1000);
});

function scheduleNextChestVisit() {
  // Random interval between 30 seconds to 2 minutes
  const minInterval = 30000; // 30 seconds
  const maxInterval = 120000; // 2 minutes
  const randomInterval = minInterval + Math.random() * (maxInterval - minInterval);
  
  console.log(`Next chest visit scheduled in ${Math.round(randomInterval/1000)} seconds`);
  
  setTimeout(() => {
    if (connected) {
      visitChest();
    }
  }, randomInterval);
}

async function visitChest() {
  if (isDoingChestTask || !connected) return;
  
  isDoingChestTask = true;
  isMoving = true;
  
  console.log("=== Time to visit the chest! Heading there now... ===");
  
  try {
    // Stop any ongoing pathfinding
    bot.pathfinder.setGoal(null);
    
    // Navigate to standing position in front of chest
    const defaultMove = new Movements(bot);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = false;
    defaultMove.scafoldingBlocks = [];
    defaultMove.sprint = false; // Don't sprint to chest either
    
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new goals.GoalBlock(standingPosition.x, standingPosition.y, standingPosition.z));
    
    // Wait for bot to reach the chest
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout reaching chest'));
      }, 30000); // 30 second timeout
      
      const reachedHandler = () => {
        clearTimeout(timeout);
        bot.removeListener('goal_reached', reachedHandler);
        bot.removeListener('path_update', pathHandler);
        resolve();
      };
      
      const pathHandler = (results) => {
        if (results.status === 'noPath') {
          clearTimeout(timeout);
          bot.removeListener('goal_reached', reachedHandler);
          bot.removeListener('path_update', pathHandler);
          reject(new Error('No path to chest'));
        }
      };
      
      bot.once('goal_reached', reachedHandler);
      bot.on('path_update', pathHandler);
    });
    
    console.log("Reached chest position!");
    
    // Stop pathfinding
    bot.pathfinder.setGoal(null);
    
    // Wait a moment to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Find the chest block
    const chest = bot.blockAt(chestPosition);
    
    if (!chest) {
      console.log("Could not find chest at specified location!");
      throw new Error('Chest not found');
    }
    
    console.log(`Found chest: ${chest.name} at position ${chest.position}`);
    
    // Look at the chest before opening
    await bot.lookAt(chest.position.offset(0.5, 0.5, 0.5));
    console.log("Looking at chest...");
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Right-click to open the chest
    console.log("Right-clicking chest to open it...");
    
    try {
      // Use openContainer which handles the interaction properly
      const chestWindow = await bot.openContainer(chest);
      console.log("Chest opened successfully!");
      
      if (!chestWindow) {
        throw new Error('Chest window is null');
      }
      
      // Wait a moment for inventory to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get first item from chest (slot 0)
      const containerItems = chestWindow.containerItems();
      const firstItem = containerItems[0];
      
      if (firstItem) {
        console.log(`Found item in chest: ${firstItem.name} x${firstItem.count}`);
        
        // Take the item
        await chestWindow.withdraw(firstItem.type, null, 1);
        console.log("Took 1 item from chest!");
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Close chest (simulates pressing ESC)
        console.log("Closing chest (ESC)...");
        bot.closeWindow(chestWindow);
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try to eat/consume the item
        console.log("Attempting to eat the item...");
        const itemInInventory = bot.inventory.items().find(item => item.type === firstItem.type);
        
        if (itemInInventory) {
          // Equip the item in hand
          await bot.equip(itemInInventory, 'hand');
          console.log("Item equipped in hand");
          
          // Wait a moment
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Consume/eat it
          await bot.consume();
          console.log("Successfully consumed the item!");
          
          // Wait for eating animation
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        console.log("Chest is empty! No items to take.");
        // Close chest (simulates pressing ESC)
        console.log("Closing chest (ESC)...");
        bot.closeWindow(chestWindow);
      }
      
      console.log("=== Chest task complete! Resuming wandering... ===");
      
    } catch (openError) {
      console.log("Failed to open chest:", openError.message);
      throw openError;
    }
    
  } catch (error) {
    console.log("Error during chest visit:", error.message);
    
    // Make sure chest is closed
    if (bot.currentWindow) {
      bot.closeWindow(bot.currentWindow);
    }
  } finally {
    isDoingChestTask = false;
    isMoving = false;
    
    // Schedule next chest visit
    scheduleNextChestVisit();
    
    // Resume wandering after a moment
    setTimeout(() => {
      if (connected && !isMoving) {
        startWandering();
      }
    }, 2000);
  }
}

// ==================== AI BEHAVIOR SYSTEM ====================

// Randomly change mood/personality state
function changeMood() {
  const moods = ['curious', 'cautious', 'energetic', 'calm', 'neutral'];
  const oldMood = currentMood;
  currentMood = moods[Math.floor(Math.random() * moods.length)];
  
  if (oldMood !== currentMood) {
    console.log(`[AI] M3GAN's mood changed: ${oldMood} → ${currentMood}`);
  }
}

// Look around naturally like a human
async function lookAround() {
  if (!bot.entity || isDoingChestTask) return;
  
  console.log('[AI] Looking around...');
  
  const lookDirections = [
    { pitch: 0, yaw: Math.random() * Math.PI * 2 }, // Horizontal look
    { pitch: -0.3, yaw: Math.random() * Math.PI * 2 }, // Look up slightly
    { pitch: 0.3, yaw: Math.random() * Math.PI * 2 }, // Look down slightly
  ];
  
  for (let i = 0; i < 3; i++) {
    const dir = lookDirections[Math.floor(Math.random() * lookDirections.length)];
    await bot.look(dir.yaw, dir.pitch);
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
  }
}

// Stop and idle for a moment
async function pauseAndThink() {
  if (isDoingChestTask) return;
  
  console.log('[AI] Pausing to think...');
  isPerformingBehavior = true;
  
  // Stop current movement
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  
  // Stand still and look around
  await lookAround();
  
  // Random pause duration (2-5 seconds)
  const pauseDuration = 2000 + Math.random() * 3000;
  await new Promise(resolve => setTimeout(resolve, pauseDuration));
  
  isPerformingBehavior = false;
  console.log('[AI] Resuming activity');
}

// Random jumping behavior
async function doRandomJump() {
  if (!bot.entity || isDoingChestTask) return;
  
  const jumpType = Math.random();
  
  if (jumpType < 0.5) {
    // Single jump
    console.log('[AI] Jumping once');
    bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 100));
    bot.setControlState('jump', false);
  } else {
    // Double jump (excited behavior)
    console.log('[AI] Double jump!');
    for (let i = 0; i < 2; i++) {
      bot.setControlState('jump', true);
      await new Promise(resolve => setTimeout(resolve, 100));
      bot.setControlState('jump', false);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
}

// Crouch behavior (sneaking)
async function crouchBehavior() {
  if (isDoingChestTask) return;
  
  console.log('[AI] Crouching...');
  bot.setControlState('sneak', true);
  
  // Crouch for 2-4 seconds
  const crouchDuration = 2000 + Math.random() * 2000;
  await new Promise(resolve => setTimeout(resolve, crouchDuration));
  
  bot.setControlState('sneak', false);
  console.log('[AI] Standing back up');
}

// Investigate nearby interesting blocks
async function investigateEnvironment() {
  if (!bot.entity || isDoingChestTask) return;
  
  console.log('[AI] Investigating environment...');
  isPerformingBehavior = true;
  
  const pos = bot.entity.position;
  const radius = 5;
  
  // Find interesting blocks nearby
  const interestingBlocks = ['chest', 'crafting_table', 'furnace', 'diamond_ore', 'gold_ore', 'iron_ore'];
  
  for (let x = -radius; x <= radius; x++) {
    for (let y = -2; y <= 2; y++) {
      for (let z = -radius; z <= radius; z++) {
        const block = bot.blockAt(pos.offset(x, y, z));
        if (block && interestingBlocks.includes(block.name)) {
          console.log(`[AI] Found interesting block: ${block.name}`);
          await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
          await new Promise(resolve => setTimeout(resolve, 1500));
          break;
        }
      }
    }
  }
  
  isPerformingBehavior = false;
}

// Check out nearby entities/players
async function observeNearbyEntities() {
  if (!bot.entity || isDoingChestTask) return;
  
  const entities = Object.values(bot.entities).filter(e => 
    e !== bot.entity && 
    e.position && 
    e.position.distanceTo(bot.entity.position) < 15
  );
  
  if (entities.length > 0) {
    const entity = entities[Math.floor(Math.random() * entities.length)];
    console.log(`[AI] Observing nearby entity: ${entity.name || entity.type}`);
    
    isPerformingBehavior = true;
    
    // Look at the entity
    await bot.lookAt(entity.position.offset(0, entity.height || 1, 0));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Maybe approach it
    if (Math.random() < 0.3 && currentMood === 'curious') {
      console.log('[AI] Approaching entity...');
      const movements = new Movements(bot);
      movements.canDig = false;
      movements.sprint = false;
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 3));
      await new Promise(resolve => setTimeout(resolve, 3000));
      bot.pathfinder.setGoal(null);
    }
    
    isPerformingBehavior = false;
  }
}

// Randomly change direction mid-path (indecisive behavior)
function changeMyMind() {
  if (isDoingChestTask || !isMoving) return;
  
  console.log('[AI] Changed my mind! Picking new destination');
  bot.pathfinder.setGoal(null);
  isMoving = false;
  
  // Pick new destination after brief pause
  setTimeout(() => {
    if (!isDoingChestTask && !isPerformingBehavior) {
      startWandering();
    }
  }, 1000 + Math.random() * 2000);
}

// Main AI behavior decision maker
async function makeAIDecision() {
  if (!connected || isDoingChestTask || isPerformingBehavior) return;
  
  // Randomly change mood occasionally
  if (Math.random() < 0.05) {
    changeMood();
  }
  
  const behaviors = [];
  
  // Build weighted behavior list based on mood
  switch(currentMood) {
    case 'curious':
      behaviors.push(
        { action: investigateEnvironment, weight: 25 },
        { action: observeNearbyEntities, weight: 25 },
        { action: lookAround, weight: 20 },
        { action: doRandomJump, weight: 15 },
        { action: changeMyMind, weight: 15 }
      );
      break;
      
    case 'cautious':
      behaviors.push(
        { action: lookAround, weight: 30 },
        { action: pauseAndThink, weight: 25 },
        { action: crouchBehavior, weight: 20 },
        { action: observeNearbyEntities, weight: 15 },
        { action: changeMyMind, weight: 10 }
      );
      break;
      
    case 'energetic':
      behaviors.push(
        { action: doRandomJump, weight: 30 },
        { action: changeMyMind, weight: 25 },
        { action: () => { shouldSprint = true; }, weight: 20 },
        { action: lookAround, weight: 15 },
        { action: observeNearbyEntities, weight: 10 }
      );
      break;
      
    case 'calm':
      behaviors.push(
        { action: pauseAndThink, weight: 30 },
        { action: lookAround, weight: 25 },
        { action: investigateEnvironment, weight: 20 },
        { action: crouchBehavior, weight: 15 },
        { action: observeNearbyEntities, weight: 10 }
      );
      break;
      
    default: // neutral
      behaviors.push(
        { action: lookAround, weight: 20 },
        { action: pauseAndThink, weight: 15 },
        { action: doRandomJump, weight: 15 },
        { action: investigateEnvironment, weight: 15 },
        { action: observeNearbyEntities, weight: 15 },
        { action: changeMyMind, weight: 10 },
        { action: crouchBehavior, weight: 10 }
      );
  }
  
  // Select behavior based on weights
  const totalWeight = behaviors.reduce((sum, b) => sum + b.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const behavior of behaviors) {
    random -= behavior.weight;
    if (random <= 0) {
      try {
        await behavior.action();
      } catch (error) {
        console.log('[AI] Behavior error:', error.message);
      }
      break;
    }
  }
  
  lastBehaviorTime = Date.now();
}

// Start AI behavior system
function startAIBehaviors() {
  console.log('[AI] M3GAN AI system activated');
  
  // Random behaviors every 8-20 seconds
  behaviorInterval = setInterval(() => {
    if (connected && !isDoingChestTask && !isPerformingBehavior) {
      // Random chance to perform a behavior (40% each check)
      if (Math.random() < 0.4) {
        makeAIDecision();
      }
    }
  }, 8000 + Math.random() * 12000);
  
  // Mood changes every 30-60 seconds
  setInterval(() => {
    if (connected) {
      changeMood();
    }
  }, 30000 + Math.random() * 30000);
}

// Check for nearby walls and obstacles
function checkNearbyWalls() {
  if (!bot.entity || !bot.entity.position) return false;
  
  const pos = bot.entity.position;
  const minDistance = 1.5; // Stay at least 1.5 blocks away from walls
  
  // Check in 8 directions around the bot
  const directions = [
    new Vec3(1, 0, 0),   // East
    new Vec3(-1, 0, 0),  // West
    new Vec3(0, 0, 1),   // South
    new Vec3(0, 0, -1),  // North
    new Vec3(1, 0, 1),   // Southeast
    new Vec3(-1, 0, 1),  // Southwest
    new Vec3(1, 0, -1),  // Northeast
    new Vec3(-1, 0, -1)  // Northwest
  ];
  
  for (const dir of directions) {
    const checkPos = pos.offset(dir.x * minDistance, 0, dir.z * minDistance);
    const block = bot.blockAt(checkPos);
    
    // If there's a solid block nearby, move away from it
    if (block && block.boundingBox === 'block') {
      // Move in opposite direction
      const awayDir = dir.scaled(-1);
      const newGoal = pos.offset(awayDir.x * 2, 0, awayDir.z * 2);
      
      console.log(`Wall detected! Moving away from obstacle at ${checkPos}`);
      
      const movements = new Movements(bot);
      movements.canDig = false;
      movements.allow1by1towers = false;
      movements.scafoldingBlocks = [];
      movements.sprint = shouldSprint;
      
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalNear(newGoal.x, newGoal.y, newGoal.z, 1));
      
      return true;
    }
  }
  
  return false;
}

function getRandomWalkablePosition() {
  if (!spawnPoint) return null;
  
  // Generate random position within range of spawn
  const randomX = spawnPoint.x + (Math.random() - 0.5) * maxDistance * 2;
  const randomZ = spawnPoint.z + (Math.random() - 0.5) * maxDistance * 2;
  const randomY = spawnPoint.y;
  
  return new Vec3(randomX, randomY, randomZ);
}

function startWandering() {
  if (!connected || isMoving || isDoingChestTask) return;
  
  const targetPos = getRandomWalkablePosition();
  if (!targetPos) return;
  
  // Randomly decide if bot should sprint (30% chance)
  shouldSprint = Math.random() < 0.3;
  
  const movementType = shouldSprint ? "Running" : "Walking";
  console.log(`${movementType} to: X=${targetPos.x.toFixed(2)}, Z=${targetPos.z.toFixed(2)}`);
  
  // Configure movement settings
  const defaultMove = new Movements(bot);
  defaultMove.canDig = false; // Don't break blocks
  defaultMove.allow1by1towers = false; // Don't build towers
  defaultMove.scafoldingBlocks = []; // Don't place blocks
  defaultMove.sprint = shouldSprint; // Sprint randomly
  
  bot.pathfinder.setMovements(defaultMove);
  bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2));
  
  isMoving = true;
  
  // Start checking for walls while moving
  if (wallCheckInterval) {
    clearInterval(wallCheckInterval);
  }
  
  wallCheckInterval = setInterval(() => {
    if (isMoving && !isDoingChestTask) {
      checkNearbyWalls();
    }
  }, 1000); // Check every second
}

// When bot reaches destination, pick a new one
bot.on('goal_reached', function() {
  if (isDoingChestTask) return; // Don't interfere with chest task
  
  console.log("Destination reached! Choosing new location...");
  isMoving = false;
  
  // Wait a bit before choosing next destination
  setTimeout(() => {
    if (!isDoingChestTask) {
      startWandering();
    }
  }, 1000);
});

// If pathfinding fails, try a new destination
bot.on('path_update', function(results) {
  if (isDoingChestTask) return; // Don't interfere with chest task
  
  if (results.status === 'noPath') {
    console.log("No path found, trying new destination...");
    isMoving = false;
    setTimeout(() => {
      if (!isDoingChestTask) {
        startWandering();
      }
    }, 2000);
  }
});

// Also periodically check if stuck and choose new destination
setInterval(() => {
  if (connected && !isMoving && !isDoingChestTask) {
    startWandering();
  }
}, 5000);

// Random jumping while moving for realism
setInterval(() => {
  if (connected && isMoving && !isDoingChestTask && Math.random() > 0.7) {
    bot.setControlState('jump', true);
    setTimeout(() => {
      bot.setControlState('jump', false);
    }, 100);
  }
}, 3000);

bot.on('end', function() {
  console.log('Bot disconnected');
  connected = false;
  isMoving = false;
  isDoingChestTask = false;
  shouldSprint = false;
  isPerformingBehavior = false;
  
  // Clean up all intervals
  if (wallCheckInterval) {
    clearInterval(wallCheckInterval);
    wallCheckInterval = null;
  }
  if (behaviorInterval) {
    clearInterval(behaviorInterval);
    behaviorInterval = null;
  }
  if (decisionTimer) {
    clearTimeout(decisionTimer);
    decisionTimer = null;
  }
});

bot.on('kicked', function(reason) {
  console.log('Bot was kicked:', reason);
  connected = false;
  isMoving = false;
  isDoingChestTask = false;
  shouldSprint = false;
  isPerformingBehavior = false;
  
  // Clean up all intervals
  if (wallCheckInterval) {
    clearInterval(wallCheckInterval);
    wallCheckInterval = null;
  }
  if (behaviorInterval) {
    clearInterval(behaviorInterval);
    behaviorInterval = null;
  }
  if (decisionTimer) {
    clearTimeout(decisionTimer);
    decisionTimer = null;
  }
});

bot.on('error', function(err) {
  console.log('Bot error:', err.message);
});
