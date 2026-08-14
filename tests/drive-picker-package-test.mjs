import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(repoRoot, 'app', 'community-plugins', 'dsh-client-ui-drive-picker');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const clientSource = readFileSync(join(packageRoot, 'client.js'), 'utf8');

assert.equal(manifest.name, '@dsh-community/dsh-client-ui-drive-picker');
assert.equal(manifest.dsh.client.platform, 'web');
assert.equal(manifest.exports['./client'], './client.js');

let registration;
vm.runInNewContext(clientSource, {
  window: {
    __ModuleLoader__: {
      load(value) {
        registration = value;
      },
    },
  },
});
assert.equal(registration.id, manifest.name);
const plugin = registration.factory(() => ({}));
assert.deepEqual(
  Array.from(plugin.driveCandidates({ home: 'C:\\Users\\Example' })),
  'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}:\\`),
);
assert.deepEqual(Array.from(plugin.driveCandidates({ home: '/home/example' })), []);

console.log('Drive picker package tests passed.');
