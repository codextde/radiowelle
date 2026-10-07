import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

export async function connect() {
  const port = execSync("ps aux | grep -o 'remote-debugging-port=[0-9][0-9]*' | head -1 | cut -d= -f2").toString().trim();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('play.google.com')) ?? context.pages()[0];
  return { browser, context, page };
}

import { setting } from '../../config.mjs';

export const BASE = setting('PLAY_CONSOLE_APP_URL');

export async function text(page) {
  return page.evaluate(() => document.querySelector('main, [role=main], body').innerText);
}
