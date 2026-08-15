import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 3080;
const MAX_PORT_ATTEMPTS = 20;
const START_TIMEOUT_MS = 45_000;
const LOCK_INITIALIZATION_WINDOW_MS = 60_000;
const API_KEY_PATTERN = /\bsk-[a-zA-Z0-9_-]{12,}\b/g;

export function sanitizeLogText(value) {
  return String(value).replace(API_KEY_PATTERN, '[REDACTED_API_KEY]');
}

export function createLauncherExitToken() {
  return randomBytes(32).toString('hex');
}

export function parseCommandLine(argumentsList) {
  const args = [...argumentsList];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'start';
  const options = {
    dataRoot: process.env.DSH_LAUNCHER_DATA_ROOT,
    lan: false,
    noBrowser: false,
    port: DEFAULT_PORT,
    workspace: undefined,
  };

  while (args.length > 0) {
    const argument = args.shift();
    if (argument === '--no-browser') {
      options.noBrowser = true;
      continue;
    }
    if (argument === '--lan') {
      options.lan = true;
      continue;
    }
    if (argument === '--port' || argument === '--workspace' || argument === '--data-root') {
      const value = args.shift();
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--port') {
        const parsedPort = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedPort) || parsedPort < 1025 || parsedPort > 65535) {
          throw new Error('--port must be an integer between 1025 and 65535.');
        }
        options.port = parsedPort;
      } else if (argument === '--workspace') {
        options.workspace = value;
      } else {
        options.dataRoot = value;
      }
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      return { command: 'help', options };
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (!['start', 'status', 'stop', 'restart', 'open', 'help'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  return { command, options };
}

export function resolveLauncherPaths(runtimeRoot, environment = process.env, dataRootOverride) {
  const root = resolve(runtimeRoot);
  const localAppData = dataRootOverride || environment.LOCALAPPDATA || environment.APPDATA;
  const dataRoot = resolve(localAppData || join(homedir(), 'AppData', 'Local'), 'DeepSeekHarness');
  return {
    dataRoot,
    directoryPickerPatchPath: join(root, 'launcher', 'browse-directory-picker.patch.yml'),
    dshEntry: join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    drivePickerPackageDirectory: join(root, 'app', 'node_modules', '@dsh-community', 'dsh-client-ui-drive-picker'),
    drivePickerProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', '@dsh-community', 'dsh-client-ui-drive-picker'),
    fileExplorerPackageDirectory: join(root, 'app', 'node_modules', 'dsh-file-explorer'),
    fileExplorerProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', 'dsh-file-explorer'),
    chatOutlinePackageDirectory: join(root, 'app', 'node_modules', 'dsh-chat-outline'),
    chatOutlineProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', 'dsh-chat-outline'),
    costMeterPackageDirectory: join(root, 'app', 'node_modules', '@steven-wu', 'dsh-cost-meter'),
    costMeterProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', '@steven-wu', 'dsh-cost-meter'),
    balanceTidePackageDirectory: join(root, 'app', 'node_modules', 'dsh-balance-tide'),
    balanceTideProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', 'dsh-balance-tide'),
    sessionDeletePackageDirectory: join(root, 'app', 'node_modules', '@huanlin', 'dsh-plugin-session-delete'),
    sessionDeleteProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', '@huanlin', 'dsh-plugin-session-delete'),
    dingPackageDirectory: join(root, 'app', 'node_modules', 'dsh-ding'),
    dingProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', 'dsh-ding'),
    lanPassPackageDirectory: join(root, 'app', 'node_modules', 'dsh-lan-pass'),
    lanPassProfileLink: join(dataRoot, 'dsh', 'profiles', 'node_modules', 'dsh-lan-pass'),
    profilePatchPath: join(dataRoot, 'dsh', 'profiles', 'web', 'cordis.patch.yml'),
    profilePatchBackupPath: join(dataRoot, 'dsh', 'profiles', 'web', 'cordis.patch.yml.launcher-bak'),
    lockPath: join(dataRoot, 'launcher', 'instance.json'),
    logRoot: join(dataRoot, 'logs'),
    nodeDirectory: join(root, 'runtime', 'node'),
    nodeExe: join(root, 'runtime', 'node', 'node.exe'),
    pwshDirectory: join(root, 'runtime', 'pwsh'),
    runtimeRoot: root,
    dshHome: join(dataRoot, 'dsh'),
    workspaceRoot: join(dataRoot, 'workspace'),
  };
}

export function buildHarnessEnvironment(paths, environment = process.env) {
  const sanitizedEnvironment = { ...environment };
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NPM_CONFIG_PREFIX',
    'NPM_CONFIG_USERCONFIG',
    'DSH_LAUNCHER_EXIT_TOKEN',
    'npm_config_prefix',
    'npm_config_userconfig',
  ]) {
    delete sanitizedEnvironment[name];
  }

  sanitizedEnvironment.PATH = `${paths.pwshDirectory};${paths.nodeDirectory};${environment.PATH || ''}`;
  sanitizedEnvironment.DSH_HOME = paths.dshHome;
  return sanitizedEnvironment;
}

