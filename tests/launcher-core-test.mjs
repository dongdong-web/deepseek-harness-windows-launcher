import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildHarnessArguments,
  buildHarnessEnvironment,
  ensureCommunityPluginProfileFallback,
  findAvailablePort,
  isPortAvailable,
  parseCommandLine,
  readInstance,
  resolveLauncherPaths,
  sanitizeLogText,
} from '../launcher/launcher.mjs';

const testRoot = join(tmpdir(), `dsh-launcher-test-${process.pid}-${Date.now()}`);

try {
  assert.deepEqual(parseCommandLine([]).command, 'start');
  assert.equal(parseCommandLine(['start', '--port', '4001', '--no-browser']).options.port, 4001);
  assert.throws(() => parseCommandLine(['start', '--port', '80']), /1025/);
  assert.throws(() => parseCommandLine(['unknown']), /Unknown command/);
  assert.equal(sanitizeLogText('failure for sk-abcdefghijklmnopqrstuvwxyz'), 'failure for [REDACTED_API_KEY]');

  const paths = resolveLauncherPaths('C:/portable/DeepSeekHarness', { LOCALAPPDATA: testRoot, PATH: 'C:/Windows' });
  const environment = buildHarnessEnvironment(paths, {
    LOCALAPPDATA: testRoot,
    NODE_OPTIONS: '--inspect',
    NODE_PATH: 'C:/bad',
    PATH: 'C:/Windows',
    npm_config_prefix: 'C:/bad',
  });
  assert.equal(environment.DSH_HOME, join(testRoot, 'DeepSeekHarness', 'dsh'));
  assert.equal(paths.workspaceRoot, join(testRoot, 'DeepSeekHarness', 'workspace'));
  assert.ok(environment.PATH.startsWith(normalize('C:/portable/DeepSeekHarness/runtime/pwsh')));
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.NODE_PATH, undefined);
  assert.equal(environment.npm_config_prefix, undefined);
  assert.deepEqual(buildHarnessArguments(paths, 32000), [
    paths.dshEntry,
    '--profile', 'web',
    '--patch', paths.directoryPickerPatchPath,
    '--host', '127.0.0.1',
    '--port', '32000',
  ]);

  const firstPluginDirectory = join(testRoot, 'drive-picker-one');
  const secondPluginDirectory = join(testRoot, 'drive-picker-two');
  for (const pluginDirectory of [firstPluginDirectory, secondPluginDirectory]) {
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(pluginDirectory, 'client.js'), 'export {};\n');
  }
  const pluginPaths = {
    ...paths,
    drivePickerPackageDirectory: firstPluginDirectory,
    drivePickerProfileLink: join(testRoot, 'DeepSeekHarness', 'dsh', 'profiles', 'node_modules', '@dsh-community', 'dsh-client-ui-drive-picker'),
  };
  ensureCommunityPluginProfileFallback(pluginPaths);
  assert.equal(lstatSync(pluginPaths.drivePickerProfileLink).isSymbolicLink(), true);
  assert.equal(resolve(realpathSync(pluginPaths.drivePickerProfileLink)), resolve(realpathSync(firstPluginDirectory)));
  ensureCommunityPluginProfileFallback({ ...pluginPaths, drivePickerPackageDirectory: secondPluginDirectory });
  assert.equal(resolve(realpathSync(pluginPaths.drivePickerProfileLink)), resolve(realpathSync(secondPluginDirectory)));
  rmSync(pluginPaths.drivePickerProfileLink, { recursive: true, force: true });
  mkdirSync(pluginPaths.drivePickerProfileLink, { recursive: true });
  assert.throws(() => ensureCommunityPluginProfileFallback(pluginPaths), /not launcher-managed/);

  const port = await findAvailablePort(32000, 5);
  assert.equal(await isPortAvailable(port), true);

  mkdirSync(join(testRoot, 'DeepSeekHarness', 'launcher'), { recursive: true });
  writeFileSync(paths.lockPath, JSON.stringify({ launcherPid: process.pid, port: 32000 }));
  assert.equal(readInstance(paths.lockPath).active, true);
  writeFileSync(paths.lockPath, JSON.stringify({ launcherPid: 99999999, port: 32000 }));
  assert.equal(readInstance(paths.lockPath).active, false);
  writeFileSync(paths.lockPath, '{');
  assert.equal(readInstance(paths.lockPath).initializing, true);
  assert.equal(readInstance(paths.lockPath, Date.now() + 61_000).active, false);

  console.log('Launcher core tests passed.');
} finally {
  if (existsSync(testRoot)) {
    rmSync(testRoot, { recursive: true, force: true });
  }
}
