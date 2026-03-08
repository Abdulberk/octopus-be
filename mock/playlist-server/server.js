const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const port = Number(process.env.PLAYLIST_PORT ?? 4000);
const root = process.cwd();
const v1Path = join(root, 'mock', 'sample-playlists', 'v1.json');
const v2Path = join(root, 'mock', 'sample-playlists', 'v2.json');
const assetsRoot = join(root, 'mock', 'assets');

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sendAsset(res, filePath) {
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': inferContentType(filePath),
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Asset not found' }));
  }
}

function toAbsolutePlaylist(payload, req) {
  const host = req.headers.host ?? `localhost:${port}`;
  const baseUrl = `http://${host}`;

  return {
    ...payload,
    playlist: payload.playlist.map((item) => ({
      ...item,
      url: item.url.startsWith('/') ? `${baseUrl}${item.url}` : item.url,
    })),
  };
}

function inferContentType(filePath) {
  if (filePath.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  if (filePath.endsWith('.png')) {
    return 'image/png';
  }

  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';

  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url === '/playlist/v1') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(toAbsolutePlaylist(readJson(v1Path), req)));
    return;
  }

  if (url === '/playlist/v2') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(toAbsolutePlaylist(readJson(v2Path), req)));
    return;
  }

  if (url.startsWith('/assets/')) {
    const assetName = url.replace('/assets/', '');
    sendAsset(res, join(assetsRoot, assetName));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'Not found',
      available: ['/health', '/playlist/v1', '/playlist/v2', '/assets/*'],
    }),
  );
});

server.listen(port, () => {
  console.log(`Mock playlist server listening on http://localhost:${port}`);
});
