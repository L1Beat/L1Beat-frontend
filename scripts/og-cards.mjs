// Renders the link-preview cards in public/og/ (1200x630, the size X, Telegram and
// Slack use). The address sits top right: X lays the page title over the bottom left. Run locally after changing a page's title or look:
//   node scripts/og-cards.mjs
// Needs Google Chrome; set CHROME to its binary if it isn't in the default place.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1200;
const H = 630;

// Deterministic "data", so a re-run draws the same shapes.
function series(n, seed, base = 0.45, swing = 0.35) {
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  let v = base;
  return Array.from({ length: n }, () => {
    v = Math.min(0.95, Math.max(0.08, v + (rnd() - 0.5) * swing));
    return v;
  });
}

// Chart area: the right side of the card.
const CX = 600, CY = 150, CW = 540, CH = 330;
const grid = () =>
  [0, 1, 2, 3].map((i) => `<line x1="${CX}" x2="${CX + CW}" y1="${CY + (CH / 3) * i}" y2="${CY + (CH / 3) * i}" stroke="#ffffff" stroke-opacity="0.06"/>`).join('');

function bars(colors, seed, n = 30) {
  const parts = colors.map((_, k) => series(n, seed + k * 7, 0.3, 0.25));
  const slot = CW / n;
  let out = grid();
  for (let i = 0; i < n; i++) {
    let y = CY + CH;
    parts.forEach((p, k) => {
      const h = (p[i] * CH) / colors.length;
      y -= h;
      out += `<rect x="${CX + i * slot + slot * 0.15}" y="${y}" width="${slot * 0.7}" height="${h}" fill="${colors[k]}"/>`;
    });
  }
  return out;
}

function area(layers, seed, line) {
  const n = 60;
  const data = layers.map((_, k) => series(n, seed + k * 11, 0.35, 0.12));
  const x = (i) => CX + (CW * i) / (n - 1);
  let base = Array(n).fill(0);
  let out = grid();
  layers.forEach((c, k) => {
    const top = base.map((b, i) => b + data[k][i] / layers.length);
    const d = `M${top.map((t, i) => `${x(i)},${CY + CH - t * CH}`).join('L')}L${[...base].reverse().map((b, i) => `${x(n - 1 - i)},${CY + CH - b * CH}`).join('L')}Z`;
    out += `<path d="${d}" fill="${c}" fill-opacity="0.9"/>`;
    base = top;
  });
  if (line) {
    const l = series(n, seed + 99, 0.25, 0.08);
    out += `<path d="M${l.map((v, i) => `${x(i)},${CY + CH - v * CH * 0.6}`).join('L')}" fill="none" stroke="${line}" stroke-width="3"/>`;
  }
  return out;
}

function lineChart(color, seed) {
  const n = 80;
  const d = series(n, seed, 0.5, 0.18);
  const x = (i) => CX + (CW * i) / (n - 1);
  const pts = d.map((v, i) => `${x(i)},${CY + CH - v * CH}`).join('L');
  return `${grid()}<path d="M${pts}L${CX + CW},${CY + CH}L${CX},${CY + CH}Z" fill="${color}" fill-opacity="0.12"/><path d="M${pts}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round"/>`;
}

function sankey() {
  const mid = { x: CX + CW / 2 - 10, y: CY + 20, h: CH - 40 };
  const left = [['#627eea', 0.42], ['#2f6bff', 0.16], ['#9945ff', 0.1], ['#836ef9', 0.08], ['#28a0f0', 0.07], ['#6b7280', 0.1]];
  const right = [['#627eea', 0.48], ['#2f6bff', 0.18], ['#836ef9', 0.07], ['#9945ff', 0.07], ['#28a0f0', 0.06], ['#6b7280', 0.1]];
  let out = '<defs>';
  const side = (nodes, isLeft) => {
    let y = CY;
    let my = mid.y;
    let s = '';
    nodes.forEach(([c, f], i) => {
      const h = f * (CH - 40);
      const id = `${isLeft ? 'l' : 'r'}${i}`;
      out += `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${isLeft ? c : '#e84142'}"/><stop offset="1" stop-color="${isLeft ? '#e84142' : c}"/></linearGradient>`;
      const nx = isLeft ? CX : CX + CW - 10;
      const x0 = isLeft ? nx + 10 : mid.x + 20;
      const x1 = isLeft ? mid.x : nx;
      const y0 = isLeft ? y + h / 2 : my + h / 2;
      const y1 = isLeft ? my + h / 2 : y + h / 2;
      const cx = (x0 + x1) / 2;
      s += `<path d="M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}" stroke="url(#${id})" stroke-width="${h}" stroke-opacity="0.55" fill="none"/>`;
      s += `<rect x="${nx}" y="${y}" width="10" height="${h}" rx="2" fill="${c}"/>`;
      y += h + 8;
      my += h;
    });
    return s;
  };
  const l = side(left, true);
  const r = side(right, false);
  out += '</defs>';
  return out + l + r + `<rect x="${mid.x}" y="${mid.y}" width="20" height="${mid.h}" rx="3" fill="#e84142"/>`;
}

