import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { ensureUser, rotateToken } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('bind')
  .setDescription('綁定 CHUNITHM-NET 帳號 — 拿到專屬書籤')
  .addBooleanOption((o) =>
    o.setName('rotate')
      .setDescription('重新產生新 token（舊書籤會失效）')
      .setRequired(false),
  );

function buildBookmarkletPayload(token, base, syncBase) {
  const url = `${base}/plate-generator.js`;
  // window globals set before loading the script — read by plate-generator.js
  return `javascript:(function(d,s){window.__chuniSyncToken=${JSON.stringify(token)};window.__chuniSyncBase=${JSON.stringify(syncBase)};s=d.createElement('script');s.src=${JSON.stringify(url)}+'?t='+Math.floor(Date.now()/60000);d.body.append(s);})(document);`;
}

export async function execute(interaction) {
  const wantRotate = interaction.options.getBoolean('rotate') || false;
  const discordId = interaction.user.id;
  const user = ensureUser(discordId);
  const token = wantRotate ? rotateToken(discordId) : user.sync_token;

  const base = process.env.PUBLIC_BASE_URL || 'https://shuili1013.github.io/chuni-bot';
  const syncBase = process.env.SYNC_API_BASE || '';
  const bm = buildBookmarkletPayload(token, base, syncBase);
  const bindUrl =
    `${base}/bind/?u=${encodeURIComponent(token)}` +
    (syncBase ? `&b=${encodeURIComponent(syncBase)}` : '');

  const embed = new EmbedBuilder()
    .setColor(0xd4537e)
    .setTitle('CHUNI Bot 綁定')
    .setDescription(
      [
        wantRotate ? '🔄 已產生**新** token（舊書籤失效）。' : '✅ 你的綁定已就緒。',
        '',
        '**步驟**',
        `1. 開 ${bindUrl}`,
        '2. 把頁面上的「🎵 CHUNI Sync」按鈕**拖到書籤列**',
        '3. 登入 https://chunithm-net-eng.com/ 後，**點書籤**自動同步',
        '4. 同步完成後在這裡用 `/rs` 看歷史成績',
        '',
        '⚠️ 不要把 token 給別人。對方拿到就能假冒你 sync。',
      ].join('\n'),
    )
    .addFields({
      name: '若無法拖曳，手動複製這段程式碼到書籤的 URL 欄位：',
      value: '```' + bm.slice(0, 1000) + '```',
    })
    .setFooter({ text: '/bind rotate:true 可作廢舊 token' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
