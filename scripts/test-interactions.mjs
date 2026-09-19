import { chromium } from 'playwright';

async function testStudioRailsInteractions() {
  console.log('--- Testing Studio Rails & Refinements ---');

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

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Verify Option A layout elements exist
  const sidebar = await page.$('#costar-sidebar');
  const rail = await page.$('#control-dock');
  const quickPrompts = await page.$('#costar-quick-prompts');
  const toggleBtn = await page.$('#btn-toggle-sidebar');
  const collapseBtn = await page.$('#btn-collapse-costar');
  const clearBtn = await page.$('#btn-clear-pencil');
  const waveVisualizer = await page.$('#costar-sidebar-wave');

  if (!sidebar || !rail || !quickPrompts || !toggleBtn || !collapseBtn || !clearBtn || !waveVisualizer) {
    throw new Error('Missing key Studio Rails DOM elements');
  }
  console.log('✓ All Studio Rails layout elements present in DOM (sidebar, rail, quick prompts, collapse btn, wave)');

  // 2. Verify quick prompts are visible inside sidebar
  const promptsVisible = await quickPrompts.isVisible();
  if (!promptsVisible) {
    throw new Error('Quick prompts should be visible inside sidebar');
  }
  console.log('✓ Quick prompts permanently visible in sidebar');

  // 3. Test quick prompt clicking: Switch to Gold Palette
  const goldPill = await page.$('.prompt-pill[data-prompt*="gold"]');
  if (!goldPill) throw new Error('Gold prompt pill not found');
  await goldPill.click();
  await page.waitForTimeout(500);

  // Verify gold palette swatch is now active
  const goldSwatchActive = await page.evaluate(() => {
    const goldSwatch = document.querySelector('.swatch[data-palette="gold"]');
    return goldSwatch?.classList.contains('active');
  });
  console.log('✓ Quick prompt click instantly activated gold palette swatch:', goldSwatchActive);
  if (!goldSwatchActive) throw new Error('Gold swatch should be active');

  // Verify toast and caption appeared
  const captionText = await page.evaluate(() => {
    const bubble = document.getElementById('live-caption-overlay');
    return bubble?.textContent || '';
  });
  console.log('✓ Caption overlay received transcript/banter:', captionText.trim().slice(0, 60));
  if (!captionText.includes('Gold') && !captionText.includes('gold')) {
    throw new Error('Caption overlay should display user prompt or witty response');
  }

  // 4. Test Sidebar collapse button & deep computed style check
  await collapseBtn.click();
  await page.waitForTimeout(400);

  const collapsedComputed = await page.evaluate(() => {
    const el = document.getElementById('costar-sidebar');
    const container = document.getElementById('app-container');
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return {
      hasClass: el.classList.contains('collapsed'),
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      transform: style.transform,
      containerHasClass: container?.classList.contains('sidebar-collapsed')
    };
  });
  console.log('✓ Sidebar collapsed computed styles:', collapsedComputed);
  if (!collapsedComputed?.hasClass || collapsedComputed.opacity !== '0' || collapsedComputed.pointerEvents !== 'none') {
    throw new Error(`Sidebar should be visually hidden when collapsed! Got: ${JSON.stringify(collapsedComputed)}`);
  }

  // 5. Test Tab keyboard shortcut to reopen sidebar & verify computed styles
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);

  const openComputed = await page.evaluate(() => {
    const el = document.getElementById('costar-sidebar');
    const container = document.getElementById('app-container');
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return {
      hasClass: el.classList.contains('collapsed'),
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      transform: style.transform,
      containerHasClass: container?.classList.contains('sidebar-collapsed')
    };
  });
  console.log('✓ Sidebar reopened computed styles:', openComputed);
  if (openComputed?.hasClass || openComputed.opacity !== '1' || openComputed.pointerEvents !== 'auto') {
    throw new Error(`Sidebar should be visually visible when open! Got: ${JSON.stringify(openComputed)}`);
  }

  // 6. Test OKLCH pencil color for current palette
  const pencilColor = await page.evaluate(() => {
    const app = window.app;
    return app ? app.getPencilColor() : null;
  });
  console.log('✓ Current pencil color (OKLCH):', pencilColor);
  if (!pencilColor || !pencilColor.startsWith('oklch(')) {
    throw new Error(`Pencil color should be OKLCH! Got: ${pencilColor}`);
  }

  // 7. Test number keys for tool switching: '2' for pencil, '3' for vortex, '1' for breeze
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  const isPencilActive = await page.evaluate(() => {
    return document.querySelector('.tool-btn[data-tool="pencil"]')?.classList.contains('active');
  });
  console.log('✓ Tool switched to Pencil via "2" key:', isPencilActive);
  if (!isPencilActive) throw new Error('Pencil should be active');

  await page.keyboard.press('3');
  await page.waitForTimeout(200);
  const isVortexActive = await page.evaluate(() => {
    return document.querySelector('.tool-btn[data-tool="gust"]')?.classList.contains('active');
  });
  console.log('✓ Tool switched to Vortex via "3" key:', isVortexActive);
  if (!isVortexActive) throw new Error('Vortex should be active');

  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  const isBreezeActive = await page.evaluate(() => {
    return document.querySelector('.tool-btn[data-tool="breeze"]')?.classList.contains('active');
  });
  console.log('✓ Tool switched to Breeze via "1" key:', isBreezeActive);
  if (!isBreezeActive) throw new Error('Breeze should be active');

  // 8. Test 'F' for flurry
  const leafCountBefore = await page.evaluate(() => parseInt(document.getElementById('stat-leaves')?.textContent || '0'));
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  const leafCountAfter = await page.evaluate(() => parseInt(document.getElementById('stat-leaves')?.textContent || '0'));
  console.log(`✓ Leaf flurry triggered via "F": leaves before=${leafCountBefore}, after=${leafCountAfter}`);
  if (leafCountAfter <= leafCountBefore) throw new Error('Leaves count should increase after flurry');

  // 9. Test Clear Pencil button
  await clearBtn.click();
  console.log('✓ Clear pencil marks button clicked successfully');

  await browser.close();
  console.log('--- All Studio Rails Interaction & OKLCH Tests Passed! ---');
}

testStudioRailsInteractions().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
