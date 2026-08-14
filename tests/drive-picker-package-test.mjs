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
assert.equal(manifest.exports['./package.json'], './package.json');
assert.match(clientSource, /sidebar\.footer\.action/);
assert.match(clientSource, /\/launcher\/exit/);

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

let exitSlotRegistration;
plugin.apply({
  effect(callback) {
    callback();
  },
  locale: {
    bind() {
      return (key) => key;
    },
    register() {
      return () => {};
    },
  },
  slots: {
    inject(name, callback) {
      if (name !== 'sidebar.footer.action') return () => {};
      const registrations = callback();
      for (const registrationValue of registrations) exitSlotRegistration = registrationValue;
      return () => {};
    },
    register(options, component) {
      return { options, component };
    },
  },
});
assert.equal(exitSlotRegistration.options.name, 'sidebar.footer.action');
assert.equal(exitSlotRegistration.options.id, 'launcher-exit');
assert.equal(typeof exitSlotRegistration.component, 'function');

console.log('Drive picker package tests passed.');
