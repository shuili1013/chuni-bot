import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || './data';
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'chuni.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    sync_token TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    last_synced_at INTEGER,
    player_name TEXT,
    player_rating TEXT,
    player_lv TEXT,
    player_honor TEXT,
    player_avatar TEXT,
    player_team TEXT,
    player_avatar_layers TEXT
  );

  CREATE TABLE IF NOT EXISTS plays (
    discord_id TEXT NOT NULL,
    play_hash TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    difficulty TEXT,
    score INTEGER,
    rank TEXT,
    max_combo INTEGER,
    judge_critical INTEGER,
    judge_justice INTEGER,
    judge_attack INTEGER,
    judge_miss INTEGER,
    flag_clear INTEGER,
    flag_fc INTEGER,
    flag_aj INTEGER,
    flag_new INTEGER,
    cover_url TEXT,
    cover_url_hd TEXT,
    chart_level TEXT,
    chart_internal_level TEXT,
    played_at TEXT,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (discord_id, play_hash)
  );

  CREATE INDEX IF NOT EXISTS idx_plays_user_played
    ON plays (discord_id, played_at DESC);
`);

// Migrations for existing DBs (idempotent — ignore "duplicate column" errors)
const migrations = [
  'ALTER TABLE plays ADD COLUMN artist TEXT',
  'ALTER TABLE plays ADD COLUMN cover_url_hd TEXT',
  'ALTER TABLE plays ADD COLUMN chart_level TEXT',
  'ALTER TABLE plays ADD COLUMN chart_internal_level TEXT',
  'ALTER TABLE users ADD COLUMN player_avatar_layers TEXT',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column exists */ }
}

export function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

export function playHash(p) {
  const k = `${p.played_at || ''}|${p.title || ''}|${p.difficulty || ''}|${p.score || 0}`;
  return crypto.createHash('sha256').update(k).digest('hex').slice(0, 24);
}

export const stmts = {
  getUserByDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
  getUserByToken: db.prepare('SELECT * FROM users WHERE sync_token = ?'),
  insertUser: db.prepare(`
    INSERT INTO users (discord_id, sync_token, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET sync_token = excluded.sync_token
  `),
  updateProfile: db.prepare(`
    UPDATE users SET
      player_name = ?,
      player_rating = ?,
      player_lv = ?,
      player_honor = ?,
      player_avatar = ?,
      player_team = ?,
      player_avatar_layers = ?,
      last_synced_at = ?
    WHERE discord_id = ?
  `),
  upsertPlay: db.prepare(`
    INSERT INTO plays (
      discord_id, play_hash, title, artist, difficulty, score, rank, max_combo,
      judge_critical, judge_justice, judge_attack, judge_miss,
      flag_clear, flag_fc, flag_aj, flag_new,
      cover_url, cover_url_hd, chart_level, chart_internal_level,
      played_at, synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id, play_hash) DO UPDATE SET
      artist = excluded.artist,
      score = excluded.score,
      rank = excluded.rank,
      max_combo = excluded.max_combo,
      judge_critical = excluded.judge_critical,
      judge_justice = excluded.judge_justice,
      judge_attack = excluded.judge_attack,
      judge_miss = excluded.judge_miss,
      flag_clear = excluded.flag_clear,
      flag_fc = excluded.flag_fc,
      flag_aj = excluded.flag_aj,
      flag_new = excluded.flag_new,
      cover_url = excluded.cover_url,
      cover_url_hd = excluded.cover_url_hd,
      chart_level = excluded.chart_level,
      chart_internal_level = excluded.chart_internal_level,
      synced_at = excluded.synced_at
  `),
  recentPlays: db.prepare(`
    SELECT * FROM plays
    WHERE discord_id = ?
    ORDER BY played_at DESC, synced_at DESC
    LIMIT ?
  `),
  getPlay: db.prepare(`
    SELECT * FROM plays WHERE discord_id = ? AND play_hash = ?
  `),
  deleteUser: db.prepare('DELETE FROM users WHERE discord_id = ?'),
  deleteUserPlays: db.prepare('DELETE FROM plays WHERE discord_id = ?'),
};

export function ensureUser(discordId) {
  const existing = stmts.getUserByDiscord.get(discordId);
  if (existing) return existing;
  const token = newToken();
  stmts.insertUser.run(discordId, token, Date.now());
  return stmts.getUserByDiscord.get(discordId);
}

export function rotateToken(discordId) {
  const token = newToken();
  stmts.insertUser.run(discordId, token, Date.now());
  return token;
}

export function deleteAccount(discordId) {
  stmts.deleteUserPlays.run(discordId);
  stmts.deleteUser.run(discordId);
}