export async function isPortAvailable(port) {
  return await new Promise((resolveAvailability) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolveAvailability(false));
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolveAvailability(true));
    });
  });
}

export async function findAvailablePort(firstPort, attempts = MAX_PORT_ATTEMPTS) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = firstPort + offset;
    if (candidate > 65535) {
      break;
    }
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No free local port was found between ${firstPort} and ${firstPort + attempts - 1}.`);
}

export function isProcessAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return false;
  }
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function readInstance(lockPath, now = Date.now()) {
  if (!existsSync(lockPath)) {
    return { active: false, instance: undefined };
  }

  try {
    const instance = JSON.parse(readFileSync(lockPath, 'utf8'));
    const active = isProcessAlive(instance.launcherPid) || isProcessAlive(instance.harnessPid);
    return { active, instance };
  } catch {
    try {
      const isInitializing = now - statSync(lockPath).mtimeMs < LOCK_INITIALIZATION_WINDOW_MS;
      return {
        active: isInitializing,
        initializing: isInitializing,
        instance: isInitializing ? { initializing: true } : undefined,
      };
    } catch {
      return { active: false, instance: undefined };
    }
  }
}

function ensureRuntimeFiles(paths) {
  for (const requiredPath of [
    paths.nodeExe,
    paths.dshEntry,
    paths.pwshDirectory,
    paths.directoryPickerPatchPath,
    join(paths.drivePickerPackageDirectory, 'package.json'),
    join(paths.drivePickerPackageDirectory, 'client.js'),
    join(paths.fileExplorerPackageDirectory, 'package.json'),
    join(paths.fileExplorerPackageDirectory, 'lib', 'client.js'),
    join(paths.chatOutlinePackageDirectory, 'package.json'),
    join(paths.chatOutlinePackageDirectory, 'lib', 'client.js'),
    join(paths.costMeterPackageDirectory, 'package.json'),
    join(paths.costMeterPackageDirectory, 'lib', 'client.js'),
    join(paths.balanceTidePackageDirectory, 'package.json'),
    join(paths.balanceTidePackageDirectory, 'client', 'client.js'),
    join(paths.balanceTidePackageDirectory, 'src', 'index.js'),
    join(paths.sessionDeletePackageDirectory, 'package.json'),
    join(paths.sessionDeletePackageDirectory, 'src', 'client.js'),
    join(paths.sessionDeletePackageDirectory, 'src', 'index.js'),
    join(paths.dingPackageDirectory, 'package.json'),
    join(paths.dingPackageDirectory, 'lib', 'client.js'),
    join(paths.dingPackageDirectory, 'lib', 'index.js'),
    join(paths.dingPackageDirectory, 'notify.ps1'),
    join(paths.lanPassPackageDirectory, 'package.json'),
    join(paths.lanPassPackageDirectory, 'lib', 'index.js'),
  ]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Required private runtime path is missing: ${requiredPath}`);
    }
  }
}