function treemap() {
  const cols = [0.16, 0.14, 0.12, 0.11, 0.1, 0.09, 0.08, 0.07, 0.07, 0.06];
  let x = CX;
  let out = '';
  cols.forEach((w, i) => {
    const cw = w * CW;
    const rows = 2 + (i % 4);
    for (let r = 0; r < rows; r++) {
      const rh = CH / rows;
      const delegated = (i * 3 + r) % 4 === 0;
      out += `<rect x="${x + 1}" y="${CY + r * rh + 1}" width="${cw - 2}" height="${rh - 2}" fill="${i < 3 ? '#3987e5' : '#2c4a72'}"/>`;
      if (delegated) out += `<rect x="${x + 1}" y="${CY + r * rh + 1}" width="${cw - 2}" height="${(rh - 2) * 0.35}" fill="#8b5cf6"/>`;
    }
    x += cw;
  });
  return out;
}

function hbars() {
  const rows = [[1, '#3987e5'], [0.95, '#3987e5'], [0.2, '#8b5cf6'], [0.15, '#8b5cf6'], [0.05, '#8b5cf6'], [0.03, '#3987e5']];
  return rows.map(([f, c], i) => {
    const y = CY + i * (CH / rows.length) + 10;
    const segs = Math.max(1, Math.round(f * 14));
    const sw = CW / 14;
    return Array.from({ length: segs }, (_, k) => `<rect x="${CX + k * sw}" y="${y}" width="${sw - 3}" height="${CH / rows.length - 22}" fill="${c}"/>`).join('');
  }).join('');
}

function network() {
  const cx = CX + CW / 2, cy = CY + CH / 2;
  let out = '';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 110 + (i % 3) * 50;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
    out += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e84142" stroke-opacity="0.18"/>`;
    out += `<circle cx="${x}" cy="${y}" r="${9 + (i % 4) * 3}" fill="#1c1f26" stroke="#ffffff" stroke-opacity="0.25"/>`;
  }
  return out + `<circle cx="${cx}" cy="${cy}" r="30" fill="#e84142"/>`;
}

