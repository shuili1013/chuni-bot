const SONGS_URL = 'https://dp4p6x0xfi5o9.cloudfront.net/chunithm/data.json';
const COVER_BASE = 'https://dp4p6x0xfi5o9.cloudfront.net/chunithm/img/cover';
const TTL_MS = 30 * 60 * 1000;

let cache = {
  byKey: new Map(),
  fetchedAt: 0,
};

function normalize(s) {
  return (s || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function key(title, diff) {
  return `${normalize(title)}|${(diff || '').toLowerCase()}`;
}

export async function refreshSongDb() {
  try {
    const res = await fetch(SONGS_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const songs = Array.isArray(json.songs) ? json.songs : [];
    const map = new Map();
    for (const s of songs) {
      const sheets = Array.isArray(s.sheets) ? s.sheets : [];
      for (const sh of sheets) {
        if (!sh.difficulty) continue;
        // arcade-songs 的 difficulty 名稱跟 SEGA 一致：basic/advanced/expert/master/ultima/worldsend
        map.set(key(s.title, sh.difficulty), {
          title: s.title,
          artist: s.artist || '',
          category: s.category || '',
          imageName: s.imageName || '',
          difficulty: sh.difficulty,
          level: sh.level || '',
          internalLevel: sh.internalLevel || '',
          internalLevelValue: sh.internalLevelValue ?? null,
          noteDesigner: sh.noteDesigner || '',
        });
      }
    }
    cache = { byKey: map, fetchedAt: Date.now() };
    console.log(`[songdb] loaded ${songs.length} songs, ${map.size} sheets`);
    return map.size;
  } catch (e) {
    console.warn('[songdb] refresh failed:', e.message);
    return 0;
  }
}

async function ensureFresh() {
  if (cache.fetchedAt === 0 || Date.now() - cache.fetchedAt > TTL_MS) {
    await refreshSongDb();
  }
}

export async function lookup(title, difficulty) {
  await ensureFresh();
  return cache.byKey.get(key(title, difficulty)) || null;
}

export function lookupSync(title, difficulty) {
  return cache.byKey.get(key(title, difficulty)) || null;
}

export function coverUrl(imageName) {
  if (!imageName) return '';
  return `${COVER_BASE}/${imageName}`;
}

// Kick off initial fetch on module load
refreshSongDb();
// Periodic refresh
setInterval(() => refreshSongDb(), TTL_MS);
