import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { stmts } from '../db.js';
import { renderPlay } from '../render.js';

export const data = new SlashCommandBuilder()
  .setName('rs')
  .setDescription('挑一首最近打的歌，產出單首成績圖卡')
  .addIntegerOption((o) =>
    o.setName('limit')
      .setDescription('要列出的歷史筆數（預設 25，最多 25 — Discord 上限）')
      .setMinValue(1)
      .setMaxValue(25)
      .setRequired(false),
  );

export async function execute(interaction) {
  const limit = interaction.options.getInteger('limit') || 25;
  const user = stmts.getUserByDiscord.get(interaction.user.id);
  if (!user) {
    return interaction.reply({
      content: '你還沒綁定。先用 `/bind` 拿書籤、同步資料後再試。',
      flags: MessageFlags.Ephemeral,
    });
  }

  const plays = stmts.recentPlays.all(interaction.user.id, limit);
  if (!plays.length) {
    return interaction.reply({
      content: '查無資料。請先用書籤同步一次（在 chunithm-net-eng.com 已登入狀態下點書籤）。',
      flags: MessageFlags.Ephemeral,
    });
  }

  const options = plays.map((p) => {
    const diff = (p.difficulty || '').toUpperCase();
    const score = ((p.score || 0) / 10000).toFixed(4) + '%';
    let label = `[${diff}] ${p.title || '(unknown)'}`;
    if (label.length > 100) label = label.slice(0, 99) + '…';
    let desc = `${score} ${p.rank || ''} · ${p.played_at || ''}`;
    if (desc.length > 100) desc = desc.slice(0, 99) + '…';
    return {
      label,
      description: desc,
      value: p.play_hash,
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('rs:pick')
    .setPlaceholder('選一首歌生成成績圖卡')
    .addOptions(options);

  await interaction.reply({
    content: `找到 ${plays.length} 場最近紀錄，挑一首：`,
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

// select handler — exported and dispatched from index.js by customId prefix
export async function handleSelect(interaction) {
  await interaction.deferUpdate();
  const hash = interaction.values[0];
  const user = stmts.getUserByDiscord.get(interaction.user.id);
  if (!user) {
    return interaction.editReply({ content: '帳號狀態不對，請重新 `/bind`。', components: [] });
  }
  const play = stmts.getPlay.get(interaction.user.id, hash);
  if (!play) {
    return interaction.editReply({ content: '查無此紀錄。', components: [] });
  }

  try {
    const png = await renderPlay(play, user);
    const file = new AttachmentBuilder(png, { name: 'chuni-play.png' });
    const embed = new EmbedBuilder()
      .setColor(0xd4537e)
      .setTitle(play.title || '(unknown)')
      .setDescription(
        `**${(play.difficulty || '').toUpperCase()}** · ${
          ((play.score || 0) / 10000).toFixed(4)
        }% · ${play.rank || ''}`,
      )
      .setImage('attachment://chuni-play.png');

    await interaction.editReply({
      content: '',
      embeds: [embed],
      files: [file],
      components: [],
    });
  } catch (e) {
    console.error('render failed', e);
    await interaction.editReply({
      content: '渲染失敗：' + (e.message || e),
      components: [],
    });
  }
}
