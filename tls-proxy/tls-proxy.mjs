// TLS-terminating passthrough proxy for itsaplan, so browsers on other machines
// get a secure context (https://host:8443) and Web Crypto works. Terminates TLS
// here and splices the decrypted byte stream straight onto the plain-HTTP backend
// — no HTTP parsing, so WebSocket upgrades (Next HMR), SSE streams and cookies
// pass through untouched. The backends keep serving plain HTTP on their own ports,
// so existing http:// access keeps working.
//
//   0.0.0.0:8443 -> 127.0.0.1:3001  (Next.js web)
//   0.0.0.0:8444 -> 127.0.0.1:3000  (API)
//
// Run: bun run tls-proxy.mjs   (cert/key live next to this file)

import { createServer as createTlsServer } from 'node:tls';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tlsOptions = {
  key: readFileSync(join(here, 'key.pem')),
  cert: readFileSync(join(here, 'cert.pem')),
};

const ROUTES = [
  { name: 'web', listen: Number(process.env.TLS_WEB_PORT ?? 8443), upstream: 3001 },
  { name: 'api', listen: Number(process.env.TLS_API_PORT ?? 8444), upstream: 3000 },
];

for (const route of ROUTES) {
  const server = createTlsServer(tlsOptions, (client) => {
    const upstream = connect(route.upstream, '127.0.0.1');
    client.pipe(upstream);
    upstream.pipe(client);

    const teardown = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', teardown);
    upstream.on('error', teardown);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });

  server.on('tlsClientError', (err) => {
    console.error(`[tls-proxy:${route.name}] handshake error:`, err.message);
  });

  server.listen(route.listen, '0.0.0.0', () => {
    console.log(
      `[tls-proxy:${route.name}] https://0.0.0.0:${route.listen} -> http://127.0.0.1:${route.upstream}`,
    );
  });
}
