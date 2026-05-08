(async function () {
  'use strict';

  const LOG = (...a) => console.log('[Plate]', ...a);
  const WARN = (...a) => console.warn('[Plate]', ...a);
  const ERR = (...a) => console.error('[Plate]', ...a);

  if (!/chunithm-net-eng\.com$/.test(location.hostname)) {
    alert('請在 CHUNITHM-NET 國際版 (chunithm-net-eng.com) 登入後執行。');
    return;
  }

  const SYNC_TOKEN = (typeof window !== 'undefined' && window.__chuniSyncToken) || '';
  const SYNC_BASE = (typeof window !== 'undefined' && window.__chuniSyncBase) || '';
  const SYNC_MODE = !!SYNC_TOKEN;

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const text = (el, sel) => {
    if (!el) return '';
    const n = sel ? el.querySelector(sel) : el;
    return n ? (n.textContent || '').trim() : '';
  };

  const attr = (el, sel, name) => {
    if (!el) return '';
    const n = sel ? el.querySelector(sel) : el;
    return n ? (n.getAttribute(name) || '') : '';
  };

  const num = (s) => {
    if (s == null) return 0;
    const v = parseFloat(String(s).replace(/[^\d.\-]/g, ''));
    return isNaN(v) ? 0 : v;
  };

  const normalize = (s) =>
    (s || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  async function getDoc(url, opts) {
    const res = await fetch(url, Object.assign({ credentials: 'include' }, opts || {}));
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    const html = await res.text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function loadHtml2Canvas() {
    if (window.html2canvas) return window.html2canvas;
    LOG('loading html2canvas...');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('html2canvas load failed'));
      document.body.appendChild(s);
    });
    return window.html2canvas;
  }

  // label-based fallback: find a node whose text matches `re`, return adjacent value
  function findValueByLabel(root, re) {
    if (!root) return '';
    const nodes = root.querySelectorAll('*');
    for (const n of nodes) {
      if (n.children.length) continue;
      const t = (n.textContent || '').trim();
      if (!t || !re.test(t)) continue;
      // try sibling
      let sib = n.nextElementSibling;
      while (sib) {
        const v = (sib.textContent || '').trim();
        if (v && !re.test(v)) return v;
        sib = sib.nextElementSibling;
      }
      // try parent's next sibling
      const p = n.parentElement;
      if (p) {
        let ps = p.nextElementSibling;
        while (ps) {
          const v = (ps.textContent || '').trim();
          if (v && !re.test(v)) return v;
          ps = ps.nextElementSibling;
        }
      }
    }
    return '';
  }

  // ---------- diagnostic ----------
  let _dumpedDetail = false;
  let _dumpedPlayer = false;
  function debugDump(label, doc) {
    try {
      const classes = new Set();
      doc.querySelectorAll('[class]').forEach((el) =>
        el.classList.forEach((c) => classes.add(c)),
      );
      const sorted = [...classes].sort();
      LOG(`=== ${label} CLASSES (${sorted.length}) ===`);
      LOG(sorted.join(' '));
      const imgs = [...doc.querySelectorAll('img')]
        .map((i) => i.getAttribute('src'))
        .filter(Boolean);
      LOG(`=== ${label} IMG SRCS (${imgs.length}) ===`);
      LOG(imgs.slice(0, 40).join('\n'));
      const body = doc.body ? doc.body.innerHTML : '';
      LOG(`=== ${label} BODY SAMPLE (${body.length} chars) ===`);
      LOG(body.slice(0, 12000));
      LOG(`=== ${label} END ===`);
    } catch (e) {
      WARN('debugDump failed', e);
    }
  }

  // ---------- parsers ----------
  function parseScore(s) {
    const v = num(s);
    if (v <= 0) return 0;
    return v < 1100 ? Math.round(v * 10000) : Math.round(v);
  }

  const RANK_MAP = ['D','C','B','BB','BBB','A','AA','AAA','S','S+','SS','SS+','SSS','SSS+'];
  function parseRankFromSrc(src) {
    if (!src) return '';
    // numeric form: icon_rank_6.png
    const mn = src.match(/icon_rank_(\d+)/i);
    if (mn) return RANK_MAP[parseInt(mn[1], 10)] || '';
    // letter form (legacy)
    const ml = src.match(/icon_rank_([a-z]+)/i);
    if (ml) {
      let r = ml[1].toUpperCase();
      if (r === 'SSSP') return 'SSS+';
      if (r === 'SSP') return 'SS+';
      if (r === 'SP') return 'S+';
      return r;
    }
    return '';
  }

  function parseRatingFromImages(root) {
    const imgs = root ? root.querySelectorAll('.player_rating_num_block img') : [];
    let s = '';
    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      const m = src.match(/rating_[a-z]+_(\d+|comma)/i);
      if (!m) continue;
      s += m[1].toLowerCase() === 'comma' ? '.' : String(parseInt(m[1], 10));
    }
    return s;
  }

  function detectDifficulty(root) {
    if (!root) return '';
    const diffs = ['worldsend', 'ultima', 'master', 'expert', 'advanced', 'basic'];
    // 1. class on root or descendants
    for (const d of diffs) {
      if (root.querySelector(`.icon_diff_${d}, .play_track_${d}, .musicdata_${d}, .bg_${d}`)) {
        return d;
      }
    }
    // 2. img src scan
    const imgs = root.querySelectorAll('img');
    for (const img of imgs) {
      const src = (img.getAttribute('src') || '').toLowerCase();
      for (const d of diffs) {
        if (src.includes(`diff_${d}`) || src.includes(`_${d}.png`)) return d;
      }
    }
    return '';
  }

  function parseJudges(root) {
    // CHUNITHM-NET only displays 4 judges: critical / justice / attack / miss
    const out = { critical: 0, justice: 0, attack: 0, miss: 0 };
    if (!root) return out;
    const sel = {
      critical: '.text_critical.play_data_detail_judge_text, .text_critical',
      justice: '.text_justice.play_data_detail_judge_text, .text_justice',
      attack: '.text_attack.play_data_detail_judge_text, .text_attack',
      miss: '.text_miss.play_data_detail_judge_text, .text_miss',
    };
    for (const k in sel) {
      const el = root.querySelector(sel[k]);
      if (el) out[k] = num(el.textContent);
    }
    return out;
  }

  function parseDetail(doc) {
    const root = doc.querySelector('.box01') || doc.body;
    if (!_dumpedDetail) {
      const probe = root.querySelector('.play_musicdata_title');
      if (!probe) { _dumpedDetail = true; debugDump('DETAIL', doc); }
    }

    const title = text(root, '.play_musicdata_title');
    const scoreText = text(root, '.play_musicdata_score_text');

    // rank: numeric icon inside .play_musicdata_icon, e.g. icon_rank_6.png
    const rankImgs = [...root.querySelectorAll('.play_musicdata_icon img')];
    let rankSrc = '';
    for (const img of rankImgs) {
      const s = img.getAttribute('src') || '';
      if (/icon_rank_/i.test(s)) { rankSrc = s; break; }
    }

    // difficulty: from .play_track_result img src (musiclevel_master.png etc.)
    const diffImgSrc = attr(root, '.play_track_result img', 'src');
    let difficulty = '';
    if (diffImgSrc) {
      const m = diffImgSrc.match(/musiclevel_([a-z]+)/i);
      if (m) difficulty = m[1].toLowerCase();
    }
    if (!difficulty) difficulty = detectDifficulty(root);

    const flags = {
      clear: !!root.querySelector('.play_musicdata_icon img[src*="icon_clear"]'),
      fc: !!root.querySelector('.play_musicdata_icon img[src*="icon_fullcombo"]'),
      aj: !!root.querySelector('.play_musicdata_icon img[src*="icon_alljustice"]'),
      newRecord: !!root.querySelector('.play_musicdata_score_img img[src*="icon_new"]'),
    };

    const judges = parseJudges(root);

    const maxCombo = num(text(root, '.play_data_detail_maxcombo_block'));

    const date = text(root, '.box_inner01');

    const coverFromSega = attr(root, '.play_jacket_img img', 'src');

    return {
      title,
      score: parseScore(scoreText),
      rank: parseRankFromSrc(rankSrc),
      difficulty,
      flags,
      judges,
      maxCombo,
      date,
      coverFromSega,
    };
  }

  function parsePlayer(doc) {
    const root = doc.body;
    if (!_dumpedPlayer) {
      const probe = root.querySelector('.player_name_in');
      if (!probe) { _dumpedPlayer = true; debugDump('PLAYER', doc); }
    }
    const name = text(root, '.player_name_in');
    let rating = parseRatingFromImages(root);
    const titleStr =
      text(root, '.player_honor_text span') ||
      text(root, '.player_honor_text');
    // fallback: pull rating from honor text "RATING X.YZ"
    if (!rating && titleStr) {
      const m = titleStr.match(/RATING\s*([\d.]+)/i);
      if (m) rating = m[1];
    }
    const avatar = attr(root, '.player_chara img', 'src');
    const lv = text(root, '.player_lv');
    const team = text(root, '.player_team_name');
    return { name, rating, title: titleStr, avatar, lv, team };
  }

  // ---------- arcade-songs ----------
  async function fetchArcadeSongs() {
    try {
      const res = await fetch('https://arcade-songs.zetaraku.dev/data/chunithm/data.json', {
        credentials: 'omit',
      });
      if (!res.ok) throw new Error('status ' + res.status);
      const json = await res.json();
      LOG('arcade-songs:', (json.songs || []).length, 'songs');
      return json;
    } catch (e) {
      WARN('arcade-songs fetch failed, fallback to SEGA covers:', e);
      return null;
    }
  }

  function buildSongIndex(db) {
    if (!db || !db.songs) return null;
    const idx = new Map();
    for (const s of db.songs) {
      const key = normalize(s.title);
      if (!idx.has(key)) idx.set(key, s);
    }
    return idx;
  }

  function enrichSong(play, idx) {
    const out = Object.assign({}, play);
    if (!idx) {
      out.cover = play.coverFromSega || '';
      return out;
    }
    const hit = idx.get(normalize(play.title));
    if (hit && hit.imageName) {
      out.cover = `https://arcade-songs.zetaraku.dev/img/cover/chunithm/${hit.imageName}`;
      out.coverFallback = play.coverFromSega || '';
      // try level enrichment if SEGA missed
      if (!out.level && hit.sheets && play.difficulty) {
        const sheet = hit.sheets.find(
          (sh) => (sh.difficulty || '').toLowerCase() === play.difficulty,
        );
        if (sheet) out.level = sheet.level || '';
      }
    } else {
      out.cover = play.coverFromSega || '';
    }
    return out;
  }

  // ---------- renderer ----------
  const DIFF_COLOR = {
    basic: '#3ba84d',
    advanced: '#e8a400',
    expert: '#d8385c',
    master: '#a040c0',
    ultima: '#d83030',
    worldsend: '#666',
  };

  const DIFF_LABEL = {
    basic: 'BASIC',
    advanced: 'ADVANCED',
    expert: 'EXPERT',
    master: 'MASTER',
    ultima: 'ULTIMA',
    worldsend: "WORLD'S END",
  };

  function judgeBox(label, val, color) {
    return `
      <div style="flex:1;background:#fff;border-radius:8px;padding:10px 6px;text-align:center;border-top:3px solid ${color};">
        <div style="font-size:11px;color:#777;letter-spacing:.5px;font-weight:600;">${esc(label)}</div>
        <div style="font-size:20px;color:#222;font-weight:700;margin-top:2px;">${esc(val)}</div>
      </div>`;
  }

  function songCard(s) {
    const diffColor = DIFF_COLOR[s.difficulty] || '#888';
    const diffLabel = DIFF_LABEL[s.difficulty] || (s.difficulty || '').toUpperCase();
    const scoreFormatted = (s.score / 10000).toFixed(4) + '%';

    const flagBadge = (label, color) =>
      `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;padding:3px 8px;border-radius:4px;margin-right:4px;">${label}</span>`;

    const flags = [];
    if (s.flags.aj) flags.push(flagBadge('AJ', '#f0a500'));
    else if (s.flags.fc) flags.push(flagBadge('FC', '#2196f3'));
    else if (s.flags.clear) flags.push(flagBadge('CLEAR', '#4caf50'));
    if (s.flags.newRecord) flags.push(flagBadge('NEW', '#d4537e'));

    const cover = s.cover || '';

    return `
      <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;display:flex;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        <img src="${esc(cover)}" crossorigin="anonymous" referrerpolicy="no-referrer"
             style="width:140px;height:140px;border-radius:10px;object-fit:cover;background:#eee;flex-shrink:0;"
             onerror="if(this.dataset.fb!=='1'&&'${esc(s.coverFallback || '')}'){this.dataset.fb='1';this.src='${esc(s.coverFallback || '')}';}else{this.style.background='#ccc';this.removeAttribute('src');}">
        <div style="flex:1;margin-left:16px;display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;margin-bottom:6px;">
            <span style="background:${diffColor};color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:.5px;">${esc(diffLabel)}</span>
            <span style="margin-left:auto;font-size:12px;color:#999;">${esc(s.date || '')}</span>
          </div>
          <div style="font-size:20px;font-weight:700;color:#222;line-height:1.2;margin-bottom:8px;">${esc(s.title || '(unknown)')}</div>
          <div style="display:flex;align-items:center;margin-bottom:8px;">
            <span style="font-size:28px;font-weight:800;color:${diffColor};letter-spacing:1px;">${esc(scoreFormatted)}</span>
            <span style="margin-left:12px;font-size:24px;font-weight:800;color:#d4537e;">${esc(s.rank || '')}</span>
            <span style="margin-left:auto;">${flags.join('')}</span>
          </div>
          <div style="display:flex;gap:6px;">
            ${judgeBox('CRITICAL', s.judges.critical, '#ffcc00')}
            ${judgeBox('JUSTICE', s.judges.justice, '#ff9966')}
            ${judgeBox('ATTACK', s.judges.attack, '#66cc66')}
            ${judgeBox('MISS', s.judges.miss, '#bbbbbb')}
          </div>
          <div style="margin-top:8px;font-size:12px;color:#666;">
            MAX COMBO: <b style="color:#222;">${esc(s.maxCombo)}</b>
          </div>
        </div>
      </div>`;
  }

  async function renderPlate(player, songs) {
    const container = document.createElement('div');
    container.style.cssText = `
      position:fixed;left:-99999px;top:0;width:1080px;
      background:linear-gradient(135deg,#ffe5f0 0%,#e8e0ff 100%);
      padding:32px;box-sizing:border-box;
      font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222;
    `;

    container.innerHTML = `
      <div style="display:flex;align-items:center;background:#fff;border-radius:14px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        ${player.avatar ? `<img src="${esc(player.avatar)}" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:80px;height:80px;border-radius:12px;object-fit:cover;background:#eee;">` : ''}
        <div style="flex:1;margin-left:${player.avatar ? '16px' : '0'};">
          <div style="font-size:14px;color:#666;margin-bottom:4px;">${esc(player.title || '')}</div>
          <div style="font-size:28px;font-weight:800;color:#222;">${esc(player.name || '(unknown)')}</div>
          <div style="font-size:14px;color:#888;margin-top:4px;">${player.lv ? 'Lv. ' + esc(player.lv) : ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#888;letter-spacing:1px;">RATING</div>
          <div style="font-size:36px;font-weight:800;color:#d4537e;line-height:1;">${esc(player.rating || '0')}</div>
        </div>
      </div>
      <div style="margin-bottom:12px;font-size:14px;color:#888;letter-spacing:2px;font-weight:600;">▎ RECENT 3 PLAYS</div>
      ${songs.map(songCard).join('')}
      <div style="text-align:center;margin-top:8px;font-size:11px;color:#aaa;">
        Generated ${new Date().toLocaleString()} · CHUNITHM Plate Generator
      </div>
    `;

    document.body.appendChild(container);
    // give images a moment to start loading
    await sleep(200);

    const canvas = await window.html2canvas(container, {
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
    });

    container.remove();
    return canvas;
  }

  function showResult(canvas) {
    const old = document.getElementById('chuni-plate-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'chuni-plate-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;
    `;

    const wrap = document.createElement('div');
    wrap.style.cssText = `
      background:#fff;border-radius:12px;padding:16px;max-width:92vw;max-height:92vh;
      display:flex;flex-direction:column;align-items:center;overflow:auto;
    `;

    const preview = document.createElement('img');
    preview.src = canvas.toDataURL('image/png');
    preview.style.cssText = 'max-width:100%;height:auto;border-radius:8px;display:block;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:14px;';

    const dlBtn = document.createElement('button');
    dlBtn.textContent = '下載 PNG';
    dlBtn.style.cssText =
      'background:#d4537e;color:#fff;border:0;padding:10px 24px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;';
    dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = preview.src;
      a.download = `chunithm-recent-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '關閉';
    closeBtn.style.cssText =
      'background:#888;color:#fff;border:0;padding:10px 24px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();

    btnRow.appendChild(dlBtn);
    btnRow.appendChild(closeBtn);
    wrap.appendChild(preview);
    wrap.appendChild(btnRow);
    overlay.appendChild(wrap);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // ---------- main ----------
  try {
    LOG('start');
    await loadHtml2Canvas();

    LOG('fetching playlog list...');
    const listDoc = await getDoc('/mobile/record/playlog');

    // collect (idx, token, action) tuples — each form is self-contained
    const allForms = [...listDoc.querySelectorAll('form')];
    const pairs = [];
    for (const f of allForms) {
      const idxEl = f.querySelector('input[name="idx"]');
      const tokEl = f.querySelector('input[name="token"]');
      if (idxEl && idxEl.value && tokEl && tokEl.value) {
        pairs.push({
          idx: idxEl.value,
          token: tokEl.value,
          action: f.getAttribute('action') || '',
          method: (f.getAttribute('method') || 'POST').toUpperCase(),
        });
      }
    }
    LOG('list: pair count=', pairs.length);
    if (pairs.length) LOG('list: first pair=', pairs[0]);

    if (!pairs.length) {
      alert('找不到任何遊玩紀錄。請開 DevTools Console 把 [Plate] 開頭的 log 貼回來。');
      return;
    }

    const top = pairs.slice(0, 3);
    LOG('top idx:', top.map((p) => p.idx));

    const plays = [];
    for (const p of top) {
      LOG('fetching detail idx=', p.idx, 'action=', p.action);
      const body = new URLSearchParams({ idx: p.idx, token: p.token }).toString();
      // resolve action against base
      let url = p.action;
      if (!url) {
        url = '/mobile/record/playlogDetail/';
      } else if (!/^https?:/.test(url) && !url.startsWith('/')) {
        url = '/mobile/record/' + url;
      }
      const res = await fetch(url, {
        method: p.method || 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
      });
      LOG('detail response status=', res.status, 'url=', res.url);
      if (!res.ok) {
        WARN('detail fetch failed', p.idx, res.status);
        continue;
      }
      const html = await res.text();
      LOG('detail html length=', html.length);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const detail = parseDetail(doc);
      LOG('parsed', detail);
      plays.push(detail);
      await sleep(400);
    }

    if (!plays.length) {
      alert('無法解析任何遊玩紀錄。');
      return;
    }

    LOG('fetching player data...');
    // try multiple endpoints; first one that yields a non-empty player wins
    const playerCandidates = ['/mobile/home/', '/mobile/', '/mobile/home/playerData'];
    let player = { name: '', rating: '', title: '', avatar: '', lv: '' };
    for (const url of playerCandidates) {
      try {
        const playerDoc = await getDoc(url);
        const p = parsePlayer(playerDoc);
        LOG('player @', url, '=', p);
        if (p.name || p.rating) {
          player = p;
          break;
        }
      } catch (e) {
        WARN('player fetch failed @', url, e);
      }
    }

    if (SYNC_MODE) {
      LOG('sync mode — posting to backend');
      const base = SYNC_BASE || (await detectSyncBase());
      if (!base) {
        alert('找不到同步伺服器位址。請更新書籤或回 Discord 重新 /bind。');
        return;
      }
      try {
        const res = await fetch(base.replace(/\/$/, '') + '/sync', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: SYNC_TOKEN,
            player,
            plays,
          }),
        });
        const json = await res.json().catch(() => ({}));
        LOG('sync response', res.status, json);
        if (!res.ok) {
          alert('同步失敗：' + (json.error || res.status));
          return;
        }
        showSyncResult(json);
        return;
      } catch (e) {
        ERR('sync error', e);
        alert('同步發生錯誤：' + (e && e.message ? e.message : e));
        return;
      }
    }

    const db = await fetchArcadeSongs();
    const idx = buildSongIndex(db);
    const enriched = plays.map((p) => enrichSong(p, idx));

    LOG('rendering...');
    const canvas = await renderPlate(player, enriched);
    showResult(canvas);
    LOG('done');
  } catch (e) {
    ERR(e);
    alert('產生圖卡失敗：' + (e && e.message ? e.message : e));
  }

  async function detectSyncBase() {
    // bookmarklet may set window.__chuniSyncBase explicitly. If not, try the script's origin's API.
    const scripts = [...document.scripts];
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      if (/plate-generator\.js/.test(src)) {
        try {
          const u = new URL(src);
          // by convention, sync server lives at https://chuni-bot.fly.dev
          // user can override via window.__chuniSyncBase
          // here we fall back to a guess based on script host? unsafe — return empty
          break;
        } catch {
          // ignore
        }
      }
    }
    return '';
  }

  function showSyncResult(json) {
    const old = document.getElementById('chuni-plate-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'chuni-plate-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;
    `;
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      background:linear-gradient(135deg,#ffe5f0 0%,#e8e0ff 100%);
      border-radius:14px;padding:28px 32px;max-width:92vw;
      text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.3);
    `;
    wrap.innerHTML = `
      <div style="font-size:18px;color:#888;margin-bottom:6px;letter-spacing:2px;">CHUNI BOT</div>
      <div style="font-size:32px;font-weight:800;color:#d4537e;margin-bottom:12px;">✓ 同步完成</div>
      <div style="font-size:16px;color:#333;line-height:1.7;">
        玩家：<b>${(json.profile && json.profile.name) || '?'}</b><br>
        Rating：<b>${(json.profile && json.profile.rating) || '?'}</b><br>
        本次同步 <b>${json.plays || 0}</b> 場
      </div>
      <button id="chuni-close-overlay" style="margin-top:18px;background:#d4537e;color:#fff;border:0;padding:10px 28px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">關閉</button>
      <div style="margin-top:14px;font-size:12px;color:#888;">回 Discord 用 <code>/rs</code> 看歷史</div>
    `;
    overlay.appendChild(wrap);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    document.getElementById('chuni-close-overlay').onclick = () => overlay.remove();
  }
})();
