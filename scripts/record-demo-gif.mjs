import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function recordGif() {
  console.log('--- Starting Demo GIF Recording ---');

  const framesDir = path.resolve('frames');
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

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
      '--ignore-gpu-blocklist'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Let initial leaves flutter for a moment
  await page.waitForTimeout(1500);

  // Trigger gentle gust
  await page.click('#btn-gust');

  console.log('Capturing frames...');
  const totalFrames = 48; // 4 seconds at 12 fps
  for (let i = 0; i < totalFrames; i++) {
    const filename = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: filename });

    // Simulate gentle mouse swirl midway
    if (i > 15 && i < 35) {
      const angle = (i - 15) * 0.3;
      await page.mouse.move(640 + Math.cos(angle) * 150, 360 + Math.sin(angle) * 80);
    }

    await page.waitForTimeout(80); // ~12 fps
  }

  await browser.close();

  console.log('Assembling demo.gif with ffmpeg...');
  const gifPath = path.join(screenshotsDir, 'demo.gif');
  const cmd = `ffmpeg -y -framerate 12 -i "${path.join(framesDir, 'frame_%04d.png')}" -vf "scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${gifPath}"`;
  
  execSync(cmd, { stdio: 'inherit' });

  // Clean up frames
  fs.rmSync(framesDir, { recursive: true, force: true });

  const stats = fs.statSync(gifPath);
  console.log(`Demo GIF created successfully: ${gifPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

recordGif().catch(err => {
  console.error('GIF Recording Failed:', err);
  process.exit(1);
});
