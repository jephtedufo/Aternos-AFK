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
      console.log("Bot will WALK (not run) and visit chest periodically");
      
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
  
  console.log(`Walking to: X=${targetPos.x.toFixed(2)}, Z=${targetPos.z.toFixed(2)}`);
  
  // Configure movement settings
  const defaultMove = new Movements(bot);
  defaultMove.canDig = false; // Don't break blocks
  defaultMove.allow1by1towers = false; // Don't build towers
  defaultMove.scafoldingBlocks = []; // Don't place blocks
  defaultMove.sprint = false; // WALK, don't run!
  
  bot.pathfinder.setMovements(defaultMove);
  bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2));
  
  isMoving = true;
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
});

bot.on('kicked', function(reason) {
  console.log('Bot was kicked:', reason);
  connected = false;
  isMoving = false;
  isDoingChestTask = false;
});

bot.on('error', function(err) {
  console.log('Bot error:', err.message);
});
