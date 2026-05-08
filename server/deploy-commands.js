import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import * as bind from './src/commands/bind.js';
import * as rs from './src/commands/rs.js';
import * as profile from './src/commands/profile.js';
import * as unbind from './src/commands/unbind.js';

const commands = [bind, rs, profile, unbind].map((c) => c.data.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID; // optional: register to a single guild for instant updates

if (!token || !clientId) {
  console.error('Need DISCORD_TOKEN and DISCORD_CLIENT_ID in env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);
    const data = await rest.put(route, { body: commands });
    console.log(
      `Registered ${data.length} command(s) ${guildId ? `to guild ${guildId}` : 'globally'}`,
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
