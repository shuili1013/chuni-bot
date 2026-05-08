import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { deleteAccount, stmts } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('unbind')
  .setDescription('解除綁定並刪除你的所有資料（不可復原）');

export async function execute(interaction) {
  const user = stmts.getUserByDiscord.get(interaction.user.id);
  if (!user) {
    return interaction.reply({ content: '尚未綁定。', flags: MessageFlags.Ephemeral });
  }
  deleteAccount(interaction.user.id);
  await interaction.reply({
    content: '✅ 已刪除你的綁定 token、玩家資料與所有歷史紀錄。',
    flags: MessageFlags.Ephemeral,
  });
}
