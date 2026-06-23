import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { checkTmuxAvailable, DEFAULT_TMUX_BIN } from './tmux.js';

const execFileAsync = promisify(execFile);

async function commandExists(command) {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('where.exe', [command], { timeout: 3000, windowsHide: true });
    } else {
      await execFileAsync('sh', ['-lc', `command -v ${shellWord(command)}`], { timeout: 3000 });
    }
    return true;
  } catch {
    return false;
  }
}

function shellWord(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function plan(command, args, displayCommand, packageManager, notes = []) {
  return { command, args, displayCommand, packageManager, notes, available: true };
}

async function privilegedPlan(command, args, packageManager) {
  const baseDisplay = `${command} ${args.join(' ')}`;
  if (process.getuid?.() === 0) return plan(command, args, baseDisplay, packageManager);
  if (await commandExists('sudo')) return plan('sudo', [command, ...args], `sudo ${baseDisplay}`, packageManager);
  return { available: false, packageManager, displayCommand: '', notes: [`Install tmux manually with: ${baseDisplay}`] };
}

export async function tmuxInstallPlan() {
  if (process.platform === 'win32') {
    if (await commandExists('winget')) {
      return plan('winget', ['install', '--id', 'marlocarlo.psmux', '-e'], 'winget install --id marlocarlo.psmux -e', 'winget', [
        'Installs psmux, a Windows tmux-compatible package.'
      ]);
    }
    return { available: false, packageManager: '', displayCommand: '', notes: ['Install psmux manually or install winget first.'] };
  }

  if (process.platform === 'darwin') {
    if (await commandExists('brew')) return plan('brew', ['install', 'tmux'], 'brew install tmux', 'brew');
    return { available: false, packageManager: '', displayCommand: '', notes: ['Install Homebrew or install tmux manually.'] };
  }

  const linuxCandidates = [
    ['apt-get', ['install', '-y', 'tmux'], 'apt-get'],
    ['dnf', ['install', '-y', 'tmux'], 'dnf'],
    ['pacman', ['-S', '--noconfirm', 'tmux'], 'pacman'],
    ['zypper', ['install', '-y', 'tmux'], 'zypper'],
    ['apk', ['add', 'tmux'], 'apk']
  ];
  for (const [command, args, packageManager] of linuxCandidates) {
    if (await commandExists(command)) return await privilegedPlan(command, args, packageManager);
  }
  return { available: false, packageManager: '', displayCommand: '', notes: ['Install tmux with your distribution package manager.'] };
}

function currentTmuxBin(tmuxBin) {
  return tmuxBin || process.env.KANBAN_TMUX_BIN || DEFAULT_TMUX_BIN;
}

export async function detectTmuxDependency({ tmuxBin } = {}) {
  const resolvedTmuxBin = currentTmuxBin(tmuxBin);
  const status = await checkTmuxAvailable({ tmuxBin: resolvedTmuxBin });
  const installPlan = status.available ? null : await tmuxInstallPlan();
  return {
    dependency: 'tmux',
    tmuxBin: resolvedTmuxBin,
    platform: process.platform,
    installed: status.available,
    available: status.available,
    version: status.version,
    installPlan,
    installCommand: installPlan?.displayCommand || '',
    installNotes: installPlan?.notes || [],
    cliInstallCommand: 'input-kanban deps install tmux',
    installAvailable: !!installPlan?.available,
    installHint: status.available ? '' : (status.result?.stderr || status.result?.stdout || status.result?.error?.message || 'tmux command not found')
  };
}

export async function installTmux({ yes = false, dryRun = false, log = console.log, installPlan = null, spawnImpl = spawn } = {}) {
  const before = await detectTmuxDependency();
  if (dryRun) {
    const plan = installPlan || before.installPlan || await tmuxInstallPlan();
    return { ok: true, dependency: 'tmux', dryRun: true, installed: before.installed, installPlan: plan, before };
  }
  if (before.installed) return { ok: true, dependency: 'tmux', installed: true, alreadyInstalled: true, before, after: before };
  const plan = installPlan || before.installPlan || await tmuxInstallPlan();
  if (!plan?.available) {
    const error = new Error(`no supported tmux installer found for ${process.platform}`);
    error.statusCode = 400;
    error.installPlan = plan;
    throw error;
  }
  if (!yes) {
    throw new Error(`confirmation required; rerun with --yes after reviewing: ${plan.displayCommand}`);
  }
  await new Promise((resolve, reject) => {
    log(`Running: ${plan.displayCommand}`);
    const child = spawnImpl(plan.command, plan.args, { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${plan.command} exited with ${code}`)));
  });
  const after = await detectTmuxDependency();
  if (!after.installed) throw new Error('tmux installation command completed, but tmux -V still failed');
  return { ok: true, dependency: 'tmux', installed: true, alreadyInstalled: false, installPlan: plan, before, after };
}
