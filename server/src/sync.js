import express from 'express';
import { stmts, playHash } from './db.js';

export const syncRouter = express.Router();

syncRouter.use(express.json({ limit: '512kb' }));

// CORS for the bookmarklet running on chunithm-net-eng.com
syncRouter.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function authToken(req) {
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return req.query.token || (req.body && req.body.token) || '';
}

syncRouter.post('/sync', (req, res) => {
  const token = authToken(req);
  if (!token) return res.status(401).json({ error: 'missing token' });

  const user = stmts.getUserByToken.get(token);
  if (!user) return res.status(401).json({ error: 'invalid token' });

  const { player, plays } = req.body || {};
  if (!player || !Array.isArray(plays)) {
    return res.status(400).json({ error: 'malformed body' });
  }

  const now = Date.now();
  stmts.updateProfile.run(
    player.name || '',
    player.rating || '',
    player.lv || '',
    player.title || '',
    player.avatar || '',
    player.team || '',
    now,
    user.discord_id,
  );

  let inserted = 0;
  for (const p of plays) {
    const hash = playHash(p);
    stmts.upsertPlay.run(
      user.discord_id,
      hash,
      p.title || '',
      p.difficulty || '',
      p.score | 0,
      p.rank || '',
      p.maxCombo | 0,
      (p.judges && p.judges.critical) | 0,
      (p.judges && p.judges.justice) | 0,
      (p.judges && p.judges.attack) | 0,
      (p.judges && p.judges.miss) | 0,
      p.flags && p.flags.clear ? 1 : 0,
      p.flags && p.flags.fc ? 1 : 0,
      p.flags && p.flags.aj ? 1 : 0,
      p.flags && p.flags.newRecord ? 1 : 0,
      p.coverFromSega || p.cover || '',
      p.date || '',
      now,
    );
    inserted++;
  }

  res.json({
    ok: true,
    discord_id: user.discord_id,
    plays: inserted,
    profile: {
      name: player.name || '',
      rating: player.rating || '',
      lv: player.lv || '',
    },
  });
});
