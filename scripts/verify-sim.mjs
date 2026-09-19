import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function verifySimulation() {
  console.log('--- Starting WebGPU Simulation Verification ---');

  const screenshotsDir = path.resolve('screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-gpu-in-tests',
      '--enable-features=WebGPU,DefaultANGLEMetal',
      '--use-angle=metal',
      '--enable-dawn-features=allow_unsafe_apis',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
      console.error('BROWSER ERROR:', text);
    } else {
      console.log('BROWSER LOG:', text);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error('PAGE CRASH:', err.message);
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait 2.5 seconds for simulation to run and settle initial leaves
  await page.waitForTimeout(2500);

  // Check canvas and WebGPU status
  const evalResult = await page.evaluate(() => {
    const canvas = document.getElementById('webgpu-canvas');
    const fallback = document.getElementById('webgpu-fallback');
    const fpsText = document.getElementById('stat-fps')?.textContent;
    const leavesText = document.getElementById('stat-leaves')?.textContent;
    const groundText = document.getElementById('stat-ground')?.textContent;

    return {
      canvasExists: !!canvas,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      fallbackVisible: !fallback?.classList.contains('hidden'),
      fps: fpsText,
      leaves: leavesText,
      ground: groundText
    };
  });

  console.log('Simulation State Check:', evalResult);

  // Capture initial state screenshot
  await page.screenshot({ path: path.join(screenshotsDir, 'initial-state.png') });
  console.log('Captured screenshots/initial-state.png');

  // Test interactive breeze stirring
  console.log('Testing interactive breeze...');
  await page.mouse.move(500, 450);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(500 + Math.sin(i * 0.3) * 250, 450 + Math.cos(i * 0.3) * 150);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();

  // Test Wind Gust
  console.log('Testing Wind Gust button...');
  await page.click('#btn-gust');
  await page.waitForTimeout(1000);

  // Test Flurry
  console.log('Testing Flurry button...');
  await page.click('#btn-shower');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: path.join(screenshotsDir, 'leaves-falling.png') });
  console.log('Captured screenshots/leaves-falling.png');

  // Test Evoke Words
  console.log('Testing Evoke Words button...');
  await page.click('#btn-reveal-words');
  await page.waitForTimeout(2000);

  // Test Capture the Moment
  console.log('Testing Capture the Moment...');
  await page.click('#btn-capture');
  await page.waitForTimeout(800);

  // Check if modal opened
  const modalOpen = await page.evaluate(() => {
    const modal = document.getElementById('capture-modal');
    return !modal?.classList.contains('hidden');
  });
  console.log('Capture Modal Opened:', modalOpen);

  await page.screenshot({ path: path.join(screenshotsDir, 'captured-moment.png') });
  console.log('Captured screenshots/captured-moment.png');

  // Close modal
  await page.click('#btn-modal-close');
  await page.waitForTimeout(500);

  await browser.close();

  console.log('--- Verification Summary ---');
  console.log('Total Console Logs:', consoleLogs.length);
  console.log('Total Console Errors:', consoleErrors.length);

  if (consoleErrors.length > 0) {
    throw new Error('Verification failed with browser errors: ' + JSON.stringify(consoleErrors));
  }

  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
}

verifySimulation().catch(err => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
