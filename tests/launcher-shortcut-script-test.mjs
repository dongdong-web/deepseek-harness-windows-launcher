import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const script = readFileSync(join(repoRoot, 'launcher', 'start.vbs'), 'utf8');

assert.match(script, /shell\.SpecialFolders\("Desktop"\)/);
assert.match(script, /shell\.CreateShortcut\(shell\.SpecialFolders\("Desktop"\) & "\\DeepSeek Harness\.lnk"\)/);
assert.match(script, /desktopShortcut\.TargetPath = WScript\.ScriptFullName/);
assert.match(script, /desktopShortcut\.WorkingDirectory = launcherRoot/);
assert.match(script, /desktopShortcut\.Save/);
assert.match(script, /launcherScript & Chr\(34\) & " start"/);

console.log('Launcher desktop shortcut script tests passed.');
