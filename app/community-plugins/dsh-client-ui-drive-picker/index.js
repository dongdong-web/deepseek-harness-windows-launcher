import { timingSafeEqual } from 'node:crypto';

export const LAUNCHER_EXIT_ENDPOINT = '/launcher/exit';
export const LAUNCHER_EXIT_TOKEN_HEADER = 'x-dsh-launcher-exit-token';

function tokenMatches(candidate, expected) {
  if (typeof candidate !== 'string') return false;
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function injectExitToken(html, token) {
  const meta = `<meta name="dsh-launcher-exit-token" content="${token}">`;
  return html.includes('<head>') ? html.replace('<head>', `<head>${meta}`) : `${meta}${html}`;
}

// The node half serves one loopback-only, token-protected exit request. The
// DSH launcher provides appExit, so the child disposes gracefully and the
// parent launcher removes its normal instance lock.
export function apply(ctx) {
  const token = process.env.DSH_LAUNCHER_EXIT_TOKEN;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Community launcher exit token is missing or invalid.');
  }

  // Loader entries initialize concurrently. Defer registration until the web
  // server and launcher-provided exit service are both active.
  ctx.inject(['webServer', 'appExit'], (exitCtx) => {
    exitCtx.effect(() => exitCtx.webServer.tapIndex((html) => injectExitToken(html, token)), 'community-launcher-exit: token meta');
    exitCtx.effect(() => exitCtx.webServer.register({
      kind: 'exact',
      path: LAUNCHER_EXIT_ENDPOINT,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          res.end();
          return;
        }
        const supplied = req.headers[LAUNCHER_EXIT_TOKEN_HEADER];
        if (!tokenMatches(Array.isArray(supplied) ? supplied[0] : supplied, token)) {
          res.writeHead(403, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
          res.end('{"error":"forbidden"}');
          return;
        }
        res.writeHead(202, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"stopping":true}');
        queueMicrotask(() => exitCtx.appExit(0));
      },
    }), 'community-launcher-exit: endpoint');
  });
}
