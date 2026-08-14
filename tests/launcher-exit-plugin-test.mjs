import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = await import(pathToFileURL(join(repoRoot, 'app', 'community-plugins', 'dsh-client-ui-drive-picker', 'index.js')).href);
const originalToken = process.env.DSH_LAUNCHER_EXIT_TOKEN;
const token = 'a'.repeat(64);
let route;
let indexTransform;
let exitCode;

function responseCapture() {
  return {
    body: undefined,
    headers: undefined,
    status: undefined,
    end(body) {
      this.body = body;
    },
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
  };
}

try {
  process.env.DSH_LAUNCHER_EXIT_TOKEN = token;
  const webServer = {
    register(value) {
      route = value;
      return () => {};
    },
    tapIndex(transform) {
      indexTransform = transform;
      return () => {};
    },
  };
  const ctx = {
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['webServer', 'appExit']);
      callback({
        webServer,
        appExit: (code) => { exitCode = code; },
        effect(effect) {
          effect();
        },
      });
    },
  };

  plugin.apply(ctx);
  assert.equal(route.path, plugin.LAUNCHER_EXIT_ENDPOINT);
  assert.equal(route.kind, 'exact');
  assert.match(indexTransform('<html><head></head></html>'), /name="dsh-launcher-exit-token" content="a{64}"/);

  const getResponse = responseCapture();
  route.handler({ method: 'GET', headers: {} }, getResponse);
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.Allow, 'POST');

  const forbiddenResponse = responseCapture();
  route.handler({ method: 'POST', headers: { [plugin.LAUNCHER_EXIT_TOKEN_HEADER]: 'wrong' } }, forbiddenResponse);
  assert.equal(forbiddenResponse.status, 403);

  const acceptedResponse = responseCapture();
  route.handler({ method: 'POST', headers: { [plugin.LAUNCHER_EXIT_TOKEN_HEADER]: token } }, acceptedResponse);
  assert.equal(acceptedResponse.status, 202);
  await Promise.resolve();
  assert.equal(exitCode, 0);

  console.log('Launcher exit plugin tests passed.');
} finally {
  if (originalToken === undefined) delete process.env.DSH_LAUNCHER_EXIT_TOKEN;
  else process.env.DSH_LAUNCHER_EXIT_TOKEN = originalToken;
}
