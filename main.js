import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';

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

const requestHandler = async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Proxy server is running\n');
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