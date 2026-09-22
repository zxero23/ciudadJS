const http = require('http');
const fs = require('fs');
const path = require('path');

// 3000/3001 están tomados por otros servicios locales (bridge de WhatsApp y otra app)
const port = Number(process.env.PORT) || 3210;
const root = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // Nunca servir nada fuera de la carpeta del proyecto
  const filePath = path.join(root, urlPath);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      const code = err.code === 'ENOENT' || err.code === 'EISDIR' ? 404 : 500;
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(code === 404 ? '404 Not Found: ' + urlPath : '500 Server Error: ' + err.code);
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      // Sin caché: recargar siempre trae la última versión del juego
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(content); // Buffer tal cual: los binarios no se corrompen
  });
});

server.listen(port, () => {
  console.log(`CiudadJS en http://localhost:${port}/  (Ctrl+C para salir)`);
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE'
    ? `El puerto ${port} ya está en uso. Probá: PORT=3001 node server.js`
    : err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\nCerrando servidor...');
    server.close(() => process.exit(0));
  });
}
