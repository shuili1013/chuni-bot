import 'dotenv/config';
import express from 'express';
import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import { syncRouter } from './sync.js';
import * as bind from './commands/bind.js';
import * as rs from './commands/rs.js';
import * as profile from './commands/profile.js';
import * as unbind from './commands/unbind.js';

// ---------- Express ----------
const app = express();
app.use(syncRouter);
app.get('/', (req, res) => res.json({ name: 'chuni-bot', ok: true }));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, () => console.log(`[http] listening on :${PORT}`));

// ---------- Discord ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
for (const c of [bind, rs, profile, unbind]) {
  client.commands.set(c.data.name, c);
}

client.once(Events.ClientReady, (c) => {
  console.log(`[discord] logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'rs:pick') {
        await rs.handleSelect(interaction);
        return;
      }
    }
  } catch (e) {
    console.error('interaction error', e);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: '發生錯誤：' + (e.message || e), ephemeral: true });
      } catch {
        // ignore
      }
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[discord] DISCORD_TOKEN missing — bot will not start');
} else {
  client.login(token);
}