export function ensureCommunityPluginProfileFallback(paths) {
  ensureProfileFallbackLink(paths.fileExplorerPackageDirectory, paths.fileExplorerProfileLink);
  ensureProfileFallbackLink(paths.drivePickerPackageDirectory, paths.drivePickerProfileLink);
  ensureProfileFallbackLink(paths.chatOutlinePackageDirectory, paths.chatOutlineProfileLink);
  ensureProfileFallbackLink(paths.costMeterPackageDirectory, paths.costMeterProfileLink);
  ensureProfileFallbackLink(paths.balanceTidePackageDirectory, paths.balanceTideProfileLink);
  ensureProfileFallbackLink(paths.sessionDeletePackageDirectory, paths.sessionDeleteProfileLink);
  ensureProfileFallbackLink(paths.dingPackageDirectory, paths.dingProfileLink);
  ensureProfileFallbackLink(paths.lanPassPackageDirectory, paths.lanPassProfileLink);
}

const MANAGED_SECTION_START = '# --- DeepSeek Harness Community Launcher: managed section (start) ---';
const MANAGED_SECTION_END = '# --- DeepSeek Harness Community Launcher: managed section (end) ---';
const LAN_SECTION_START = '# --- DeepSeek Harness Community Launcher: LAN access (start) ---';
const LAN_SECTION_END = '# --- DeepSeek Harness Community Launcher: LAN access (end) ---';

/**
 * Merge the launcher's plugin roster (the --patch true source) into the web
 * profile's own cordis.patch.yml, which DSH's Cordis HMR watches. This is what
 * makes plugin changes hot-reloadable without restarting the service.
 *
 * Only the managed section (between the markers) is replaced; any user-authored
 * patch content above or below it is preserved. The previous profile patch is
 * backed up first so a failed boot can be rolled back.
 * @param paths - resolved launcher paths.
 * @returns the new profile patch text.
 */
export function syncManagedPatches(paths, lan = false) {
  const source = readFileSync(paths.directoryPickerPatchPath, 'utf8');
  const profilePath = paths.profilePatchPath;

  let existing = '';
  if (existsSync(profilePath)) {
    existing = readFileSync(profilePath, 'utf8');
    // Back up the previous state (before this sync) for failure rollback.
    writeFileSync(paths.profilePatchBackupPath, existing, 'utf8');
  }

  // Strip the previous managed section AND any leftover LAN block, preserving
  // user content on both sides. The LAN block is removed unconditionally so a
  // previous --lan start cannot leave 0.0.0.0 bound after LAN is turned off.
  let withoutManaged = existing.replace(
    new RegExp(`\\s*${escapeRegExp(MANAGED_SECTION_START)}[\\s\\S]*?${escapeRegExp(MANAGED_SECTION_END)}\\s*`),
    '',
  ).replace(
    new RegExp(`\\s*${escapeRegExp(LAN_SECTION_START)}[\\s\\S]*?${escapeRegExp(LAN_SECTION_END)}\\s*`),
    '',
  ).trim();

  // A bare `[]` is DSH's empty-profile sentinel. It is a complete YAML document,
  // so the managed block sequence cannot follow it without a `---` separator.
  // Treat it as empty so the managed section becomes the sole top-level list.
  if (withoutManaged === '[]') {
    withoutManaged = '';
  }

  // When LAN mode is on, additionally override the webserver bind to all
  // interfaces. This is the official schema value (dsh-host-webserver allows
  // 127.0.0.1 | 0.0.0.0); it also enables DSH's LAN-trust fence, which derives
  // the LAN display addresses and trusts them for browser RPCs. The
  // dsh-lan-pass plugin provides the password gate for remote devices.
  const lanBlock = lan
    ? [
        '',
        '# --- DeepSeek Harness Community Launcher: LAN access (start) ---',
        '# Binds the Web UI to all interfaces so phones on the same network can',
        '# reach it. The dsh-lan-pass plugin gates remote access with a password;',
        '# localhost access is never intercepted.',
        '- id: webserver',
        '  config:',
        "    host: '0.0.0.0'",
        '    port: !!js ctx.webStartup.port ?? 3080',
        '# --- DeepSeek Harness Community Launcher: LAN access (end) ---',
        '',
      ].join('\n')
    : '';

  const managed = [
    '',
    MANAGED_SECTION_START,
    '# Managed by the community launcher for hot-reloadable plugins. DSH watches',
    '# this profile patch layer via Cordis HMR: editing the roster below applies',
    '# without restarting. Do not edit this section by hand — edit the launcher',
    '# source instead: launcher/browse-directory-picker.patch.yml',
    source.trim(),
    lanBlock,
    MANAGED_SECTION_END,
    '',
  ].join('\n');

  const next = [withoutManaged, managed].filter((part) => part.trim() !== '').join('\n') + '\n';
  writeFileSync(profilePath, next, 'utf8');
  return next;
}

