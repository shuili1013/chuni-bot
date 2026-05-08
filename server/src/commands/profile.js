import {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { stmts } from '../db.js';
import { renderProfile } from '../render.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('顯示已同步的玩家資料');

export async function execute(interaction) {
  const user = stmts.getUserByDiscord.get(interaction.user.id);
  if (!user || !user.player_name) {
    return interaction.reply({
      content: '尚未同步玩家資料。先用 `/bind` 拿書籤同步一次。',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();
  try {
    const png = await renderProfile(user);
    const file = new AttachmentBuilder(png, { name: 'chuni-profile.png' });
    const lastSync = user.last_synced_at
      ? `<t:${Math.floor(user.last_synced_at / 1000)}:R>`
      : '從未同步';
    const embed = new EmbedBuilder()
      .setColor(0xd4537e)
      .setTitle(user.player_name)
      .setDescription(user.player_honor || '')
      .addFields(
        { name: 'Rating', value: user.player_rating || '0', inline: true },
        { name: 'Lv', value: user.player_lv || '0', inline: true },
        { name: 'Team', value: user.player_team || '—', inline: true },
        { name: '最後同步', value: lastSync, inline: false },
      )
      .setImage('attachment://chuni-profile.png');
    await interaction.editReply({ embeds: [embed], files: [file] });
  } catch (e) {
    console.error('profile render failed', e);
    await interaction.editReply({ content: '渲染失敗：' + (e.message || e) });
  }
}
