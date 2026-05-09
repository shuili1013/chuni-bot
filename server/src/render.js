import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import { THEME } from './theme.js';

const FONT_CANDIDATES = [
  // Linux (Docker / Fly.io with fonts-noto-cjk installed)
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  // macOS
  '/System/Library/Fonts/PingFang.ttc',
  '/Library/Fonts/Arial Unicode.ttf',
  // Windows
  'C:\\Windows\\Fonts\\msjhbd.ttc',
  'C:\\Windows\\Fonts\\msjh.ttc',
  'C:\\Windows\\Fonts\\meiryob.ttc',
  'C:\\Windows\\Fonts\\meiryo.ttc',
  'C:\\Windows\\Fonts\\YuGothB.ttc',
  'C:\\Windows\\Fonts\\YuGothM.ttc',
  'C:\\Windows\\Fonts\\arial.ttf',
];
let fontFamily = 'sans-serif';
for (const p of FONT_CANDIDATES) {
  if (fs.existsSync(p)) {
    try {
      GlobalFonts.registerFromPath(p, 'PlateSans');
      fontFamily = 'PlateSans';
      console.log('[render] using font:', p);
      break;
    } catch (e) {
      console.warn('[render] font register failed for', p, e.message);
    }
  }
}
if (fontFamily === 'sans-serif') {
  console.warn('[render] NO CJK FONT FOUND — text will likely render as boxes');
}

const W = 1056;
const H = 594;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillTextSafe(ctx, text, x, y, maxWidth) {
  if (text == null) return;
  const t = String(text);
  if (maxWidth) ctx.fillText(t, x, y, maxWidth);
  else ctx.fillText(t, x, y);
}

async function tryLoadImage(url) {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch (e) {
    return null;
  }
}

