import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const OUT_DIR = 'C:\\Users\\mpoor\\.gemini\\antigravity-ide\\brain\\a92abf60-1101-4447-9081-432c7b49d359';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function sendCDP(ws, method, params = {}, id = 1) {
  return new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off('message', handler);
        resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=C:\\Users\\mpoor\\AppData\\Local\\Temp\\chrome-debug',
    '--force-prefers-color-scheme=dark',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 2500));

  try {
    const versionInfo = await fetchJson(`http://127.0.0.1:${PORT}/json/version`);
    const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }));
    
    // Test targets: 1920x1080, 1366x768, 760x900
    const viewports = [
      { name: 'after_1920x1080.png', width: 1920, height: 1080 },
      { name: 'after_1366x768.png', width: 1366, height: 760 },
      { name: 'after_760px.png', width: 760, height: 900 },
    ];

    for (let i = 0; i < viewports.length; i++) {
      const vp = viewports[i];
      console.log(`Capturing ${vp.name} (${vp.width}x${vp.height})...`);
      
      const newPage = await fetchJson(`http://127.0.0.1:${PORT}/json/new?http://localhost:3000`);
      const ws = new WebSocket(newPage.webSocketDebuggerUrl);
      
      await new Promise(res => ws.on('open', res));
      
      let msgId = 1;
      await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width <= 768,
      }, msgId++);

      await sendCDP(ws, 'Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-color-scheme', value: 'dark' }]
      }, msgId++);

      // Wait 4s for Leaflet & tiles
      await new Promise(r => setTimeout(r, 4000));

      const screenshot = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
      if (screenshot && screenshot.data) {
        const outPath = path.join(OUT_DIR, vp.name);
        fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
        console.log(`Saved: ${outPath}`);
      }

      ws.close();
      await fetchJson(`http://127.0.0.1:${PORT}/json/close/${newPage.id}`).catch(() => {});
    }

  } catch (err) {
    console.error('CDP Error:', err);
  } finally {
    chromeProcess.kill();
  }
}

main();
