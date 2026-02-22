import { execFile } from 'node:child_process';

function exec(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5_000 }, (err) => {
      resolve(!err);
    });
  });
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

/**
 * Open the authorization URL directly in the user's browser.
 */
export function openBrowser(url: string): void {
  openUrl(url);
}

/**
 * Send a desktop notification about re-authorization needed.
 * Falls back to opening the browser directly if notifications aren't supported.
 */
export async function notifyReauth(serverName: string, authUrl: string): Promise<void> {
  const title = 'toold';
  const message = `Server "${serverName}" needs re-authorization`;
  const platform = process.platform;

  if (platform === 'darwin') {
    // Try terminal-notifier first (supports click-to-open)
    const ok = await exec('terminal-notifier', [
      '-title',
      title,
      '-message',
      message,
      '-open',
      authUrl,
    ]);
    if (ok) return;

    // Fall back to osascript (notification only) + open browser
    await exec('osascript', ['-e', `display notification "${message}" with title "${title}"`]);
    openUrl(authUrl);
  } else if (platform === 'linux') {
    // notify-send is informational only, always open browser too
    await exec('notify-send', [title, message]);
    openUrl(authUrl);
  } else {
    // Fallback: just open the browser
    openUrl(authUrl);
  }
}