// The C-Chain in the middle, L1s around it, each joined by a pair of legs: to the hub and back.
function hub() {
  const cx = CX + CW / 2, cy = CY + CH / 2;
  const sizes = [30, 22, 14, 12, 10, 9, 9, 8, 8, 7, 7, 7];
  let out = '';
  sizes.forEach((r, i) => {
    const a = -Math.PI / 2 + (i / sizes.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * 150, y = cy + Math.sin(a) * 150;
    const px = -Math.sin(a), py = Math.cos(a);
    const w = Math.max(2, r / 2.4);
    [[w / 2 + 1, '#3987e5'], [-(w / 2 + 1), '#d95926']].forEach(([o, c]) => {
      out += `<line x1="${x + px * o}" y1="${y + py * o}" x2="${cx + px * o}" y2="${cy + py * o}" stroke="${c}" stroke-width="${w}" stroke-opacity="0.6"/>`;
    });
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#1c1f26" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.5"/>`;
  });
  return out + `<circle cx="${cx}" cy="${cy}" r="34" fill="#e84142"/>`;
}

function rows() {
  const status = ['#d4a017', '#d4a017', '#3987e5', '#199e70', '#d4a017', '#199e70', '#199e70'];
  return status.map((c, i) => {
    const y = CY + i * 46 + 10;
    return `<circle cx="${CX + 8}" cy="${y + 8}" r="6" fill="${c}"/><rect x="${CX + 28}" y="${y}" width="${320 - (i % 3) * 60}" height="16" rx="3" fill="#ffffff" fill-opacity="0.18"/><rect x="${CX + 400}" y="${y}" width="120" height="16" rx="3" fill="#ffffff" fill-opacity="0.08"/>`;
  }).join('');
}

function code() {
  const lines = [['GET', '/api/v1/metrics/bridges?days=30', '#199e70'], ['GET', '/api/v1/metrics/dex/timeseries', '#199e70'], ['GET', '/api/v1/data/evm/43114/stablecoins', '#199e70'], ['WS', '/ws/blocks/43114', '#8b5cf6'], ['GET', '/api/v1/metrics/lending', '#199e70'], ['GET', '/api/v1/metrics/staking', '#199e70']];
  return lines.map(([m, path, c], i) => {
    const y = CY + 20 + i * 52;
    return `<rect x="${CX}" y="${y - 22}" width="${m.length * 14 + 18}" height="32" rx="4" fill="${c}" fill-opacity="0.18"/><text x="${CX + 9}" y="${y}" font-family="IBM Plex Mono" font-size="18" fill="${c}">${m}</text><text x="${CX + 80}" y="${y}" font-family="IBM Plex Mono" font-size="19" fill="#d4d4d8">${path}</text>`;
  }).join('');
}

function pulseArt() {
  // The logo's heartbeat, large, across the chart area.
  const pts = [[0, 0.5], [0.12, 0.5], [0.2, 0.18], [0.3, 0.86], [0.4, 0.3], [0.5, 0.7], [0.58, 0.5], [0.68, 0.5], [0.76, 0.18], [0.86, 0.86], [0.92, 0.5], [1, 0.5]];
  const xy = pts.map(([x, y]) => [CX + x * CW, CY + y * CH]);
  return `<path d="M${xy.map((p) => p.join(',')).join('L')}" fill="none" stroke="#ef4444" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>` +
    xy.slice(1, -1).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${9 + (i % 3) * 3}" fill="#ef4444"/>`).join('');
}

function perpsArt() {
  // Open interest: long above the axis, short below.
  const n = 50, mid = CY + CH / 2;
  const l = series(n, 31, 0.5, 0.18), sh = series(n, 37, 0.45, 0.18);
  const x = (i) => CX + (CW * i) / (n - 1);
  const up = `M${x(0)},${mid}L${l.map((v, i) => `${x(i)},${mid - v * CH * 0.45}`).join('L')}L${x(n - 1)},${mid}Z`;
  const dn = `M${x(0)},${mid}L${sh.map((v, i) => `${x(i)},${mid + v * CH * 0.45}`).join('L')}L${x(n - 1)},${mid}Z`;
  return `${grid()}<path d="${up}" fill="#3987e5" fill-opacity="0.8"/><path d="${dn}" fill="#d95926" fill-opacity="0.8"/><line x1="${CX}" x2="${CX + CW}" y1="${mid}" y2="${mid}" stroke="#ffffff" stroke-opacity="0.3"/>`;
}

const PULSE = `<path d="M 4 24 L 10 24 L 14 16 L 18 32 L 22 20 L 26 28 L 30 24 L 34 24 L 38 16 L 42 32 L 44 24" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="10" cy="24" r="2.5" fill="#ef4444"/><circle cx="14" cy="16" r="3" fill="#ef4444"/><circle cx="18" cy="32" r="2.5" fill="#ef4444"/>
  <circle cx="22" cy="20" r="2.5" fill="#ef4444"/><circle cx="26" cy="28" r="3.5" fill="#ef4444"/><circle cx="34" cy="24" r="2.5" fill="#ef4444"/>
  <circle cx="38" cy="16" r="3" fill="#ef4444"/><circle cx="42" cy="32" r="2.5" fill="#ef4444"/>`;

const CARDS = [
  { file: 'overview', path: '/', title: 'Avalanche L1s', sub: 'Live activity, validators and flows for every Avalanche L1.', art: network() },
  { file: 'metrics', path: '/metrics', title: 'Network metrics', sub: 'Transactions, TPS, fees and validators across the Avalanche L1s.', art: bars(['#22b8cf'], 3) },
  { file: 'stablecoins', path: '/stablecoins', title: 'Stablecoins', sub: 'Supply, volume and holders of every stablecoin on the C-Chain.', art: lineChart('#e5e7eb', 5) },
  { file: 'staking', path: '/staking', title: 'Staking', sub: 'AVAX staked on the Primary Network, validator by validator.', art: treemap() },
  { file: 'treasuries', path: '/treasuries', title: 'Treasuries & ETFs', sub: 'AVAX held by public companies and U.S. spot ETFs.', art: hbars() },
  { file: 'trading', path: '/trading', title: 'Trading', sub: 'Daily volume on Avalanche DEXes: LFJ, Pharaoh, Blackhole and more.', art: bars(['#d95926', '#e8508f', '#d4a017', '#6366f1'], 9) },
  { file: 'perps', path: '/perps', title: 'Perpetuals', sub: 'Leveraged trading on GMX: volume, open interest and liquidations.', art: perpsArt() },
  { file: 'lending', path: '/lending', title: 'Lending', sub: 'Supplied, borrowed and rates on Aave and BENQI on Avalanche.', art: area(['#8b5cf6', '#5b3fa8', '#22a6c9'], 13, '#ffffff') },
  { file: 'bridges', path: '/bridges', title: 'Bridges', sub: 'Money bridged to and from Avalanche, by chain and bridge.', art: sankey() },
  { file: 'interchain', path: '/interchain', title: 'Interchain', sub: 'ICM messages between Avalanche L1s and the C-Chain, by chain and day.', art: hub() },
  { file: 'burn', path: '/burn', title: 'AVAX burn', sub: 'Every C-Chain fee is burned. Live total and daily history.', art: bars(['#d95926', '#d4a017'], 21) },
  { file: 'acps', path: '/acps', title: 'Avalanche Community Proposals', sub: 'Every ACP from draft to activation.', art: rows() },
  { file: 'api', path: '/api', title: 'API playground', sub: 'Query the L1Beat REST and WebSocket API from the browser. No key needed.', art: code() },
  { file: 'blog', path: '/blog', title: 'Research and notes', sub: 'Validator economics, cross-chain messaging and L1 adoption.', art: pulseArt() },
  { file: 'services', path: '/services', title: 'Services', sub: 'Nodes, archive RPC, indexing and APIs for Avalanche L1 teams.', art: network() },
  { file: 'brand', path: '/brand', title: 'Brand guidelines', sub: 'The L1Beat logo, colours, type and downloadable assets.', art: pulseArt() },
  // The fallback for any page without a card of its own.
  { file: 'default', path: '/', title: 'L1Beat', sub: 'Analytics for Avalanche and its L1s: activity, staking, markets and more.', art: pulseArt() },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${W}px;height:${H}px;background:#0f1013;overflow:hidden}
  .t{position:absolute;left:64px;top:190px;width:500px;font-family:'IBM Plex Sans';color:#f4f4f5}
  h1{margin:0;font-size:${c.title.length > 22 ? 52 : 68}px;line-height:1.05;font-weight:600;letter-spacing:-0.01em}
  p{margin:22px 0 0;font-size:27px;line-height:1.35;color:#a1a1aa}
  .brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:12px;font-family:'IBM Plex Sans';font-weight:600;font-size:30px;color:#f4f4f5}
  .url{position:absolute;right:64px;top:66px;font-family:'IBM Plex Mono';font-size:22px;color:#71717a}
</style></head><body>
<div class="brand"><svg width="56" height="48" viewBox="0 0 48 48">${PULSE}</svg>L1Beat</div>
<div class="t"><h1>${c.title}</h1><p>${c.sub}</p></div>
<div class="url">l1beat.io${c.path === '/' ? '' : c.path}</div>
<svg width="${W}" height="${H}" style="position:absolute;inset:0">${c.art}</svg>
</body></html>`;

const PORT = 9333;
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=/tmp/l1beat-og-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(1500);
  const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0;
  const pending = new Map();
  ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await fs.mkdir(path.join(root, 'public/og'), { recursive: true });
  for (const c of CARDS) {
    const frame = (await send('Page.navigate', { url: 'about:blank' })).result.frameId;
    await send('Page.setDocumentContent', { frameId: frame, html: html(c) });
    await sleep(1200); // fonts
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    await fs.writeFile(path.join(root, 'public/og', `${c.file}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log(`public/og/${c.file}.png`);
  }
  ws.close();
} finally {
  chrome.kill();
}
