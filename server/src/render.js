import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import { THEME } from './theme.js';

// register multiple weights / candidates under one family so font-weight maps correctly
const FONT_CANDIDATE_GROUPS = [
  // Linux (Docker / Fly.io)
  [
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  ],
  // macOS
  ['/System/Library/Fonts/PingFang.ttc'],
  // Windows — JhengHei (Microsoft 正黑體)
  [
    'C:\\Windows\\Fonts\\msjh.ttc',
    'C:\\Windows\\Fonts\\msjhl.ttc',
    'C:\\Windows\\Fonts\\msjhbd.ttc',
  ],
  // Windows — Meiryo / Yu Gothic fallback
  ['C:\\Windows\\Fonts\\meiryo.ttc', 'C:\\Windows\\Fonts\\meiryob.ttc'],
  ['C:\\Windows\\Fonts\\YuGothM.ttc', 'C:\\Windows\\Fonts\\YuGothB.ttc'],
];
let fontFamily = 'sans-serif';
for (const group of FONT_CANDIDATE_GROUPS) {
  let registered = 0;
  for (const p of group) {
    if (!fs.existsSync(p)) continue;
    try {
      GlobalFonts.registerFromPath(p, 'PlateSans');
      console.log('[render] registered font:', p);
      registered++;
    } catch (e) {
      console.warn('[render] font register failed for', p, e.message);
    }
  }
  if (registered) {
    fontFamily = 'PlateSans';
    break;
  }
}
if (fontFamily === 'sans-serif') {
  console.warn('[render] NO CJK FONT FOUND — text will render as boxes');
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

function filterAvatarLayers(layers) {
  // SEGA's CHU_UI_Avatar_Tex_* are tile textures meant to fill specific small
  // body regions via CSS positioning. Without that CSS we can't place them
  // correctly, so they only smear the avatar. Drop them.
  return (layers || []).filter((u) => !/\/CHU_UI_Avatar_Tex_/i.test(u));
}

async function drawAvatarLayers(ctx, layers, x, y, size) {
  const filtered = filterAvatarLayers(layers);
  if (!filtered.length) return false;
  const imgs = await Promise.all(filtered.map((u) => tryLoadImage(u)));
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

function drawRankBadge(ctx, rank, cx, cy, r) {
  if (!rank) return;
  ctx.fillStyle = THEME.accent;
  const fontSize = rank.length <= 1 ? r * 1.5 : rank.length <= 2 ? r * 1.1 : r * 0.8;
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, cx, cy + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function drawNewRecordRibbon(ctx, x, y) {
  ctx.save();
  // rotated tag
  ctx.translate(x, y);
  ctx.rotate(-0.08);
  const w = 130;
  const h = 30;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#ffd54f');
  grad.addColorStop(1, '#ff9a3d');
  ctx.fillStyle = grad;
  roundedRect(ctx, 0, 0, w, h, 6);
  ctx.fill();
  ctx.font = `bold 14px ${fontFamily}`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('NEW RECORD!', w / 2, h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.restore();
}

export async function renderPlay(play, player) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, THEME.bgStart);
  bgGrad.addColorStop(1, THEME.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // outer card
  const PAD = 20;
  roundedRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 16);
  ctx.fillStyle = THEME.card;
  ctx.fill();

  // ===== LEFT: chara avatar (single pre-composed image from SEGA) =====
  const AV_X = PAD + 24;
  const AV_Y = PAD + 36;
  const AV_W = 220;
  const charaImg = await tryLoadImage(player.player_avatar);
  ctx.fillStyle = '#f5f5f5';
  roundedRect(ctx, AV_X, AV_Y, AV_W, AV_W, 14);
  ctx.fill();
  if (charaImg) {
    ctx.save();
    roundedRect(ctx, AV_X, AV_Y, AV_W, AV_W, 14);
    ctx.clip();
    // chara images aren't always square — fit by contain
    const ratio = charaImg.width / charaImg.height;
    let dw = AV_W, dh = AV_W;
    if (ratio > 1) dh = AV_W / ratio;
    else dw = AV_W * ratio;
    ctx.drawImage(charaImg, AV_X + (AV_W - dw) / 2, AV_Y + (AV_W - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.font = `14px ${fontFamily}`;
    ctx.fillStyle = THEME.textSub;
    ctx.textAlign = 'center';
    ctx.fillText('(no avatar)', AV_X + AV_W / 2, AV_Y + AV_W / 2);
    ctx.textAlign = 'left';
  }

  // header at very top-left
  ctx.font = `bold 14px ${fontFamily}`;
  ctx.fillStyle = THEME.accent;
  ctx.textBaseline = 'top';
  ctx.fillText('STAGE RESULT', AV_X, AV_Y - 4);
  ctx.font = `10px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.fillText('THANK YOU FOR PLAYING!', AV_X, AV_Y + 12);

  // ===== CENTER: cover + song info =====
  const C_X = AV_X + AV_W + 24;
  const COVER = 170;
  const COVER_Y = PAD + 32;
  const cover =
    (await tryLoadImage(play.cover_url_hd)) ||
    (await tryLoadImage(play.cover_url));
  ctx.fillStyle = '#eeeeee';
  roundedRect(ctx, C_X, COVER_Y, COVER, COVER, 10);
  ctx.fill();
  if (cover) {
    ctx.save();
    roundedRect(ctx, C_X, COVER_Y, COVER, COVER, 10);
    ctx.clip();
    ctx.drawImage(cover, C_X, COVER_Y, COVER, COVER);
    ctx.restore();
  }

  // info column right of cover
  const INFO_X = C_X + COVER + 16;
  const INFO_W = W - PAD - 16 - INFO_X - 220 /* rank badge area */;

  // difficulty pill + lv + date
  const diff = (play.difficulty || '').toLowerCase();
  const diffColor = THEME.difficulty[diff] || '#888';
  const diffLabel = THEME.difficultyLabel[diff] || (play.difficulty || '').toUpperCase();
  ctx.font = `bold 16px ${fontFamily}`;
  const pillW = ctx.measureText(diffLabel).width + 22;
  ctx.fillStyle = diffColor;
  roundedRect(ctx, INFO_X, COVER_Y + 4, pillW, 26, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(diffLabel, INFO_X + 11, COVER_Y + 17);

  const lv = play.chart_internal_level || play.chart_level;
  if (lv) {
    ctx.font = `bold 16px ${fontFamily}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText('Lv ' + lv, INFO_X + pillW + 10, COVER_Y + 17);
  }

  // date — top-right of card
  ctx.font = `13px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  fillTextSafe(ctx, play.played_at || '', W - PAD - 24, PAD + 20);
  ctx.textAlign = 'left';

  // song title
  ctx.font = `bold 26px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  fillTextSafe(ctx, play.title || '(unknown)', INFO_X, COVER_Y + 42, INFO_W);

  // achievement rate — label first (above), then % big with NEW RECORD beside in red
  ctx.font = `10px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.fillText('ACHIEVEMENT RATE', INFO_X + 4, COVER_Y + 76);

  const scoreStr = ((play.score || 0) / 10000).toFixed(4) + '%';
  ctx.fillStyle = diffColor;
  ctx.font = `bold 50px ${fontFamily}`;
  fillTextSafe(ctx, scoreStr, INFO_X, COVER_Y + 92);

  // NEW RECORD inline next to the % — bold red
  if (play.flag_new) {
    ctx.font = `bold 50px ${fontFamily}`;
    const scoreW = ctx.measureText(scoreStr).width;
    ctx.fillStyle = '#e53935';
    ctx.font = `bold 28px ${fontFamily}`;
    ctx.fillText('NEW RECORD!', INFO_X + scoreW + 16, COVER_Y + 108);
  }

  // flag pills
  let flagX = INFO_X;
  const flagY = COVER_Y + 148;
  ctx.font = `bold 14px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  const drawFlag = (label, color) => {
    const tw = ctx.measureText(label).width + 18;
    ctx.fillStyle = color;
    roundedRect(ctx, flagX, flagY, tw, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, flagX + 9, flagY + 13);
    flagX += tw + 8;
  };
  if (play.flag_aj) drawFlag('ALL JUSTICE', THEME.flag.aj);
  else if (play.flag_fc) drawFlag('FULL COMBO', THEME.flag.fc);
  else if (play.flag_clear) drawFlag('CLEAR', THEME.flag.clear);
  // NEW pill removed — NEW RECORD! is now inline next to the score

  // ===== RIGHT: rank badge =====
  const RANK_R = 96;
  const RANK_CX = W - PAD - 24 - RANK_R;
  const RANK_CY = PAD + 32 + RANK_R + 8;
  drawRankBadge(ctx, play.rank || '', RANK_CX, RANK_CY, RANK_R);
  ctx.textBaseline = 'top';

  // ===== judges row (full width below cover/info) =====
  const J_Y = COVER_Y + COVER + 24;
  const J_X = C_X;
  const J_W = W - PAD - 16 - C_X;
  const J_H = 76;
  const judges = [
    { label: 'CRITICAL', value: play.judge_critical || 0, color: THEME.judge.critical },
    { label: 'JUSTICE', value: play.judge_justice || 0, color: THEME.judge.justice },
    { label: 'ATTACK', value: play.judge_attack || 0, color: THEME.judge.attack },
    { label: 'MISS', value: play.judge_miss || 0, color: THEME.judge.miss },
  ];
  const GAP = 8;
  const each = (J_W - GAP * 3) / 4;
  for (let i = 0; i < 4; i++) {
    const j = judges[i];
    const x = J_X + i * (each + GAP);
    ctx.fillStyle = '#fafafa';
    roundedRect(ctx, x, J_Y, each, J_H, 8);
    ctx.fill();
    ctx.fillStyle = j.color;
    roundedRect(ctx, x, J_Y, each, 4, 2);
    ctx.fill();
    ctx.font = `600 11px ${fontFamily}`;
    ctx.fillStyle = THEME.textSub;
    ctx.textAlign = 'center';
    ctx.fillText(j.label, x + each / 2, J_Y + 14);
    ctx.font = `bold 26px ${fontFamily}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(String(j.value), x + each / 2, J_Y + 36);
  }
  ctx.textAlign = 'left';

  // MAX COMBO row
  const MC_Y = J_Y + J_H + 10;
  ctx.fillStyle = '#f5f0fa';
  roundedRect(ctx, J_X, MC_Y, J_W, 30, 8);
  ctx.fill();
  ctx.font = `bold 12px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.textBaseline = 'middle';
  ctx.fillText('MAX COMBO', J_X + 14, MC_Y + 15);
  ctx.font = `bold 18px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(String(play.max_combo || 0), J_X + 130, MC_Y + 15);

  // ===== BOTTOM: player banner (chara as round icon) =====
  ctx.textBaseline = 'top';
  const B_H = 70;
  const B_Y = H - PAD - B_H - 6;
  const B_X = PAD + 16;
  const B_W = W - PAD * 2 - 32;

  ctx.fillStyle = '#f7f3fb';
  roundedRect(ctx, B_X, B_Y, B_W, B_H, 12);
  ctx.fill();

  // chara round icon
  const CHARA = B_H - 16;
  const cx = B_X + 12 + CHARA / 2;
  const cy = B_Y + 8 + CHARA / 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, CHARA / 2 + 2, 0, Math.PI * 2);
  ctx.fill();
  const chara = await tryLoadImage(player.player_avatar);
  if (chara) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, CHARA / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(chara, cx - CHARA / 2, cy - CHARA / 2, CHARA, CHARA);
    ctx.restore();
  }

  // text block: honor / name / lv·team
  const tX = B_X + 12 + CHARA + 16;
  ctx.font = `11px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  fillTextSafe(ctx, player.player_honor || '', tX, B_Y + 10, B_W - 200);
  ctx.font = `bold 22px ${fontFamily}`;
  ctx.fillStyle = THEME.text;
  fillTextSafe(ctx, player.player_name || '', tX, B_Y + 24, B_W - 200);
  ctx.font = `11px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  const subline = [
    player.player_lv ? 'Lv ' + player.player_lv : '',
    player.player_team || '',
  ].filter(Boolean).join(' · ');
  fillTextSafe(ctx, subline, tX, B_Y + 50, B_W - 200);

  // rating on right
  ctx.textAlign = 'right';
  ctx.font = `10px ${fontFamily}`;
  ctx.fillStyle = THEME.textSub;
  ctx.fillText('RATING', B_X + B_W - 18, B_Y + 12);
  ctx.font = `900 28px ${fontFamily}`;
  ctx.fillStyle = THEME.accent;
  fillTextSafe(ctx, player.player_rating || '0', B_X + B_W - 18, B_Y + 26);
  ctx.textAlign = 'left';

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
