/**
 * Minimal Chrome DevTools Protocol client used by the QA scripts in this
 * folder. Development-only — nothing here ships to the website.
 * Uses Node's built-in WebSocket (Node >= 22), so no npm dependencies.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  'chromium',
  'google-chrome',
].filter(Boolean);

export function chromePath() {
  for (const c of CANDIDATES) if (!c.includes('/') || existsSync(c)) return c;
  throw new Error('No Chrome found. Set CHROME_BIN.');
}

export async function launch(port = 9222) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'pk-chrome-'));
  const proc = spawn(
    chromePath(),
    [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--disable-dev-shm-usage',
      // Keep the browser entirely offline apart from the site under test.
      '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-default-apps', '--no-first-run',
      '--no-default-browser-check', '--metrics-recording-only',
      '--disable-features=Translate,OptimizationHints,MediaRouter',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`, 'about:blank',
    ],
    { stdio: 'ignore' },
  );

  // Wait for the debugging endpoint to answer.
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { proc, port };
}

export async function newPage(port = 9222) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  const page = {
    send,
    events,
    targetId: target.id,

    async setViewport(width, height, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile,
        screenWidth: width, screenHeight: height,
      });
      if (mobile) {
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      }
    },

    async goto(url) {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Console.enable').catch(() => {});
      await send('Log.enable').catch(() => {});
      await send('Page.navigate', { url });
      // Wait for the load event.
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 8000);
        const check = setInterval(() => {
          if (events.some((e) => e.method === 'Page.loadEventFired')) {
            clearInterval(check); clearTimeout(t); resolve();
          }
        }, 50);
      });
      // Give deferred scripts a tick to run.
      await new Promise((r) => setTimeout(r, 250));
    },

    async eval(expression) {
      const r = await send('Runtime.evaluate', {
        expression: `(async () => { ${expression} })()`,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
      }
      return r.result.value;
    },

    async screenshot(file, { fullPage = false } = {}) {
      const params = { format: 'png' };
      if (fullPage) params.captureBeyondViewport = true;
      const { data } = await send('Page.captureScreenshot', params);
      await writeFile(file, Buffer.from(data, 'base64'));
      return file;
    },

    /** Console errors and failed requests seen since load. */
    problems() {
      const out = [];
      for (const e of events) {
        if (e.method === 'Log.entryAdded' && ['error'].includes(e.params.entry.level)) {
          out.push(`${e.params.entry.source}: ${e.params.entry.text}`);
        }
        if (e.method === 'Runtime.exceptionThrown') {
          out.push(`js: ${e.params.exceptionDetails.exception?.description || 'exception'}`);
        }
      }
      return out;
    },

    async close() {
      ws.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
    },
  };
  return page;
}
