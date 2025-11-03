# Afk bot for aternos
Hi, this is a aternos bot which stays afk in your minecraft server.
A full setup guide is a available at: https://docs.dornox.live so kindly refer to this as the setup below doesn't include hosting.
### **Setup:**  
First of all you need to change the ip in [config file](https://github.com/krushna06/afk-bot-for-aternos/blob/main/config.json).
**Don't change the port**, you may change the rest of the stuff
```
{
        "ip":"yourip.aternos.me",
        "port": "25565",
        "name": "afk bot",
        "version": "1.21.10"
}

```
Then you need to clone this bot to [Replit](https://replit.com/~) <br>
Then in console type ```npm install``` after doing this in console type ```node index.js``` <br>
If everything goes correct, this is what you should see in the console


![image](https://user-images.githubusercontent.com/69315835/128631156-f5e257dd-4748-477c-87f1-d627c853590f.png)

### **Important note:**
The bot is compatible with Minecraft Java Edition **1.21.x** servers (including 1.21.10).
- Using the latest mineflayer from GitHub for best compatibility with newer versions
- The bot is configured to connect to version 1.21.10 servers
- If you need to connect to a different version, modify the `version` field in `config.json`
  - Set to `"1.21.10"` for Minecraft 1.21.10 servers
  - Set to `"1.21"` for Minecraft 1.21.x servers
  - Set to specific version like `"1.20"`, `"1.19"`, etc. for older servers
  - Set to `false` for auto-detection (may not work with newest versions)

> Others:
- If your server has login plugins, kindly whitelist the bot from that.
- If your server has antibot/ddos protection, kindly whitelist the bot from that.

### **Extra help**
If you are facing any issue then you can join this discord server: https://discord.gg/7AYYyjZ4B8
