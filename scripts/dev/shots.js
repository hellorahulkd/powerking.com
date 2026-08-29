/**
 * Capture screenshots at real device viewports. Development aid.
 *   node scripts/dev/shots.js [outputDir]
 */
import { launch, newPage } from './cdp.js';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = process.argv[2] || 'screenshots';

const SHOTS = [
  ['home',      '/',                              390, 900,  true],
  ['catalogue', '/products/',                     390, 1000, true],
  ['product',   '/products/sample-cola-500ml/',   390, 1100, true],
  ['contact',   '/contact/',                      390, 900,  true],
  ['404',       '/404.html',                      390, 800,  true],
  ['menu-open', '/',                              390, 900,  true],
  ['tablet',    '/products/',                     820, 1000, true],
];

await mkdir(OUT, { recursive: true });
const { proc, port } = await launch();
const page = await newPage(port);

for (const [name, url, w, h, mobile] of SHOTS) {
  await page.setViewport(w, h, mobile);
  await page.goto(BASE + url);
  if (name === 'menu-open') {
    await page.eval(`document.querySelector('.nav-toggle').click(); return 1;`);
    await new Promise((r) => setTimeout(r, 200));
  }
  await page.screenshot(`${OUT}/${name}-${w}.png`);
  process.stdout.write(`  ✓ ${OUT}/${name}-${w}.png\n`);
}

await page.close();
proc.kill();
