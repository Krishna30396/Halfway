import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const gitDir = path.join(projectRoot, '.git');
const cacheFile = path.join(gitDir, 'LAST_SEEN_MAIN');
const logFile = path.join(gitDir, 'upstream-alerts.log');

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

function runGit(cmd) {
  try {
    return execSync(cmd, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (err) {
    return null;
  }
}

function showToastNotification(title, message) {
  const safeTitle = title.replace(/'/g, "''").replace(/"/g, '`"');
  const safeMessage = message.replace(/'/g, "''").replace(/"/g, '`"');
  const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)
$textElements = $xml.GetElementsByTagName("text")
$textElements.Item(0).InnerText = "${safeTitle}"
$textElements.Item(1).InnerText = "${safeMessage}"
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe").Show($toast)
`;

  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
      windowsHide: true,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
  } catch (e) {
    // Ignore notification errors
  }
}

export function checkForUpdates() {
  const now = new Date().toLocaleTimeString();
  process.stdout.write(`[${now}] Checking origin/main for new pushes from Krishna...\n`);

  runGit('git fetch origin main');

  const currentRemoteSha = runGit('git rev-parse origin/main');
  if (!currentRemoteSha) {
    console.error(`[${now}] Unable to fetch or resolve origin/main.`);
    return;
  }

  let lastSeenSha = null;
  if (fs.existsSync(cacheFile)) {
    lastSeenSha = fs.readFileSync(cacheFile, 'utf8').trim();
  }

  if (!lastSeenSha) {
    fs.writeFileSync(cacheFile, currentRemoteSha, 'utf8');
    console.log(`[${now}] Initialized baseline at commit ${currentRemoteSha.slice(0, 7)}.`);
    return;
  }

  if (lastSeenSha === currentRemoteSha) {
    console.log(`[${now}] No new commits on origin/main. Up to date at ${currentRemoteSha.slice(0, 7)}.`);
    return;
  }

  // New commits detected!
  const commitLog = runGit(`git log ${lastSeenSha}..origin/main --pretty=format:"* %h - %an: %s (%cr)"`);
  const commitCount = runGit(`git rev-list --count ${lastSeenSha}..origin/main`) || 'New';
  const diffStat = runGit(`git diff --stat ${lastSeenSha}..origin/main`);

  const alertHeader = `\n========================================\n` +
    `[ALERT ${now}] ${commitCount} NEW COMMIT(S) PUSHED TO ORIGIN/MAIN\n` +
    `========================================\n`;

  console.log(alertHeader);
  console.log(commitLog);
  if (diffStat) {
    console.log('\nChanged files:');
    console.log(diffStat);
  }
  console.log(`\n(Note: No automatic rebase was performed. Check the log above.)\n`);

  // Write to log file
  const logEntry = `${alertHeader}\n${commitLog}\n\n${diffStat || ''}\n\n`;
  try {
    fs.appendFileSync(logFile, logEntry, 'utf8');
  } catch (e) {}

  // Trigger Windows toast notification
  const firstLine = (commitLog || '').split('\n')[0] || 'New updates on main';
  showToastNotification(`Halfway Alert: ${commitCount} new commit(s) on main`, firstLine);

  // Update last seen
  fs.writeFileSync(cacheFile, currentRemoteSha, 'utf8');
}

const isOnce = process.argv.includes('--once');

if (isOnce) {
  checkForUpdates();
} else {
  console.log(`Halfway Upstream Watcher started. Polling every ${POLL_INTERVAL_MS / 1000}s for pushes to main...`);
  console.log(`(Press Ctrl+C to stop)`);
  checkForUpdates();
  setInterval(checkForUpdates, POLL_INTERVAL_MS);
}