/** Escape a literal string for use inside a RegExp constructor. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureProfileFallbackLink(targetDirectory, profileLink) {
  let existing;
  try {
    existing = lstatSync(profileLink);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (existing) {
    if (!existing.isSymbolicLink()) {
      throw new Error(`Community plugin path already exists and is not launcher-managed: ${profileLink}`);
    }
    try {
      if (resolve(realpathSync(profileLink)) === resolve(realpathSync(targetDirectory))) {
        return;
      }
    } catch {
      // The runtime may have moved after an upgrade; replace only this managed link.
    }
    unlinkSync(profileLink);
  }

  mkdirSync(dirname(profileLink), { recursive: true });
  symlinkSync(targetDirectory, profileLink, 'junction');
}

export function buildHarnessArguments(paths, port) {
  // The plugin roster is merged into the profile's own cordis.patch.yml (see
  // syncManagedPatches) so Cordis HMR watches it and hot-reloads plugin
  // changes. No --patch overlay is passed here: passing both would register
  // the same plugin ids twice and fail the loader tree.
  return [
    paths.dshEntry,
    '--profile', 'web',
    '--host', '127.0.0.1',
    '--port', String(port),
  ];
}

function ensureContainedPath(root, target, label) {
  const relativePath = relative(root, target);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must be inside ${root}.`);
  }
}

function createLaunchLock(paths, instance) {
  mkdirSync(dirname(paths.lockPath), { recursive: true });
  const descriptor = openSync(paths.lockPath, 'wx');
  try {
    writeFileSync(descriptor, `${JSON.stringify(instance, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function writeInstance(paths, instance) {
  writeFileSync(paths.lockPath, `${JSON.stringify(instance, null, 2)}\n`, 'utf8');
}

function removeLock(paths) {
  try {
    rmSync(paths.lockPath, { force: true });
  } catch {
    // A stale lock is harmless; the next start operation will check it again.
  }
}

function clearStaleLock(paths) {
  const existing = readInstance(paths.lockPath);
  if (existing.active) {
    return existing.instance;
  }
  if (existsSync(paths.lockPath)) {
    removeLock(paths);
  }
  return undefined;
}

function timestamp() {
  return new Date().toISOString();
}

function writeLog(logPath, streamName, value) {
  const text = sanitizeLogText(value);
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) {
      appendFileSync(logPath, `${timestamp()} [${streamName}] ${line}\n`, 'utf8');
    }
  }
}

function openBrowser(url) {
  const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

/** Allow inbound TCP on the Web UI port (LAN mode). Best-effort: requires elevation. */
function allowFirewallPort(port) {
  try {
    const result = spawnSync('netsh.exe', [
      'advfirewall', 'firewall', 'add', 'rule',
      `name=DeepSeek Harness Web ${port}`,
      'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`,
    ], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) {
      writeLog(process.env.DSH_LOG_PATH || 'launcher', 'launcher', `Firewall rule added for TCP ${port}.`);
    }
  } catch {
    // Non-elevated shells cannot add rules; LAN mode still works on most
    // private networks where Windows prompts once on first bind.
  }
}

async function waitForServer(port, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`DeepSeek Harness exited before opening the Web UI (exit code ${child.exitCode}).`);
    }
    if (!(await isPortAvailable(port))) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`DeepSeek Harness did not open http://127.0.0.1:${port} within ${Math.round(timeoutMs / 1000)} seconds.`);
}

