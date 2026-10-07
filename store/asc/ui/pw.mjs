import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
export async function connect() {
  const port = execSync("ps aux | grep -o 'remote-debugging-port=[0-9][0-9]*' | head -1 | cut -d= -f2").toString().trim();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('appstoreconnect.apple.com')) ?? context.pages()[0];
  return { browser, page };
}
