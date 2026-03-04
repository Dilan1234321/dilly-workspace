# Discord setup for weather notifications

## 1. Create a webhook in Discord

1. Open your **Discord server** (you need "Manage Webhooks" permission).
2. Go to **Server settings** (click the server name → Server Settings).
3. In the left sidebar, open **Integrations** → **Webhooks**.
4. Click **New Webhook**.
5. Give it a name (e.g. "Weather Bot") and choose the **channel** where you want weather messages to appear.
6. Click **Copy Webhook URL**. It looks like:
   ```
   https://discord.com/api/webhooks/1234567890/abcdef...
   ```
   **Keep this secret** — anyone with the URL can post to that channel.

## 2. Give the bot the webhook URL

**Option A: Environment variable (good for cron / one-off runs)**

```bash
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN"
```

Then run:

```bash
cd projects/weather_edge_bot
PYTHONPATH=. python -m weather_edge_bot notify
```

**Option B: `.env` file (easy and persistent)**

1. In the project folder, create a file named `.env` (it’s in `.gitignore`, so it won’t be committed):

   ```bash
   cd projects/weather_edge_bot
   echo 'DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN' > .env
   ```

2. Replace `YOUR_ID/YOUR_TOKEN` with the real webhook URL you copied.

3. The bot **auto-loads `.env`** when you run it, so you don’t need to export anything. Just run:
   ```bash
   PYTHONPATH=. python -m weather_edge_bot notify
   ```

## 3. Test it

```bash
cd projects/weather_edge_bot
# If you used export:
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
PYTHONPATH=. python -m weather_edge_bot notify
```

You should see the weather summary in the terminal and a matching message in your Discord channel.

## 4. Run it on a schedule (optional)

To get weather at a fixed time every day (e.g. 8:00 AM ET):

```bash
# Edit crontab
crontab -e

# Add a line (adjust path and time; 8:00 AM ET = 13:00 UTC in winter)
0 13 * * * cd /Users/dilankochhar/.openclaw/workspace/projects/weather_edge_bot && . .venv/bin/activate && export DISCORD_WEBHOOK_URL="YOUR_URL" && PYTHONPATH=. python -m weather_edge_bot notify
```

Or run the command from a script that loads your `.env`.

---

**Troubleshooting**

- **No message in Discord**: Check that `DISCORD_WEBHOOK_URL` is set (`echo $DISCORD_WEBHOOK_URL`) and that the URL is the full webhook URL (starts with `https://discord.com/api/webhooks/`).
- **"Discord send failed"**: Wrong URL, deleted webhook, or Discord/network issue. Try posting with curl:  
  `curl -X POST -H "Content-Type: application/json" -d '{"content":"test"}' "YOUR_WEBHOOK_URL"`
