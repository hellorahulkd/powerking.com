#!/usr/bin/env node
/**
 * Tiny local preview server for dist/ — development only.
 * Mirrors GitHub Pages behaviour: clean URLs resolve to index.html and
 * anything unknown serves 404.html with a real 404 status.
 *
 *   npm run dev     build, then serve on http://localhost:4321
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // Block path traversal.
  const rel = path.normalize(clean).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    return null;
  }
  return file;
}

createServer(async (req, res) => {
  let file = await resolve(req.url);
  let status = 200;

  if (!file) {
    file = path.join(DIST, '404.html');
    status = 404;
  }

  try {
    const body = await readFile(file);
    res.writeHead(status, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => {
  process.stdout.write(`\n  Preview running at http://localhost:${PORT}\n  Ctrl+C to stop\n\n`);
});
