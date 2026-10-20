/** Local speech-only host. Credentials stay here; it serves no application or source files. */
import { createServer } from 'node:http';
import { loadEnv } from 'vite';
import { createSpeechMiddleware, readSpeechEnv } from './speechProxy';

const taskEnv = () => loadEnv('development', process.cwd(), '');
const middleware = createSpeechMiddleware({
  env: () => readSpeechEnv(process.cwd(), 'development'),
  allowedExtensionOrigins: () => (process.env.GO_SPEECH_ALLOWED_EXTENSION_ORIGINS ?? taskEnv().GO_SPEECH_ALLOWED_EXTENSION_ORIGINS ?? '')
    .split(',').map((origin) => origin.trim()).filter(Boolean),
});
const port = Number(process.env.GO_SPEECH_PORT ?? 8791);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('GO_SPEECH_PORT must be an unprivileged port number.');
const server = createServer((req, res) => {
  void middleware(req, res, () => { res.statusCode = 404; res.end('Not found'); });
});
server.listen(port, '127.0.0.1', () => console.log(`GoListen speech proxy: http://127.0.0.1:${port}/api/speech`));
server.on('error', () => { console.error('The local speech proxy could not start. Check that its port is free.'); process.exitCode = 1; });
