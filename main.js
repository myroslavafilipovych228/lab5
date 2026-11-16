import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import superagent from 'superagent';

const program = new Command();

program
  .requiredOption('-h, --host <address>', 'server host address')
  .requiredOption('-p, --port <number>', 'server port number')
  .requiredOption('-c, --cache <path>', 'path to cache directory');

program.parse(process.argv);
const options = program.opts();

const port = Number(options.port);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('Error: Invalid port number.');
  process.exit(1);
}

const host = options.host;
const cacheDir = path.resolve(options.cache);

// Обробка методу GET
const handleGet = async (code, filePath, res) => {
  try {
    const cachedImage = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'X-Cache': 'HIT',
    });
    res.end(cachedImage);
    return;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    const response = await superagent
      .get(`https://http.cat/${code}`)
      .buffer(true)
      .parse(superagent.parse.image);

    const imageBuffer = response.body;
    await fs.writeFile(filePath, imageBuffer);

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'X-Cache': 'MISS',
    });
    res.end(imageBuffer);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Image for HTTP status ${code} not found.\n`);
  }
};

// Обробка методу PUT (збереження/заміна зображення в кеші)
const handlePut = (req, filePath, res) => {
  const chunks = [];

  req.on('data', (chunk) => {
    chunks.push(chunk);
  });

  req.on('end', async () => {
    try {
      const bodyBuffer = Buffer.concat(chunks);
      if (bodyBuffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request: Empty request body.\n');
        return;
      }

      await fs.writeFile(filePath, bodyBuffer);
      res.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Created\n');
    } catch (err) {
      console.error('PUT error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error.\n');
    }
  });

  req.on('error', (err) => {
    console.error('Request stream error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error.\n');
  });
};

// Обробка методу DELETE (видалення зображення з кешу)
const handleDelete = async (code, filePath, res) => {
  try {
    await fs.unlink(filePath);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Cached image for ${code} deleted.\n`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Cached image for ${code} not found.\n`);
    } else {
      throw err;
    }
  }
};

// Головний обробник HTTP-запитів
const requestHandler = async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://${host}:${port}`).pathname;
    const match = pathname.match(/^\/(\d{3})$/);

    if (!match) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: URL must contain a 3-digit HTTP status code (e.g. /200).\n');
      return;
    }

    const statusCode = match[1];
    const cacheFilePath = path.join(cacheDir, `${statusCode}.jpg`);

    if (req.method === 'GET') {
      await handleGet(statusCode, cacheFilePath, res);
    } else if (req.method === 'PUT') {
      handlePut(req, cacheFilePath, res);
    } else if (req.method === 'DELETE') {
      await handleDelete(statusCode, cacheFilePath, res);
    } else {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        Allow: 'GET, PUT, DELETE',
      });
      res.end(`Method ${req.method} is not allowed.\n`);
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error.\n');
  }
};

const startServer = async () => {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const server = http.createServer(requestHandler);

    server.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}/ (cache: ${cacheDir})`);
    });
  } catch (err) {
    console.error(`Startup error: ${err.message}`);
    process.exit(1);
  }
};

startServer();