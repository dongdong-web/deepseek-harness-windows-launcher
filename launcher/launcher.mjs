import { spawn, spawnSync } from 'node:child_process';
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

export function parseCommandLine(argumentsList) {
  const args = [...argumentsList];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'start';
  const options = {
    dataRoot: process.env.DSH_LAUNCHER_DATA_ROOT,
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

  if (!['start', 'status', 'stop', 'open', 'help'].includes(command)) {
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
  ]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Required private runtime path is missing: ${requiredPath}`);
    }
  }
}

export function ensureCommunityPluginProfileFallback(paths) {
  const targetDirectory = paths.drivePickerPackageDirectory;
  const profileLink = paths.drivePickerProfileLink;

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
      throw new Error(`Community drive-picker path already exists and is not launcher-managed: ${profileLink}`);
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
  return [
    paths.dshEntry,
    '--profile', 'web',
    '--patch', paths.directoryPickerPatchPath,
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
    child = spawn(paths.nodeExe, buildHarnessArguments(paths, port), {
      cwd: workspace,
      env: buildHarnessEnvironment(paths),
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
  launcher.mjs stop

Options:
  --workspace <path>  Harness working directory; defaults to this launcher's private empty workspace.
  --port <port>       Preferred local port; the launcher tries the next 19 ports if it is occupied.
  --no-browser        Start without opening the default browser.

The --data-root option is reserved for diagnostics and automated tests.`);
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
    const result = readInstance(paths.lockPath);
    if (!result.active) {
      clearStaleLock(paths);
      console.log('DeepSeek Harness is not running.');
      return;
    }
    if (result.initializing) {
      console.log('DeepSeek Harness is still starting. Please try stopping it again in a moment.');
      return;
    }
    stopProcessTree(result.instance.harnessPid || result.instance.launcherPid);
    removeLock(paths);
    console.log('DeepSeek Harness has been stopped.');
    return;
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
