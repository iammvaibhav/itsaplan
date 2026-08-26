import { headers } from 'next/headers';
import { connection } from 'next/server';
import { serverRuntimeEnv } from '@/utils/runtimeEnv';

// Publishes the per-instance origins to the browser. It renders before any bundle
// script, so a client module reading runtimeEnv() at import time already sees them.
// `connection()` keeps the values out of a prerender: a page rendered at build time
// would carry the building machine's environment into the HTML.
// `<` is escaped because the JSON is written into an inline script, where a
// `</script>` inside a value would end the element.

// The API prefix this app serves from its own origin via the next.config.ts rewrite.
const SAME_ORIGIN_API_PREFIX = '/__api';

// Port the TLS proxy terminates on (tls-proxy/tls-proxy.mjs), i.e. the one origin
// reaching this app over https.
const ITSAPLAN_TLS_PORT = 8443;

export default async function RuntimeEnvScript() {
  await connection();
  const env = serverRuntimeEnv();

  // Pin the browser's API base to the origin the page was actually served from.
  //
  // One deployment answers on several origins: the TLS proxy on :8443 for a
  // remote browser, and plain HTTP on :3001 for the Paseo desktop embed, which
  // cannot speak TLS to a self-signed certificate. Any single hardcoded API
  // origin is wrong for whichever one it is not — an HTTPS page calling the HTTP
  // origin is blocked as mixed content, and an HTTP page calling the HTTPS origin
  // meets the certificate it was trying to avoid. Since the API is proxied under
  // this app's own origin anyway, the right base is always "where you loaded the
  // page from" + the prefix.
  //
  // Only the CLIENT value is derived. Server-side callers keep the absolute env
  // value, which better-auth requires to be parseable when it builds its client
  // at module scope.
  let apiUrl = env.apiUrl;
  // A deployment pointing at a genuinely separate API host is not ours to rewrite.
  if (apiUrl.endsWith(SAME_ORIGIN_API_PREFIX)) {
    const headerList = await headers();
    const forwardedHost = headerList.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwardedHost || headerList.get('host')?.trim();
    if (host) {
      // Port wins over x-forwarded-proto here, which is the opposite of the usual
      // precedence and deliberate: the TLS proxy is a TCP splice that sets no
      // forwarded headers, and Next then synthesises `x-forwarded-proto: http`
      // from its own plain listener. Trusting that header rewrote an HTTPS page's
      // API base to http:// and the browser blocked it as mixed content. The
      // proxy's TLS port is ours to know, so infer from it first and only fall
      // back to the header for an origin we do not recognise.
      const forwardedProto = headerList.get('x-forwarded-proto')?.split(',')[0]?.trim();
      const proto = host.endsWith(`:${ITSAPLAN_TLS_PORT}`) ? 'https' : forwardedProto || 'http';
      apiUrl = `${proto}://${host}${SAME_ORIGIN_API_PREFIX}`;
    }
  }

  const json = JSON.stringify({ ...env, apiUrl }).replace(/</g, '\\u003c');
  return <script dangerouslySetInnerHTML={{ __html: `window.__ITSAPLAN_ENV__=${json}` }} />;
}
