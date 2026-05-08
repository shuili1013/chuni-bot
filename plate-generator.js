(async function () {
  'use strict';

  const LOG = (...a) => console.log('[Plate]', ...a);
  const WARN = (...a) => console.warn('[Plate]', ...a);
  const ERR = (...a) => console.error('[Plate]', ...a);

  if (!/chunithm-net-eng\.com$/.test(location.hostname)) {
    alert('請在 CHUNITHM-NET 國際版 (chunithm-net-eng.com) 登入後執行。');
    return;
  }

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

  // ---------- parsers ----------
  function parseScore(s) {
    const v = num(s);
    if (v <= 0) return 0;
    return v < 1100 ? Math.round(v * 10000) : Math.round(v);
  }

  function parseRankFromSrc(src) {
    if (!src) return '';
    const m = src.match(/icon_rank_([a-z]+)/i);
    if (!m) return '';
    let r = m[1].toUpperCase();
    if (r === 'SSSP') return 'SSS+';
    if (r === 'SSP') return 'SS+';
    if (r === 'SP') return 'S+';
    return r;
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
    const out = { cp: 0, perfect: 0, great: 0, good: 0, miss: 0 };
    if (!root) return out;

    // class-based first
    const classMap = {
      cp: '.text_critical_perfect',
      perfect: '.text_perfect',
      great: '.text_great',
      good: '.text_good',
      miss: '.text_miss',
    };
    for (const k in classMap) {
      const el = root.querySelector(classMap[k]);
      if (el) out[k] = num(el.textContent);
    }

    // label-based fallback
    const labelMap = {
      cp: /critical\s*perfect/i,
      perfect: /^perfect$/i,
      great: /^great$/i,
      good: /^good$/i,
      miss: /^miss$/i,
    };
    for (const k in labelMap) {
      if (out[k]) continue;
      const v = findValueByLabel(root, labelMap[k]);
      if (v) out[k] = num(v);
    }
    return out;
  }

  function parseDetail(doc) {
    const root = doc.querySelector('.box01') || doc.body;

    const title = text(root, '.play_musicdata_title');
    const lvText =
      text(root, '.play_musicdata_lv') || text(root, '.play_musicdata_difficulty');

    const scoreText = text(root, '.play_musicdata_score_text');
    const rankSrc =
      attr(root, '.play_musicdata_score_rank img', 'src') ||
      attr(root, '.play_musicdata_icon img', 'src');

    const difficulty = detectDifficulty(root);

    const flags = {
      clear: !!root.querySelector('img[src*="icon_clear"]'),
      fc: !!root.querySelector('img[src*="icon_fullcombo"]'),
      aj: !!root.querySelector('img[src*="icon_alljustice"]'),
      newRecord: !!root.querySelector('img[src*="icon_newrecord"]'),
    };

    const judges = parseJudges(root);

    const maxCombo =
      num(text(root, '.play_musicdata_maxcombo')) ||
      num(findValueByLabel(root, /max\s*combo/i));

    const fast = num(findValueByLabel(root, /^fast$/i));
    const late = num(findValueByLabel(root, /^late$/i));

    const date =
      text(root, '.play_datalist_date') ||
      text(root, '.box_inner01 .text_b');

    const coverFromSega =
      attr(root, '.play_jacket_img img', 'src') ||
      attr(root, '.musicdata_jacket img', 'src');

    return {
      title,
      level: lvText,
      score: parseScore(scoreText),
      rank: parseRankFromSrc(rankSrc),
      difficulty,
      flags,
      judges,
      maxCombo,
      fast,
      late,
      date,
      coverFromSega,
    };
  }

  function parsePlayer(doc) {
    const root = doc.body;
    const name =
      text(root, '.player_name_in') ||
      text(root, '.player_name_block .player_name') ||
      text(root, '.player_name');
    const rating =
      text(root, '.player_rating_num') ||
      text(root, '.player_rating');
    const titleStr =
      text(root, '.player_honor_text') ||
      text(root, '.player_honor');
    const avatar =
      attr(root, '.player_chara_avatar img', 'src') ||
      attr(root, '.avatar img', 'src');
    const lv = text(root, '.player_lv');
    return { name, rating, title: titleStr, avatar, lv };
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
    if (s.flags.newRecord) flags.push(flagBadge('NEW RECORD', '#d4537e'));

    const cover = s.cover || '';

    return `
      <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;display:flex;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        <img src="${esc(cover)}" crossorigin="anonymous" referrerpolicy="no-referrer"
             style="width:140px;height:140px;border-radius:10px;object-fit:cover;background:#eee;flex-shrink:0;"
             onerror="if(this.dataset.fb!=='1'&&'${esc(s.coverFallback || '')}'){this.dataset.fb='1';this.src='${esc(s.coverFallback || '')}';}else{this.style.background='#ccc';this.removeAttribute('src');}">
        <div style="flex:1;margin-left:16px;display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;margin-bottom:6px;">
            <span style="background:${diffColor};color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:.5px;">${esc(diffLabel)}</span>
            <span style="margin-left:8px;font-size:14px;color:#555;font-weight:600;">Lv. ${esc(s.level || '?')}</span>
            <span style="margin-left:auto;font-size:12px;color:#999;">${esc(s.date || '')}</span>
          </div>
          <div style="font-size:20px;font-weight:700;color:#222;line-height:1.2;margin-bottom:8px;">${esc(s.title || '(unknown)')}</div>
          <div style="display:flex;align-items:center;margin-bottom:8px;">
            <span style="font-size:28px;font-weight:800;color:${diffColor};letter-spacing:1px;">${esc(scoreFormatted)}</span>
            <span style="margin-left:12px;font-size:24px;font-weight:800;color:#d4537e;">${esc(s.rank || '')}</span>
            <span style="margin-left:auto;">${flags.join('')}</span>
          </div>
          <div style="display:flex;gap:6px;">
            ${judgeBox('CRITICAL', s.judges.cp, '#ffcc00')}
            ${judgeBox('PERFECT', s.judges.perfect, '#ff9966')}
            ${judgeBox('GREAT', s.judges.great, '#66cc66')}
            ${judgeBox('GOOD', s.judges.good, '#66aaff')}
            ${judgeBox('MISS', s.judges.miss, '#bbbbbb')}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#666;">
            <span>MAX COMBO: <b style="color:#222;">${esc(s.maxCombo)}</b></span>
            <span>FAST: <b style="color:#222;">${esc(s.fast)}</b> / LATE: <b style="color:#222;">${esc(s.late)}</b></span>
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

    // diagnostic
    LOG('list: total forms=', listDoc.querySelectorAll('form').length);
    LOG('list: forms w/ playlogDetail=', listDoc.querySelectorAll('form[action*="playlogDetail"]').length);
    LOG('list: input[name=idx] count=', listDoc.querySelectorAll('input[name="idx"]').length);
    LOG('list: input[name=token] count=', listDoc.querySelectorAll('input[name="token"]').length);

    // token: try multiple names
    let token = '';
    const tokenSelectors = ['input[name="token"]', 'input[name="_token"]', 'input[type="hidden"][name*="token" i]'];
    for (const sel of tokenSelectors) {
      const el = listDoc.querySelector(sel);
      if (el && el.value) { token = el.value; LOG('token found via', sel); break; }
    }
    if (!token) {
      alert('找不到 token，請確認你已登入並重新整理頁面後再試。');
      return;
    }

    // idx: collect all hidden idx inputs (each play row has one inside its form)
    const idxInputs = [...listDoc.querySelectorAll('input[name="idx"]')];
    let idxs = idxInputs.map((i) => i.value).filter(Boolean);
    // dedup while preserving order
    idxs = [...new Set(idxs)];
    LOG('list: idx values=', idxs);

    if (!idxs.length) {
      // last-ditch: look at form actions to extract idx from URL
      const actions = [...listDoc.querySelectorAll('form[action*="playlog"]')].map((f) => f.getAttribute('action'));
      LOG('list: form actions=', actions);
      alert('找不到任何遊玩紀錄。請開 DevTools Console 把 [Plate] 開頭的 log 貼回來。');
      return;
    }
    idxs = idxs.slice(0, 3);
    LOG('top idx:', idxs);

    const plays = [];
    for (const idx of idxs) {
      LOG('fetching detail idx=', idx);
      const body = new URLSearchParams({ idx, token }).toString();
      const res = await fetch('/mobile/record/playlogDetail/sendPlaylogDetail', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        WARN('detail fetch failed', idx, res.status);
        continue;
      }
      const html = await res.text();
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
    const playerDoc = await getDoc('/mobile/home/playerData');
    const player = parsePlayer(playerDoc);
    LOG('player', player);

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
})();
