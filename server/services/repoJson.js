// Generic loader for bot-committed JSON (paper trades, etc.).
// Disk first (fast), GitHub raw fallback + 5-min revalidation so new
// workflow results appear without a redeploy. Never throws — returns null.

import { readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GH_REPO = process.env.GH_REPO || 'bhalekarabhijit/alphabets';
const REVALIDATE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

const fileCache = new Map(); // abs path -> { mtime, data }
const mem = new Map();       // relPath -> { doc, fetchedAt }

function absPath(relPath) {
  return join(__dirname, '..', '..', relPath);
}

function loadDisk(abs) {
  try {
    const mtime = statSync(abs).mtimeMs;
    const hit = fileCache.get(abs);
    if (hit && hit.mtime === mtime) return hit.data;
    const data = JSON.parse(readFileSync(abs, 'utf-8'));
    fileCache.set(abs, { mtime, data });
    return data;
  } catch {
    return null;
  }
}

async function fetchRemote(relPath) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/main/${relPath}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Alphabets/1.0' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadRepoJson(relPath) {
  const now = Date.now();
  const entry = mem.get(relPath);
  if (entry && now - entry.fetchedAt < REVALIDATE_MS) return entry.doc;

  const abs = absPath(relPath);
  let doc = loadDisk(abs) || entry?.doc || null;

  const remote = await fetchRemote(relPath);
  if (remote && JSON.stringify(remote) !== JSON.stringify(doc)) {
    doc = remote;
    try {
      writeFileSync(abs, JSON.stringify(doc));
      fileCache.delete(abs);
    } catch { /* ephemeral/read-only FS: ignore */ }
  }

  mem.set(relPath, { doc, fetchedAt: now });
  return doc;
}
