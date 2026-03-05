const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const port = Number(process.env.PLAYLIST_PORT ?? 4000);
const root = process.cwd();
const v1Path = join(root, 'mock', 'sample-playlists', 'v1.json');
const v2Path = join(root, 'mock', 'sample-playlists', 'v2.json');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url === '/playlist/v1') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readJson(v1Path)));
    return;
  }

  if (url === '/playlist/v2') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readJson(v2Path)));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'Not found',
      available: ['/health', '/playlist/v1', '/playlist/v2'],
    }),
  );
});

server.listen(port, () => {
  console.log(`Mock playlist server listening on http://localhost:${port}`);
});

