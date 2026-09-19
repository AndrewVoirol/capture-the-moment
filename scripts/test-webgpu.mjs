import { chromium } from 'playwright';

async function testWebGPU() {
  console.log('Testing WebGPU launch with Metal flags...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
    headless: true,
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
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <script>
          async function init() {
            if (!navigator.gpu) {
              console.log('WebGPU NOT available on navigator');
              return;
            }
            try {
              const adapter = await navigator.gpu.requestAdapter();
              if (!adapter) {
                console.log('No GPU adapter found');
                return;
              }
              const device = await adapter.requestDevice();
              console.log('WebGPU Device SUCCESS! Vendor:', adapter.info ? adapter.info.vendor : 'apple');
            } catch (e) {
              console.error('WebGPU init error:', e.message);
            }
          }
          init();
        </script>
      </body>
    </html>
  `);

  await page.waitForTimeout(1000);
  await browser.close();
}

testWebGPU().catch(console.error);
