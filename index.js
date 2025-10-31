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

bot.loadPlugin(pathfinder);

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

bot.on('login', function(){
  console.log("Logged In")
});

bot.on('spawn', function() {
  console.log("Bot spawned!");
  connected = true;
  aiReady = false;
  
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

async function followPlayer(player) {
  if (!player || !player.position) return;
  
  console.log(`[AI] Following ${player.username}`);
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
    if (Math.random() < 0.4) {
      stopFollowing();
    }
  }, 8000 + Math.random() * 7000);
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
    const player = players[Math.floor(Math.random() * players.length)];
    await followPlayer(player);
  }
}

// Main AI Loop
function startAI() {
  randomSpeedChange();
  
  // Environment check every 8-12 seconds
  setInterval(() => {
    if (aiReady && Math.random() < 0.2) {
      checkEnvironment();
    }
  }, 8000 + Math.random() * 4000);
  
  // Player check every 5-8 seconds
  setInterval(() => {
    if (aiReady && Math.random() < 0.4) {
      checkForPlayers();
    }
  }, 5000 + Math.random() * 3000);
  
  // Wander loop every 3-6 seconds
  setInterval(() => {
    if (aiReady && !isMoving && !isPerformingAction && !isFollowingPlayer) {
      startWandering();
    }
  }, 3000 + Math.random() * 3000);
  
  setTimeout(() => startWandering(), 2000);
}

// Event Handlers
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
  console.log('Disconnected');
  connected = false;
  aiReady = false;
  isMoving = false;
  isPerformingAction = false;
  isFollowingPlayer = false;
});

bot.on('kicked', function(reason) {
  console.log('Kicked:', reason);
  connected = false;
  aiReady = false;
});

bot.on('error', function(err) {
  console.log('Error:', err.message);
});