function parseLayers(json) {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function drawAvatarLayers(ctx, layers, x, y, size) {
  if (!layers || !layers.length) return false;
  const imgs = await Promise.all(layers.map((u) => tryLoadImage(u)));
  let drew = false;
  for (const img of imgs) {
    if (img) {
      ctx.drawImage(img, x, y, size, size);
      drew = true;
    }
  }
  return drew;
}

async function drawPlayerBanner(ctx, player, x, y, w, h) {
  // backdrop
  ctx.fillStyle = '#fafafa';
  roundedRect(ctx, x, y, w, h, 12);
  ctx.fill();

  const PADX = 14;
  const ICON = h - 16;
  let cx = x + PADX;

  // composed avatar (multi-layer)
  const layers = parseLayers(player.player_avatar_layers);
  let drewAvatar = false;
  if (layers.length) {
    drewAvatar = await drawAvatarLayers(ctx, layers, cx, y + 8, ICON);
  }
  if (!drewAvatar) {
    // fallback gray box
    ctx.fillStyle = '#eee';
    roundedRect(ctx, cx, y + 8, ICON, ICON, 8);
    ctx.fill();
  }
  cx += ICON + 12;

  // chara icon (smaller)
  const CHARA = ICON - 12;
  const chara = await tryLoadImage(player.player_avatar);
  ctx.fillStyle = '#eee';
  roundedRect(ctx, cx, y + 14, CHARA, CHARA, 8);
  ctx.fill();
  if (chara) {
    ctx.save();
    roundedRect(ctx, cx, y + 14, CHARA, CHARA, 8);
    ctx.clip();
    ctx.drawImage(chara, cx, y + 14, CHARA, CHARA);
    ctx.restore();
  }
  cx += CHARA + 14;

  // honor + name (left text block)
  const textW = x + w - cx - 110; // reserve right side for rating
  ctx.textBaseline = 'top';
  ctx.font = `12px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  fillTextSafe(ctx, player.player_honor || '', cx, y + 8, textW);
  ctx.font = `bold 22px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  fillTextSafe(ctx, player.player_name || '', cx, y + 24, textW);
  ctx.font = `12px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  fillTextSafe(
    ctx,
    [player.player_lv ? 'Lv ' + player.player_lv : '', player.player_team || '']
      .filter(Boolean)
      .join(' · '),
    cx,
    y + 50,
    textW,
  );

  // rating (right)
  const RX = x + w - PADX;
  ctx.textAlign = 'right';
  ctx.font = `11px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.fillText('RATING', RX, y + 10);
  ctx.font = `800 28px ${fontFamily}`;
  ctx.fillStyle = THEME.accent;
  fillTextSafe(ctx, player.player_rating || '0', RX, y + 24);
  ctx.textAlign = 'left';
}

export async function renderPlay(play, player) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // background gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, THEME.bgStart);
  g.addColorStop(1, THEME.bgEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // outer card
  const PAD = 28;
  roundedRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 18);
  ctx.fillStyle = THEME.card;
  ctx.fill();

  // cover — prefer HD (arcade-songs), fallback SEGA
  const cover =
    (await tryLoadImage(play.cover_url_hd)) ||
    (await tryLoadImage(play.cover_url));
  const COVER = 320;
  const COVER_X = PAD + 24;
  const COVER_Y = PAD + 24;
  ctx.fillStyle = '#eeeeee';
  roundedRect(ctx, COVER_X, COVER_Y, COVER, COVER, 14);
  ctx.fill();
  if (cover) {
    ctx.save();
    roundedRect(ctx, COVER_X, COVER_Y, COVER, COVER, 14);
    ctx.clip();
    ctx.drawImage(cover, COVER_X, COVER_Y, COVER, COVER);
    ctx.restore();
  }

  // right side
  const RIGHT_X = COVER_X + COVER + 28;
  const RIGHT_W = W - RIGHT_X - PAD - 24;

  // difficulty pill + level + date
  const diff = (play.difficulty || '').toLowerCase();
  const diffColor = THEME.difficulty[diff] || '#888';
  const diffLabel = THEME.difficultyLabel[diff] || (play.difficulty || '').toUpperCase();
  ctx.font = `bold 18px ${fontFamily}`;
  const pillW = ctx.measureText(diffLabel).width + 24;
  ctx.fillStyle = diffColor;
  roundedRect(ctx, RIGHT_X, PAD + 28, pillW, 30, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(diffLabel, RIGHT_X + 12, PAD + 28 + 16);

  // chart constant (internal level), fallback to displayed level
  const lv = play.chart_internal_level || play.chart_level;
  if (lv) {
    ctx.font = `bold 17px ${fontFamily}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText('Lv ' + lv, RIGHT_X + pillW + 10, PAD + 28 + 16);
  }

  // date
  ctx.font = `16px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.textAlign = 'right';
  fillTextSafe(ctx, play.played_at || '', RIGHT_X + RIGHT_W, PAD + 28 + 16);
  ctx.textAlign = 'left';

  // title
  ctx.font = `bold 30px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  ctx.textBaseline = 'top';
  fillTextSafe(ctx, play.title || '(unknown)', RIGHT_X, PAD + 78, RIGHT_W);

  // score
  const scoreStr = ((play.score || 0) / 10000).toFixed(4) + '%';
  ctx.font = `800 56px ${fontFamily}`;
  ctx.fillStyle = diffColor;
  fillTextSafe(ctx, scoreStr, RIGHT_X, PAD + 130);

  // rank
  ctx.font = `800 44px ${fontFamily}`;
  ctx.fillStyle = THEME.accent;
  fillTextSafe(ctx, play.rank || '', RIGHT_X, PAD + 200);

  // flags
  let flagX = RIGHT_X + ctx.measureText(play.rank || '').width + 24;
  ctx.font = `bold 16px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  const drawFlag = (label, color) => {
    const tw = ctx.measureText(label).width + 18;
    ctx.fillStyle = color;
    roundedRect(ctx, flagX, PAD + 210, tw, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, flagX + 9, PAD + 210 + 15);
    flagX += tw + 8;
  };
  if (play.flag_aj) drawFlag('AJ', THEME.flag.aj);
  else if (play.flag_fc) drawFlag('FC', THEME.flag.fc);
  else if (play.flag_clear) drawFlag('CLEAR', THEME.flag.clear);
  if (play.flag_new) drawFlag('NEW', THEME.flag.newRecord);

  // judges row (4 boxes)
  ctx.textBaseline = 'top';
  const JUDGE_Y = PAD + 270;
  const JUDGE_H = 88;
  const judges = [
    { label: 'CRITICAL', value: play.judge_critical || 0, color: THEME.judge.critical },
    { label: 'JUSTICE', value: play.judge_justice || 0, color: THEME.judge.justice },
    { label: 'ATTACK', value: play.judge_attack || 0, color: THEME.judge.attack },
    { label: 'MISS', value: play.judge_miss || 0, color: THEME.judge.miss },
  ];
  const GAP = 10;
  const each = (RIGHT_W - GAP * 3) / 4;
  for (let i = 0; i < 4; i++) {
    const j = judges[i];
    const x = RIGHT_X + i * (each + GAP);
    ctx.fillStyle = '#fafafa';
    roundedRect(ctx, x, JUDGE_Y, each, JUDGE_H, 8);
    ctx.fill();
    // top stripe
    ctx.fillStyle = j.color;
    roundedRect(ctx, x, JUDGE_Y, each, 4, 2);
    ctx.fill();
    ctx.font = `600 12px ${fontFamily}`;
    ctx.fillStyle = THEME.textSub;
    ctx.textAlign = 'center';
    ctx.fillText(j.label, x + each / 2, JUDGE_Y + 14);
    ctx.font = `bold 28px ${fontFamily}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(String(j.value), x + each / 2, JUDGE_Y + 36);
  }
  ctx.textAlign = 'left';

  // max combo
  ctx.font = `14px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.textBaseline = 'top';
  ctx.fillText('MAX COMBO', RIGHT_X, JUDGE_Y + JUDGE_H + 14);
  ctx.font = `bold 22px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(String(play.max_combo || 0), RIGHT_X + 110, JUDGE_Y + JUDGE_H + 10);

  // player banner (avatar + chara + honor + name + rating)
  const BANNER_H = 80;
  const BANNER_Y = H - PAD - BANNER_H - 4;
  await drawPlayerBanner(
    ctx,
    player,
    PAD + 12,
    BANNER_Y,
    W - PAD * 2 - 24,
    BANNER_H,
  );

  return canvas.toBuffer('image/png');
}

export async function renderProfile(player) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, THEME.bgStart);
  g.addColorStop(1, THEME.bgEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const PAD = 36;
  roundedRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 22);
  ctx.fillStyle = THEME.card;
  ctx.fill();

  // big composed avatar on the left
  const A = 320;
  const AX = PAD + 40;
  const AY = (H - A) / 2;
  ctx.fillStyle = '#eee';
  roundedRect(ctx, AX, AY, A, A, 16);
  ctx.fill();
  const layers = parseLayers(player.player_avatar_layers);
  const drewLayers = await drawAvatarLayers(ctx, layers, AX, AY, A);
  if (!drewLayers) {
    const fallback = await tryLoadImage(player.player_avatar);
    if (fallback) {
      ctx.save();
      roundedRect(ctx, AX, AY, A, A, 16);
      ctx.clip();
      ctx.drawImage(fallback, AX, AY, A, A);
      ctx.restore();
    }
  }

  // small chara icon on top of avatar (corner)
  const chara = await tryLoadImage(player.player_avatar);
  if (chara && drewLayers) {
    const CHARA = 80;
    const cx = AX + A - CHARA - 8;
    const cy = AY + A - CHARA - 8;
    ctx.save();
    roundedRect(ctx, cx, cy, CHARA, CHARA, 12);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(chara, cx + 4, cy + 4, CHARA - 8, CHARA - 8);
    ctx.restore();
  }

  const RX = AX + A + 36;
  ctx.textBaseline = 'top';
  ctx.font = `14px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  fillTextSafe(ctx, player.player_honor || '', RX, AY + 4);
  ctx.font = `bold 44px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  fillTextSafe(ctx, player.player_name || '(unknown)', RX, AY + 30);
  ctx.font = `18px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  fillTextSafe(ctx, player.player_lv ? 'Lv. ' + player.player_lv : '', RX, AY + 86);
  if (player.player_team) {
    fillTextSafe(ctx, 'Team: ' + player.player_team, RX, AY + 112);
  }

  ctx.font = `13px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  fillTextSafe(ctx, 'RATING', RX, AY + 150);
  ctx.font = `800 64px ${fontFamily}`;
  ctx.fillStyle = THEME.accent;
  fillTextSafe(ctx, player.player_rating || '0', RX, AY + 168);

  return canvas.toBuffer('image/png');
}