function stopProcessTree(processId) {
  if (!isProcessAlive(processId)) {
    return;
  }
  const result = spawnSync('taskkill.exe', ['/PID', String(processId), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 && isProcessAlive(processId)) {
    throw new Error(`Unable to stop process ${processId}: ${sanitizeLogText(result.stderr || result.stdout || 'unknown error')}`);
  }
}

export async function startHarness(paths, options) {
  ensureRuntimeFiles(paths);
  const existing = clearStaleLock(paths);
  if (existing) {
    if (existing.initializing) {
      return { starting: true, instance: existing };
    }
    const port = existing.port || DEFAULT_PORT;
    return { alreadyRunning: true, port, instance: existing };
  }

  const workspace = options.workspace ? resolve(options.workspace) : paths.workspaceRoot;
  if (!options.workspace) {
    mkdirSync(workspace, { recursive: true });
  }
  if (!existsSync(workspace)) {
    throw new Error(`Workspace does not exist: ${workspace}`);
  }
  if (!statSync(workspace).isDirectory()) {
    throw new Error(`Workspace must be a directory: ${workspace}`);
  }
  ensureContainedPath(paths.runtimeRoot, paths.nodeExe, 'Private Node executable');
  ensureContainedPath(paths.runtimeRoot, paths.dshEntry, 'DeepSeek Harness entry point');

  const port = await findAvailablePort(options.port);
  mkdirSync(paths.logRoot, { recursive: true });
  mkdirSync(paths.dshHome, { recursive: true });
  ensureCommunityPluginProfileFallback(paths);
  syncManagedPatches(paths, Boolean(options.lan));
  if (options.lan) {
    allowFirewallPort(port);
  }

  const logPath = join(paths.logRoot, `dsh-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const instance = {
    harnessPid: undefined,
    launcherPid: process.pid,
    logPath,
    port,
    startedAtUtc: timestamp(),
    workspace,
  };

  let ownsLaunchLock = false;
  let child;
  try {
    createLaunchLock(paths, instance);
    ownsLaunchLock = true;
    writeLog(logPath, 'launcher', `Starting DeepSeek Harness on http://127.0.0.1:${port}.`);
    const childEnvironment = buildHarnessEnvironment(paths);
    childEnvironment.DSH_LAUNCHER_EXIT_TOKEN = createLauncherExitToken();
    child = spawn(paths.nodeExe, buildHarnessArguments(paths, port), {
      cwd: workspace,
      env: childEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => writeLog(logPath, 'dsh:stdout', data));
    child.stderr.on('data', (data) => writeLog(logPath, 'dsh:stderr', data));
    child.on('error', (error) => writeLog(logPath, 'dsh:error', error.message));
    instance.harnessPid = child.pid;
    writeInstance(paths, instance);

    await waitForServer(port, child, START_TIMEOUT_MS);
    return { alreadyRunning: false, child, instance, port };
  } catch (error) {
    // Roll back the managed profile patch if the boot failed, so a bad roster
    // cannot leave the profile in a broken state for the next start.
    try {
      if (existsSync(paths.profilePatchBackupPath)) {
        const backedUp = readFileSync(paths.profilePatchBackupPath, 'utf8');
        if (existsSync(paths.profilePatchPath)) {
          const current = readFileSync(paths.profilePatchPath, 'utf8');
          if (current.includes(MANAGED_SECTION_START)) {
            writeFileSync(paths.profilePatchPath, backedUp, 'utf8');
          }
        }
      }
    } catch {
      // Rollback is best-effort; the next start re-syncs anyway.
    }
    if (child && child.pid) {
      stopProcessTree(child.pid);
    }
    if (ownsLaunchLock) {
      removeLock(paths);
    }
    if (error.code === 'EEXIST') {
      const concurrentInstance = readInstance(paths.lockPath);
      if (concurrentInstance.active) {
        if (concurrentInstance.initializing) {
          return { starting: true, instance: concurrentInstance.instance };
        }
        const concurrentPort = concurrentInstance.instance.port || DEFAULT_PORT;
        return { alreadyRunning: true, port: concurrentPort, instance: concurrentInstance.instance };
      }
    }
    throw error;
  }
}

function printHelp() {
  console.log(`DeepSeek Harness Community Launcher

Usage:
  launcher.mjs start [--workspace <path>] [--port <port>] [--no-browser]
  launcher.mjs status
  launcher.mjs open
  launcher.mjs restart [--workspace <path>] [--port <port>] [--no-browser]
  launcher.mjs stop

Options:
  --workspace <path>  Harness working directory; defaults to this launcher's private empty workspace.
  --port <port>       Preferred local port; the launcher tries the next 19 ports if it is occupied.
  --lan               Bind to all interfaces so phones on the same network can
                      reach the Web UI (password-gated by the dsh-lan-pass plugin).
  --no-browser        Start without opening the default browser.

The --data-root option is reserved for diagnostics and automated tests.`);
}

function stopRunningInstance(paths) {
  const result = readInstance(paths.lockPath);
  if (!result.active) {
    clearStaleLock(paths);
    return false;
  }
  if (result.initializing) {
    throw new Error('DeepSeek Harness is still starting. Please try restarting again in a moment.');
  }
  stopProcessTree(result.instance.harnessPid || result.instance.launcherPid);
  removeLock(paths);
  return true;
}

async function main() {
  const { command, options } = parseCommandLine(process.argv.slice(2));
  if (command === 'help') {
    printHelp();
    return;
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const paths = resolveLauncherPaths(resolve(scriptDirectory, '..'), process.env, options.dataRoot);

  if (command === 'status') {
    const result = readInstance(paths.lockPath);
    if (!result.active) {
      clearStaleLock(paths);
      console.log('DeepSeek Harness is not running.');
      process.exitCode = 3;
      return;
    }
    if (result.initializing) {
      console.log('DeepSeek Harness is starting.');
      return;
    }
    console.log(`DeepSeek Harness is running at http://127.0.0.1:${result.instance.port}`);
    console.log(`Log: ${result.instance.logPath}`);
    return;
  }

  if (command === 'open') {
    const result = readInstance(paths.lockPath);
    if (!result.active) {
      clearStaleLock(paths);
      throw new Error('DeepSeek Harness is not running. Start it first.');
    }
    if (result.initializing) {
      throw new Error('DeepSeek Harness is still starting. Please wait a moment and try again.');
    }
    const url = `http://127.0.0.1:${result.instance.port}`;
    openBrowser(url);
    console.log(`Opened ${url}`);
    return;
  }

  if (command === 'stop') {
    const stopped = stopRunningInstance(paths);
    if (!stopped) {
      console.log('DeepSeek Harness is not running.');
      return;
    }
    console.log('DeepSeek Harness has been stopped.');
    return;
  }

  if (command === 'restart') {
    const stopped = stopRunningInstance(paths);
    if (stopped) {
      console.log('DeepSeek Harness stopped; restarting…');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
    } else {
      console.log('DeepSeek Harness was not running; starting…');
    }
  }

  const started = await startHarness(paths, options);
  if (started.starting) {
    console.log('DeepSeek Harness is already starting.');
    return;
  }
  const url = `http://127.0.0.1:${started.port}`;
  if (started.alreadyRunning) {
    if (!options.noBrowser) {
      openBrowser(url);
    }
    console.log(`DeepSeek Harness is already running at ${url}`);
    return;
  }

  if (!options.noBrowser) {
    openBrowser(url);
  }
  console.log(`DeepSeek Harness is running at ${url}`);
  console.log(`Log: ${started.instance.logPath}`);

  const stopChild = () => {
    try {
      stopProcessTree(started.instance.harnessPid);
    } catch {
      // The child may already have exited.
    }
  };
  process.once('SIGINT', stopChild);
  process.once('SIGTERM', stopChild);
  const [exitCode, signal] = await new Promise((resolveExit) => {
    started.child.once('exit', (code, exitSignal) => resolveExit([code, exitSignal]));
  });
  writeLog(started.instance.logPath, 'launcher', `DeepSeek Harness stopped (exitCode=${exitCode}, signal=${signal || 'none'}).`);
  removeLock(paths);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Launcher error: ${sanitizeLogText(error.message)}`);
    process.exitCode = 1;
  });
}
