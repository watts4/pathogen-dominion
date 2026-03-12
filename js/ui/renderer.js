/**
 * Pathogen Dominion — Renderer
 *
 * Handles all visual output: SNES-style pixel-art body map on Canvas,
 * DOM-based UI panels, screen management (title, faction select, game,
 * research, victory/defeat), particles, notifications, and input.
 *
 * Internal canvas resolution: 640x480 (scaled via CSS for pixel-perfect look).
 * Color palette inspired by SNES RPGs.
 */

import { REGIONS, ADJACENCY, REGION_MAP } from '../data/regions.js';
import { FACTIONS } from '../data/factions.js';
import { RESEARCH, RESEARCH_CATEGORIES } from '../data/research.js';

// ── Palette ────────────────────────────────────────────────────────────────
const PAL = {
  bg1: '#1a1a2e',
  bg2: '#16213e',
  bg3: '#0f3460',
  bodyOutline: '#2a2a4a',
  panelBg: '#4a4a6a',
  panelBgDark: '#2a2a3e',
  cream: '#f0e6d3',
  positive: '#50c050',
  negative: '#c05050',
  warning: '#c0a030',
  info: '#5080c0',
  connectionDefault: '#4a4a6a',
  connectionBlood: '#a03030',
  connectionLymph: '#a0a030',
  connectionNeural: '#3050a0',
  white: '#ffffff',
  black: '#000000',
  dimmed: '#333346',
};

// ── Constants ──────────────────────────────────────────────────────────────
const MAP_W = 640;
const MAP_H = 480;
const REGION_BASE_RADIUS = 14;
const NOTIFICATION_LIFETIME = 180; // frames (~3 s at 60fps)
const PIXEL_FONT = "'Press Start 2P', 'Courier New', monospace";

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  return rgbToHex(lerp(c1.r, c2.r, t), lerp(c1.g, c2.g, t), lerp(c1.b, c2.b, t));
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function drawDitheredRect(ctx, x, y, w, h, color1, color2) {
  ctx.fillStyle = color1;
  ctx.fillRect(x, y, w, h);
  const c2 = hexToRgb(color2);
  const id = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if ((px + py) % 2 === 0) {
        const i = (py * w + px) * 4;
        id.data[i] = c2.r;
        id.data[i + 1] = c2.g;
        id.data[i + 2] = c2.b;
        id.data[i + 3] = 80;
      }
    }
  }
  ctx.putImageData(id, x, y);
}

// ════════════════════════════════════════════════════════════════════════════
// Renderer Class
// ════════════════════════════════════════════════════════════════════════════

export class Renderer {
  constructor(engine) {
    this.engine = engine;
    this.canvas = null;
    this.ctx = null;
    this.uiContainer = null;
    this.currentScreen = 'title';
    this.hoveredRegion = null;
    this.selectedRegion = null;
    this.showResearchOverlay = false;
    this.showEventOverlay = false;
    this.animationFrame = 0;
    this.particles = [];
    this.notifications = [];
    this.scanlineEnabled = false;
    this.crtEnabled = false;

    // Title / faction-select state
    this.titleMenuIndex = 0;
    this.factionSelectIndex = 0;
    this.difficultyIndex = 1; // 0 easy, 1 normal, 2 hard
    this.titlePulse = 0;

    // Mouse state (canvas-space)
    this.mouseX = -1;
    this.mouseY = -1;

    // Cached region lookup for hit-detection
    this._regionScreenCoords = [];

    // Render loop handle
    this._rafId = null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Initialisation
  // ──────────────────────────────────────────────────────────────────────

  init() {
    // Canvas
    this.canvas = document.getElementById('game-canvas');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'game-canvas';
      document.body.appendChild(this.canvas);
    }
    this.canvas.width = MAP_W;
    this.canvas.height = MAP_H;
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.imageRendering = 'crisp-edges';
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // UI container (for DOM panels)
    this.uiContainer = document.getElementById('ui-container');
    if (!this.uiContainer) {
      this.uiContainer = document.createElement('div');
      this.uiContainer.id = 'ui-container';
      document.body.appendChild(this.uiContainer);
    }

    // Inject base CSS for retro panels if not already present
    if (!document.getElementById('pd-styles')) {
      this._injectStyles();
    }

    // Event listeners — canvas
    this.canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => this._onCanvasMouseMove(e));

    // Keyboard
    window.addEventListener('keydown', (e) => this._onKeyDown(e));

    // Precompute screen coords for regions
    this._cacheRegionCoords();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Style injection
  // ──────────────────────────────────────────────────────────────────────

  _injectStyles() {
    const style = document.createElement('style');
    style.id = 'pd-styles';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: ${PAL.bg1};
        color: ${PAL.cream};
        font-family: ${PIXEL_FONT};
        font-size: 10px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
      }

      #game-canvas {
        display: block;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      #ui-container {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        font-family: ${PIXEL_FONT};
        font-size: 10px;
      }
      #ui-container > * { pointer-events: auto; }

      /* Retro window frame */
      .pd-panel {
        background: ${PAL.panelBgDark};
        border: 2px solid ${PAL.panelBg};
        box-shadow: inset 1px 1px 0 ${PAL.panelBg}, inset -1px -1px 0 #1a1a2e;
        color: ${PAL.cream};
        font-family: ${PIXEL_FONT};
        font-size: 9px;
        padding: 8px;
        image-rendering: pixelated;
      }
      .pd-panel-title {
        background: ${PAL.bg3};
        padding: 4px 8px;
        margin: -8px -8px 6px -8px;
        border-bottom: 2px solid ${PAL.panelBg};
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      /* Buttons */
      .pd-btn {
        background: ${PAL.panelBg};
        border: 2px solid #6a6a8a;
        color: ${PAL.cream};
        font-family: ${PIXEL_FONT};
        font-size: 9px;
        padding: 6px 12px;
        cursor: pointer;
        text-transform: uppercase;
        image-rendering: pixelated;
      }
      .pd-btn:hover { background: #5a5a7a; }
      .pd-btn:active { background: #3a3a5a; }
      .pd-btn.primary { border-color: ${PAL.positive}; }
      .pd-btn.danger { border-color: ${PAL.negative}; }
      .pd-btn.warning { border-color: ${PAL.warning}; }

      /* Resource bar */
      #resource-bar {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 36px;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 12px;
        background: ${PAL.panelBgDark};
        border-bottom: 2px solid ${PAL.panelBg};
        font-size: 8px;
        z-index: 10;
      }
      .res-item { display: flex; align-items: center; gap: 4px; }
      .res-bar-outer {
        width: 40px; height: 6px;
        background: #222;
        border: 1px solid ${PAL.panelBg};
      }
      .res-bar-inner { height: 100%; }

      /* Region info panel (right sidebar) */
      #region-panel {
        position: absolute;
        top: 38px; right: 0;
        width: 220px;
        bottom: 38px;
        overflow-y: auto;
        z-index: 10;
        scrollbar-width: thin;
      }
      .region-stat { display: flex; justify-content: space-between; margin: 2px 0; }
      .region-bar-outer { width: 80px; height: 8px; background: #222; border: 1px solid #555; display: inline-block; vertical-align: middle; }
      .region-bar-inner { height: 100%; display: block; }

      /* Action panel */
      #action-panel {
        position: absolute;
        bottom: 38px; right: 0;
        width: 220px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 6px;
        z-index: 10;
      }

      /* Bottom log bar */
      #log-bar {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 36px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        background: ${PAL.panelBgDark};
        border-top: 2px solid ${PAL.panelBg};
        font-size: 8px;
        overflow: hidden;
        z-index: 10;
      }
      #log-bar .log-entry { white-space: nowrap; }

      /* Research overlay */
      #research-overlay {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(10,10,20,0.92);
        z-index: 100;
        display: none;
        flex-direction: column;
      }
      #research-overlay.visible { display: flex; }

      /* Event popup */
      #event-popup {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        min-width: 300px;
        max-width: 420px;
        z-index: 200;
        display: none;
      }
      #event-popup.visible { display: block; }

      /* Notifications */
      #notification-area {
        position: absolute;
        top: 44px; left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        z-index: 150;
        pointer-events: none;
      }
      .notif {
        padding: 4px 12px;
        border: 1px solid;
        font-size: 8px;
        transition: opacity 0.3s;
        pointer-events: none;
      }
      .notif.info   { background: #1a2a4a; border-color: ${PAL.info}; color: ${PAL.info}; }
      .notif.good   { background: #1a3a1a; border-color: ${PAL.positive}; color: ${PAL.positive}; }
      .notif.bad    { background: #3a1a1a; border-color: ${PAL.negative}; color: ${PAL.negative}; }
      .notif.warning{ background: #3a3a1a; border-color: ${PAL.warning}; color: ${PAL.warning}; }

      /* Scanline overlay */
      #scanline-overlay {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
        z-index: 300;
        display: none;
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0,0,0,0.12) 2px,
          rgba(0,0,0,0.12) 4px
        );
      }
      #scanline-overlay.visible { display: block; }

      /* CRT warp */
      .crt-enabled #game-canvas {
        filter: contrast(1.05) brightness(1.02);
        border-radius: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Coordinate helpers
  // ──────────────────────────────────────────────────────────────────────

  _cacheRegionCoords() {
    this._regionScreenCoords = REGIONS.map((r) => ({
      id: r.id,
      x: r.x * MAP_W,
      y: r.y * MAP_H,
      radius: REGION_BASE_RADIUS * (r.size || 1),
    }));
  }

  _canvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = MAP_W / rect.width;
    const scaleY = MAP_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════

  showTitleScreen() {
    this.currentScreen = 'title';
    this.titleMenuIndex = 0;
    this._hideAllDomPanels();
    this._stopRenderLoop();
    this._startScreenLoop(() => this._renderTitleFrame());
  }

  showFactionSelect() {
    this.currentScreen = 'factionSelect';
    this.factionSelectIndex = 0;
    this._hideAllDomPanels();
    this._stopRenderLoop();
    this._startScreenLoop(() => this._renderFactionSelectFrame());
  }

  showGameScreen() {
    this.currentScreen = 'game';
    this._buildGameDom();
    this.startRenderLoop();
  }

  showVictoryScreen(stats = {}) {
    this.currentScreen = 'victory';
    this._hideAllDomPanels();
    this._stopRenderLoop();
    this._startScreenLoop(() => this._renderEndScreen('DOMINION ACHIEVED', PAL.positive, stats));
  }

  showDefeatScreen(reason = 'The immune system has won.') {
    this.currentScreen = 'defeat';
    this._hideAllDomPanels();
    this._stopRenderLoop();
    this._startScreenLoop(() => this._renderEndScreen(
      reason === 'host_death' ? 'HOST LOST' : 'PATHOGEN CLEARED',
      PAL.negative,
      { reason },
    ));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Title screen rendering
  // ──────────────────────────────────────────────────────────────────────

  _renderTitleFrame() {
    const ctx = this.ctx;
    this.animationFrame++;
    this.titlePulse = (Math.sin(this.animationFrame * 0.03) + 1) / 2;

    // Background
    ctx.fillStyle = PAL.bg1;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Animated cell pattern background
    this._drawCellPattern(ctx);

    // Title shadow
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 28px ${PIXEL_FONT}`;
    ctx.fillStyle = '#0a0a1e';
    ctx.fillText('PATHOGEN', MAP_W / 2 + 2, 130 + 2);
    ctx.fillText('DOMINION', MAP_W / 2 + 2, 170 + 2);
    // Title
    const titleColor = lerpColor('#c05050', '#e08080', this.titlePulse);
    ctx.fillStyle = titleColor;
    ctx.fillText('PATHOGEN', MAP_W / 2, 130);
    ctx.fillText('DOMINION', MAP_W / 2, 170);

    // Subtitle
    ctx.font = `10px ${PIXEL_FONT}`;
    ctx.fillStyle = lerpColor(PAL.panelBg, PAL.cream, this.titlePulse * 0.5 + 0.3);
    ctx.fillText('A Strategy of Survival', MAP_W / 2, 210);

    // Menu items
    const items = ['New Game', 'Options'];
    const menuTop = 280;
    const menuSpacing = 32;
    items.forEach((label, i) => {
      const y = menuTop + i * menuSpacing;
      const selected = i === this.titleMenuIndex;
      ctx.font = `12px ${PIXEL_FONT}`;
      ctx.fillStyle = selected ? PAL.cream : PAL.panelBg;
      ctx.fillText(label, MAP_W / 2, y);
      if (selected) {
        // Arrow indicator
        const textW = ctx.measureText(label).width;
        const arrowX = MAP_W / 2 - textW / 2 - 20;
        ctx.fillStyle = lerpColor(PAL.warning, PAL.cream, this.titlePulse);
        ctx.fillText('\u25B6', arrowX, y);
      }
    });

    // Version
    ctx.font = `8px ${PIXEL_FONT}`;
    ctx.fillStyle = PAL.panelBg;
    ctx.fillText('v0.1.0', MAP_W / 2, MAP_H - 20);
    ctx.restore();
  }

  _drawCellPattern(ctx) {
    // Slowly pulsing abstract cell/tissue dots
    const time = this.animationFrame * 0.008;
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 60; i++) {
      const seed = i * 137.508;
      const cx = (Math.sin(seed) * 0.5 + 0.5) * MAP_W;
      const cy = (Math.cos(seed * 0.7) * 0.5 + 0.5) * MAP_H;
      const r = 4 + Math.sin(time + seed) * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? '#c77070' : i % 3 === 1 ? '#7050a0' : '#3070a0';
      ctx.fill();
    }
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Faction select rendering
  // ──────────────────────────────────────────────────────────────────────

  _renderFactionSelectFrame() {
    const ctx = this.ctx;
    this.animationFrame++;
    this.titlePulse = (Math.sin(this.animationFrame * 0.03) + 1) / 2;

    ctx.fillStyle = PAL.bg1;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Header
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `14px ${PIXEL_FONT}`;
    ctx.fillStyle = PAL.cream;
    ctx.fillText('SELECT YOUR PATHOGEN', MAP_W / 2, 30);
    ctx.restore();

    const factions = typeof FACTIONS !== 'undefined' ? FACTIONS : [];
    if (factions.length === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `10px ${PIXEL_FONT}`;
      ctx.fillStyle = PAL.warning;
      ctx.fillText('No factions loaded', MAP_W / 2, MAP_H / 2);
      ctx.restore();
      return;
    }

    const listX = 20;
    const listW = 200;
    const detailX = 240;
    const detailW = 380;
    const itemH = 30;
    const listTop = 50;

    // Faction list (left)
    factions.forEach((fac, i) => {
      const y = listTop + i * itemH;
      const selected = i === this.factionSelectIndex;
      // Background
      ctx.fillStyle = selected ? PAL.panelBg : PAL.panelBgDark;
      ctx.fillRect(listX, y, listW, itemH - 2);
      // Border
      if (selected) {
        ctx.strokeStyle = PAL.warning;
        ctx.lineWidth = 2;
        ctx.strokeRect(listX, y, listW, itemH - 2);
      }
      // Color pip
      ctx.fillStyle = fac.color || PAL.cream;
      ctx.fillRect(listX + 6, y + 8, 10, 10);
      // Name
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `9px ${PIXEL_FONT}`;
      ctx.fillStyle = selected ? PAL.cream : '#8888aa';
      ctx.fillText(fac.name || fac.id, listX + 22, y + itemH / 2 - 1);
      ctx.restore();
    });

    // Detail panel (right)
    const sel = factions[this.factionSelectIndex];
    if (sel) {
      this._drawPixelRect(ctx, detailX, listTop, detailW, 340, PAL.panelBg, PAL.panelBgDark);

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const px = detailX + 12;
      let py = listTop + 12;

      // Faction name
      ctx.font = `12px ${PIXEL_FONT}`;
      ctx.fillStyle = sel.color || PAL.cream;
      ctx.fillText(sel.name || sel.id, px, py);
      py += 24;

      // Type / tagline
      ctx.font = `8px ${PIXEL_FONT}`;
      ctx.fillStyle = PAL.cream;
      ctx.fillText(sel.type || '', px, py);
      py += 18;

      // Stat bars
      const stats = sel.stats || {};
      const statNames = ['virulence', 'stealth', 'adaptability', 'resilience', 'replicationRate', 'toxicity'];
      const barW = 120;
      const barH = 8;
      statNames.forEach((s) => {
        const val = stats[s] ?? 0;
        ctx.fillStyle = '#888';
        ctx.fillText(s.replace(/([A-Z])/g, ' $1').toUpperCase(), px, py);
        this._drawBar(ctx, px + 150, py, barW, barH, val, 10, sel.color || PAL.positive);
        py += 16;
      });

      py += 8;

      // Strengths
      if (sel.strengths) {
        ctx.fillStyle = PAL.positive;
        ctx.fillText('STRENGTHS:', px, py);
        py += 14;
        ctx.fillStyle = PAL.cream;
        (Array.isArray(sel.strengths) ? sel.strengths : []).forEach((s) => {
          ctx.fillText('+ ' + s, px + 8, py);
          py += 12;
        });
      }
      py += 6;

      // Weaknesses
      if (sel.weaknesses) {
        ctx.fillStyle = PAL.negative;
        ctx.fillText('WEAKNESSES:', px, py);
        py += 14;
        ctx.fillStyle = PAL.cream;
        (Array.isArray(sel.weaknesses) ? sel.weaknesses : []).forEach((w) => {
          ctx.fillText('- ' + w, px + 8, py);
          py += 12;
        });
      }
      py += 6;

      // Passive
      if (sel.passive) {
        ctx.fillStyle = PAL.info;
        ctx.fillText('PASSIVE: ' + (sel.passive.name || ''), px, py);
        py += 14;
        ctx.fillStyle = '#aaa';
        this._drawWrappedText(ctx, sel.passive.description || '', px, py, detailW - 30, 11);
      }

      ctx.restore();
    }

    // Difficulty selector (bottom)
    const difficulties = ['Easy', 'Normal', 'Hard'];
    const diffY = MAP_H - 50;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `9px ${PIXEL_FONT}`;
    ctx.fillStyle = PAL.cream;
    ctx.fillText('DIFFICULTY:', 100, diffY);
    difficulties.forEach((d, i) => {
      const dx = 200 + i * 80;
      ctx.fillStyle = i === this.difficultyIndex ? PAL.warning : PAL.panelBg;
      ctx.fillText(d, dx, diffY);
    });
    ctx.restore();

    // Start button
    const btnX = MAP_W / 2;
    const btnY = MAP_H - 22;
    const pulse = lerpColor(PAL.positive, '#80ff80', this.titlePulse);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `11px ${PIXEL_FONT}`;
    ctx.fillStyle = pulse;
    ctx.fillText('[ ENTER ] START GAME', btnX, btnY);
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // End screens (victory / defeat)
  // ──────────────────────────────────────────────────────────────────────

  _renderEndScreen(title, color, data = {}) {
    const ctx = this.ctx;
    this.animationFrame++;
    this.titlePulse = (Math.sin(this.animationFrame * 0.03) + 1) / 2;

    ctx.fillStyle = PAL.bg1;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.font = `20px ${PIXEL_FONT}`;
    ctx.fillStyle = '#0a0a1e';
    ctx.fillText(title, MAP_W / 2 + 2, 120 + 2);
    ctx.fillStyle = lerpColor(color, PAL.cream, this.titlePulse * 0.3);
    ctx.fillText(title, MAP_W / 2, 120);

    // Stats
    ctx.font = `9px ${PIXEL_FONT}`;
    let sy = 180;
    const state = this.engine?.state;
    if (state) {
      const statLines = [
        `Turns Played: ${state.turn || 0}`,
        `Regions Colonized: ${Object.values(state.regions || {}).filter((r) => r.colonization >= 50).length}`,
        `Biomass Collected: ${state.resources?.biomass ?? 0}`,
      ];
      statLines.forEach((line) => {
        ctx.fillStyle = PAL.cream;
        ctx.fillText(line, MAP_W / 2, sy);
        sy += 20;
      });
    }
    if (data.reason) {
      ctx.fillStyle = PAL.warning;
      ctx.fillText(data.reason, MAP_W / 2, sy + 10);
    }

    // Play again
    ctx.font = `11px ${PIXEL_FONT}`;
    ctx.fillStyle = lerpColor(PAL.panelBg, PAL.cream, this.titlePulse);
    ctx.fillText('[ ENTER ] PLAY AGAIN', MAP_W / 2, MAP_H - 60);
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════════
  // GAME DOM CONSTRUCTION
  // ════════════════════════════════════════════════════════════════════════

  _buildGameDom() {
    // DOM panels are defined in index.html and managed by main.js.
    // The renderer only handles canvas rendering.
  }

  _hideAllDomPanels() {
    this.uiContainer.innerHTML = '';
  }

  // ════════════════════════════════════════════════════════════════════════
  // CANVAS MAP RENDERING
  // ════════════════════════════════════════════════════════════════════════

  renderMap() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // Background
    ctx.fillStyle = PAL.bg1;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    this._drawBackgroundTissue(ctx);

    // Body outline
    this.drawBodyOutline(ctx);

    // Connections
    this.drawConnections(ctx);

    // Regions
    const state = this.engine?.state;
    REGIONS.forEach((region) => {
      const rState = state?.regions?.[region.id] || {
        colonization: 0,
        immunePresence: region.defaultImmunePresence,
        inflammation: 0,
        damage: 0,
        discovered: region.entryPoint,
        reservoir: false,
        biofilm: false,
        modifiers: [],
      };
      this.drawRegion(ctx, region, rState);
    });

    // Immune activity animation
    this.drawImmuneActivity(ctx);

    // Particles
    this.drawParticles(ctx);

    // Hover tooltip
    if (this.hoveredRegion && this.currentScreen === 'game') {
      const region = REGION_MAP.get(this.hoveredRegion);
      const rState = state?.regions?.[this.hoveredRegion];
      if (region && rState) {
        this.drawTooltip(ctx, region, rState);
      }
    }

    // Selection ring
    if (this.selectedRegion) {
      const sc = this._regionScreenCoords.find((c) => c.id === this.selectedRegion);
      if (sc) {
        const pulse = Math.sin(this.animationFrame * 0.08) * 0.3 + 0.7;
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, sc.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Scanline overlay on canvas (optional alternative to CSS)
    if (this.scanlineEnabled) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < MAP_H; y += 4) {
        ctx.fillRect(0, y, MAP_W, 2);
      }
      ctx.restore();
    }
  }

  _drawBackgroundTissue(ctx) {
    // Subtle dithered tissue-like pattern
    ctx.save();
    ctx.globalAlpha = 0.06;
    const step = 16;
    for (let y = 0; y < MAP_H; y += step) {
      for (let x = 0; x < MAP_W; x += step) {
        const noise = Math.sin(x * 0.1 + y * 0.13 + this.animationFrame * 0.005) * 0.5 + 0.5;
        ctx.fillStyle = noise > 0.5 ? PAL.bg2 : PAL.bg3;
        ctx.fillRect(x, y, step, step);
      }
    }
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Body outline
  // ──────────────────────────────────────────────────────────────────────

  drawBodyOutline(ctx) {
    ctx.save();
    ctx.strokeStyle = PAL.bodyOutline;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();

    const cx = MAP_W * 0.50;

    // Head (circle)
    ctx.moveTo(cx + 28, MAP_H * 0.06);
    ctx.arc(cx, MAP_H * 0.06, 28, 0, Math.PI * 2);

    // Neck
    ctx.moveTo(cx - 8, MAP_H * 0.09);
    ctx.lineTo(cx - 8, MAP_H * 0.13);
    ctx.moveTo(cx + 8, MAP_H * 0.09);
    ctx.lineTo(cx + 8, MAP_H * 0.13);

    // Shoulders
    ctx.moveTo(cx - 8, MAP_H * 0.13);
    ctx.lineTo(cx - 55, MAP_H * 0.18);
    ctx.moveTo(cx + 8, MAP_H * 0.13);
    ctx.lineTo(cx + 55, MAP_H * 0.18);

    // Left arm
    ctx.moveTo(cx - 55, MAP_H * 0.18);
    ctx.lineTo(cx - 65, MAP_H * 0.35);
    ctx.lineTo(cx - 70, MAP_H * 0.48);

    // Right arm
    ctx.moveTo(cx + 55, MAP_H * 0.18);
    ctx.lineTo(cx + 65, MAP_H * 0.35);
    ctx.lineTo(cx + 70, MAP_H * 0.48);

    // Torso left
    ctx.moveTo(cx - 55, MAP_H * 0.18);
    ctx.bezierCurveTo(cx - 60, MAP_H * 0.30, cx - 55, MAP_H * 0.50, cx - 40, MAP_H * 0.60);

    // Torso right
    ctx.moveTo(cx + 55, MAP_H * 0.18);
    ctx.bezierCurveTo(cx + 60, MAP_H * 0.30, cx + 55, MAP_H * 0.50, cx + 40, MAP_H * 0.60);

    // Hips
    ctx.moveTo(cx - 40, MAP_H * 0.60);
    ctx.lineTo(cx - 35, MAP_H * 0.65);
    ctx.moveTo(cx + 40, MAP_H * 0.60);
    ctx.lineTo(cx + 35, MAP_H * 0.65);

    // Left leg
    ctx.moveTo(cx - 35, MAP_H * 0.65);
    ctx.lineTo(cx - 30, MAP_H * 0.82);
    ctx.lineTo(cx - 28, MAP_H * 0.95);

    // Right leg
    ctx.moveTo(cx + 35, MAP_H * 0.65);
    ctx.lineTo(cx + 30, MAP_H * 0.82);
    ctx.lineTo(cx + 28, MAP_H * 0.95);

    ctx.stroke();
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Connections
  // ──────────────────────────────────────────────────────────────────────

  drawConnections(ctx) {
    const state = this.engine?.state;
    const drawn = new Set();

    ctx.save();
    ctx.lineWidth = 1;

    for (const [regionId, neighbors] of Object.entries(ADJACENCY)) {
      const sc1 = this._regionScreenCoords.find((c) => c.id === regionId);
      if (!sc1) continue;

      const r1State = state?.regions?.[regionId];
      const r1Discovered = r1State?.discovered ?? REGION_MAP.get(regionId)?.entryPoint;

      for (const neighborId of neighbors) {
        const pairKey = [regionId, neighborId].sort().join('|');
        if (drawn.has(pairKey)) continue;
        drawn.add(pairKey);

        const sc2 = this._regionScreenCoords.find((c) => c.id === neighborId);
        if (!sc2) continue;

        const r2State = state?.regions?.[neighborId];
        const r2Discovered = r2State?.discovered ?? REGION_MAP.get(neighborId)?.entryPoint;

        // Dim if neither region discovered
        if (!r1Discovered && !r2Discovered) {
          ctx.globalAlpha = 0.08;
          ctx.strokeStyle = PAL.dimmed;
        } else {
          ctx.globalAlpha = 0.5;

          // Connection colour based on systems involved
          const r1 = REGION_MAP.get(regionId);
          const r2n = REGION_MAP.get(neighborId);
          const isBlood = regionId === 'bloodstream' || neighborId === 'bloodstream';
          const isLymph = regionId === 'lymph_nodes' || neighborId === 'lymph_nodes';
          const isNeural = regionId === 'peripheral_nerves' || neighborId === 'peripheral_nerves' ||
                           regionId === 'cns' || neighborId === 'cns';

          if (isNeural) {
            ctx.strokeStyle = PAL.connectionNeural;
          } else if (isLymph) {
            ctx.strokeStyle = PAL.connectionLymph;
          } else if (isBlood) {
            ctx.strokeStyle = PAL.connectionBlood;
          } else {
            ctx.strokeStyle = PAL.connectionDefault;
          }

          // Brighten if both colonised
          const bothColonised = (r1State?.colonization > 0) && (r2State?.colonization > 0);
          if (bothColonised && state?.faction?.color) {
            ctx.strokeStyle = lerpColor(ctx.strokeStyle, state.faction.color, 0.4);
            ctx.globalAlpha = 0.7;
          }
        }

        // Draw line (dashed for blood/lymph/neural, solid otherwise)
        ctx.beginPath();
        const isSpecial = regionId === 'bloodstream' || neighborId === 'bloodstream' ||
                          regionId === 'lymph_nodes' || neighborId === 'lymph_nodes' ||
                          regionId === 'peripheral_nerves' || neighborId === 'peripheral_nerves' ||
                          regionId === 'cns' || neighborId === 'cns';
        if (isSpecial) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.moveTo(sc1.x, sc1.y);
        ctx.lineTo(sc2.x, sc2.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Region drawing
  // ──────────────────────────────────────────────────────────────────────

  drawRegion(ctx, region, rState) {
    const sc = this._regionScreenCoords.find((c) => c.id === region.id);
    if (!sc) return;

    const { x, y, radius } = sc;
    const discovered = rState.discovered ?? region.entryPoint;

    ctx.save();

    // Undiscovered = very dim
    if (!discovered) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = PAL.dimmed;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#444';
      ctx.font = `6px ${PIXEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('?', x, y + 2);
      ctx.restore();
      return;
    }

    // Base fill colour (region colour, dimmed)
    const colonizationPct = Math.min(rState.colonization / 100, 1);
    const factionColor = this.engine?.state?.faction?.color || '#c05050';
    const baseColor = region.color;
    const fillColor = colonizationPct > 0 ? lerpColor(baseColor, factionColor, colonizationPct * 0.7) : baseColor;

    // Pulsing glow for hovered/selected
    const isHovered = this.hoveredRegion === region.id;
    const isSelected = this.selectedRegion === region.id;
    const highImmune = rState.immunePresence > 50;

    // Outer glow
    if (isSelected || isHovered) {
      ctx.save();
      const glowAlpha = 0.2 + Math.sin(this.animationFrame * 0.1) * 0.1;
      ctx.globalAlpha = glowAlpha;
      ctx.fillStyle = isSelected ? PAL.white : PAL.warning;
      ctx.beginPath();
      ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Main hexagonal shape (approximated as a 6-sided polygon)
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + radius * Math.cos(angle);
      const hy = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Border
    ctx.lineWidth = 2;
    if (isSelected) {
      ctx.strokeStyle = PAL.white;
    } else if (isHovered) {
      ctx.strokeStyle = PAL.warning;
    } else if (highImmune) {
      ctx.strokeStyle = PAL.negative;
    } else if (rState.reservoir) {
      ctx.strokeStyle = PAL.positive;
    } else {
      ctx.strokeStyle = PAL.panelBg;
    }
    ctx.stroke();

    // Inner colonisation bar (tiny horizontal bar below center)
    if (rState.colonization > 0) {
      const barW = radius * 1.4;
      const barH = 3;
      const barX = x - barW / 2;
      const barY = y + radius * 0.3;
      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = factionColor;
      ctx.fillRect(barX, barY, barW * colonizationPct, barH);
    }

    // Immune indicator (small red pip upper-right)
    if (rState.immunePresence > 50) {
      const pipR = 3;
      ctx.fillStyle = PAL.negative;
      ctx.beginPath();
      ctx.arc(x + radius * 0.5, y - radius * 0.5, pipR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reservoir icon (diamond)
    if (rState.reservoir) {
      ctx.save();
      ctx.translate(x - radius * 0.5, y - radius * 0.45);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PAL.positive;
      ctx.fillRect(-2, -2, 5, 5);
      ctx.restore();
    }

    // Biofilm icon (small shield upper-left)
    if (rState.biofilm) {
      ctx.save();
      ctx.fillStyle = PAL.info;
      ctx.beginPath();
      const sx = x - radius * 0.55;
      const sy = y - radius * 0.4;
      ctx.moveTo(sx, sy - 4);
      ctx.lineTo(sx + 4, sy - 2);
      ctx.lineTo(sx + 4, sy + 2);
      ctx.lineTo(sx, sy + 4);
      ctx.lineTo(sx - 4, sy + 2);
      ctx.lineTo(sx - 4, sy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Small pathogen sprites when colonised
    if (rState.colonization > 10) {
      const count = Math.min(Math.floor(rState.colonization / 20), 4);
      ctx.save();
      ctx.fillStyle = factionColor;
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < count; i++) {
        const angle = (this.animationFrame * 0.02 + i * (Math.PI * 2 / count));
        const orbR = radius * 0.45;
        const px = x + Math.cos(angle) * orbR;
        const py = y + Math.sin(angle) * orbR;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Name label below
    ctx.fillStyle = PAL.cream;
    ctx.globalAlpha = 0.8;
    ctx.font = `6px ${PIXEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(region.name, x, y + radius + 4);

    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Immune activity animation
  // ──────────────────────────────────────────────────────────────────────

  drawImmuneActivity(ctx) {
    const state = this.engine?.state;
    if (!state) return;

    ctx.save();
    const immuneAlertLevel = state.immuneAlertLevel ?? 0;
    const time = this.animationFrame;

    // For each region with high immune presence, emit subtle particles
    for (const region of REGIONS) {
      const rState = state.regions?.[region.id];
      if (!rState || !rState.discovered) continue;
      if (rState.immunePresence < 30) continue;

      const sc = this._regionScreenCoords.find((c) => c.id === region.id);
      if (!sc) continue;

      const intensity = rState.immunePresence / 100;
      const count = Math.floor(intensity * 3);

      ctx.globalAlpha = intensity * 0.4;
      for (let i = 0; i < count; i++) {
        const angle = time * 0.03 + i * 2.1 + sc.x * 0.01;
        const spreadR = sc.radius + 8 + Math.sin(time * 0.05 + i) * 4;
        const px = sc.x + Math.cos(angle) * spreadR;
        const py = sc.y + Math.sin(angle) * spreadR;

        // Small white/red particle
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ff6060';
        ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
      }

      // Antibody Y-shape indicator if adaptive response targeting this region
      if (rState.immunePresence > 70) {
        ctx.globalAlpha = 0.5 + Math.sin(time * 0.06) * 0.2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        const ax = sc.x + sc.radius + 6;
        const ay = sc.y - sc.radius - 2;
        // Y shape
        ctx.beginPath();
        ctx.moveTo(ax - 3, ay - 4);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax + 3, ay - 4);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax, ay + 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Particle system
  // ──────────────────────────────────────────────────────────────────────

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.restore();
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Spawn particles for a visual effect.
   * @param {'spread'|'immune_attack'|'research'|'damage'} type
   * @param {string} regionId — target region
   * @param {string} [fromRegionId] — source (for spread)
   */
  spawnEffect(type, regionId, fromRegionId) {
    const sc = this._regionScreenCoords.find((c) => c.id === regionId);
    if (!sc) return;

    const factionColor = this.engine?.state?.faction?.color || '#c05050';

    switch (type) {
      case 'spread': {
        const fromSc = fromRegionId
          ? this._regionScreenCoords.find((c) => c.id === fromRegionId)
          : null;
        const sx = fromSc ? fromSc.x : sc.x - 30;
        const sy = fromSc ? fromSc.y : sc.y;
        for (let i = 0; i < 8; i++) {
          this.particles.push({
            x: sx, y: sy,
            vx: (sc.x - sx) / 40 + (Math.random() - 0.5) * 0.5,
            vy: (sc.y - sy) / 40 + (Math.random() - 0.5) * 0.5,
            life: 40 + Math.random() * 20,
            maxLife: 60,
            color: factionColor,
            size: 2,
          });
        }
        break;
      }
      case 'immune_attack': {
        for (let i = 0; i < 12; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 0.8;
          this.particles.push({
            x: sc.x + Math.cos(angle) * 40,
            y: sc.y + Math.sin(angle) * 40,
            vx: -Math.cos(angle) * speed,
            vy: -Math.sin(angle) * speed,
            life: 50,
            maxLife: 50,
            color: i % 2 === 0 ? '#ff4040' : '#ffffff',
            size: 2,
          });
        }
        break;
      }
      case 'research': {
        for (let i = 0; i < 15; i++) {
          this.particles.push({
            x: sc.x + (Math.random() - 0.5) * 20,
            y: sc.y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -Math.random() * 1.5,
            life: 30 + Math.random() * 30,
            maxLife: 60,
            color: ['#ffff80', '#80ffff', '#ffffff'][i % 3],
            size: 2,
          });
        }
        break;
      }
      case 'damage': {
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          this.particles.push({
            x: sc.x,
            y: sc.y,
            vx: Math.cos(angle) * (1 + Math.random()),
            vy: Math.sin(angle) * (1 + Math.random()),
            life: 20 + Math.random() * 15,
            maxLife: 35,
            color: '#ff8040',
            size: 3,
          });
        }
        break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tooltip
  // ──────────────────────────────────────────────────────────────────────

  drawTooltip(ctx, region, rState) {
    const mx = this.mouseX;
    const my = this.mouseY;
    if (mx < 0 || my < 0) return;

    const ttW = 180;
    const ttH = 130;
    // Position tooltip so it doesn't go off-screen
    let tx = mx + 14;
    let ty = my - ttH / 2;
    if (tx + ttW > MAP_W) tx = mx - ttW - 14;
    if (ty < 4) ty = 4;
    if (ty + ttH > MAP_H - 4) ty = MAP_H - 4 - ttH;

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(20, 20, 40, 0.92)';
    ctx.fillRect(tx, ty, ttW, ttH);
    // Border
    ctx.strokeStyle = PAL.panelBg;
    ctx.lineWidth = 2;
    ctx.strokeRect(tx, ty, ttW, ttH);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let py = ty + 6;
    const px = tx + 6;
    const innerW = ttW - 12;

    // Name
    ctx.font = `8px ${PIXEL_FONT}`;
    ctx.fillStyle = PAL.cream;
    ctx.fillText(region.name, px, py);
    py += 13;

    // System
    ctx.font = `6px ${PIXEL_FONT}`;
    ctx.fillStyle = '#8888aa';
    ctx.fillText(region.system, px, py);
    py += 12;

    // Colonisation bar
    ctx.fillStyle = '#888';
    ctx.fillText('Colonization', px, py);
    this._drawBar(ctx, px + 80, py, 70, 7, rState.colonization, 100,
      this.engine?.state?.faction?.color || PAL.positive);
    py += 12;

    // Immune
    ctx.fillText('Immune', px, py);
    this._drawBar(ctx, px + 80, py, 70, 7, rState.immunePresence, 100, PAL.negative);
    py += 12;

    // Properties
    const props = region.properties;
    ctx.fillStyle = '#666';
    ctx.fillText(`pH ${props.ph}  O2 ${(props.oxygenLevel * 100).toFixed(0)}%  ${props.temperature}\u00B0C`, px, py);
    py += 12;

    // Modifiers / status
    const statuses = [];
    if (rState.reservoir) statuses.push('RESERVOIR');
    if (rState.biofilm) statuses.push('BIOFILM');
    if (rState.inflammation > 30) statuses.push('INFLAMED');
    if (rState.damage > 30) statuses.push('DAMAGED');
    if (statuses.length) {
      ctx.fillStyle = PAL.warning;
      ctx.fillText(statuses.join(' '), px, py);
    }

    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════════
  // DOM UI PANEL UPDATES
  // ════════════════════════════════════════════════════════════════════════

  updateResourceBar() {
    const bar = document.getElementById('resource-bar');
    if (!bar) return;
    const state = this.engine?.state;
    if (!state) return;

    const res = state.resources || {};
    const items = [
      { name: 'BIO', value: res.biomass ?? 0, max: 999, color: '#50c050' },
      { name: 'REP', value: res.replication ?? 0, max: 999, color: '#5080ff' },
      { name: 'DIV', value: res.diversity ?? 0, max: 999, color: '#c050c0' },
      { name: 'STL', value: res.stealth ?? 0, max: 100, color: '#80c0c0' },
      { name: 'NRG', value: res.energy ?? 0, max: 100, color: '#c0c050' },
    ];

    bar.innerHTML = `
      <span style="color:${PAL.warning};margin-right:8px;">TURN ${state.turn || 0}</span>
      <span style="color:#888;margin-right:8px;">${(state.phase || 'player').toUpperCase()}</span>
      ${items.map((it) => `
        <span class="res-item">
          <span style="color:${it.color}">${it.name}</span>
          <span>${it.value}</span>
          <span class="res-bar-outer">
            <span class="res-bar-inner" style="width:${Math.min(it.value / it.max * 100, 100)}%;background:${it.color}"></span>
          </span>
        </span>
      `).join('')}
    `;
  }

  updateRegionPanel() {
    const panel = document.getElementById('region-panel');
    if (!panel) return;
    const state = this.engine?.state;

    if (!this.selectedRegion || !state) {
      // Overview
      const colonised = Object.values(state?.regions || {}).filter((r) => r.colonization > 0).length;
      const total = REGIONS.length;
      panel.innerHTML = `
        <div class="pd-panel-title">OVERVIEW</div>
        <div class="region-stat"><span>Colonised</span><span>${colonised}/${total}</span></div>
        <div class="region-stat"><span>Alert Level</span><span>${state?.immuneAlertLevel ?? 0}</span></div>
        <div style="margin-top:10px;color:#888;font-size:7px;">Click a region on the map to see details.</div>
      `;
      this._updateActionPanel(null);
      return;
    }

    const region = REGION_MAP.get(this.selectedRegion);
    const rState = state.regions?.[this.selectedRegion];
    if (!region || !rState) return;

    const fColor = state.faction?.color || PAL.positive;

    panel.innerHTML = `
      <div class="pd-panel-title" style="color:${region.color}">${region.name}</div>
      <div style="color:#888;margin-bottom:4px;">${region.system}</div>
      <div style="font-size:7px;color:#aaa;margin-bottom:8px;line-height:1.4;">${region.description}</div>

      <div class="region-stat">
        <span>Colonization</span>
        <span class="region-bar-outer" style="width:100px;">
          <span class="region-bar-inner" style="width:${rState.colonization}%;background:${fColor}"></span>
        </span>
        <span>${rState.colonization.toFixed(0)}%</span>
      </div>
      <div class="region-stat">
        <span>Immune</span>
        <span class="region-bar-outer" style="width:100px;">
          <span class="region-bar-inner" style="width:${rState.immunePresence}%;background:${PAL.negative}"></span>
        </span>
        <span>${rState.immunePresence.toFixed(0)}%</span>
      </div>
      <div class="region-stat">
        <span>Inflammation</span>
        <span class="region-bar-outer" style="width:100px;">
          <span class="region-bar-inner" style="width:${rState.inflammation ?? 0}%;background:${PAL.warning}"></span>
        </span>
        <span>${(rState.inflammation ?? 0).toFixed(0)}%</span>
      </div>
      <div class="region-stat">
        <span>Damage</span>
        <span class="region-bar-outer" style="width:100px;">
          <span class="region-bar-inner" style="width:${rState.damage ?? 0}%;background:#a05050"></span>
        </span>
        <span>${(rState.damage ?? 0).toFixed(0)}%</span>
      </div>

      <div style="margin-top:8px;border-top:1px solid ${PAL.panelBg};padding-top:6px;">
        <div class="region-stat"><span>pH</span><span>${region.properties.ph}</span></div>
        <div class="region-stat"><span>O\u2082</span><span>${(region.properties.oxygenLevel * 100).toFixed(0)}%</span></div>
        <div class="region-stat"><span>Temp</span><span>${region.properties.temperature}\u00B0C</span></div>
        <div class="region-stat"><span>Nutrients</span><span>${(region.properties.nutrientAvailability * 100).toFixed(0)}%</span></div>
        <div class="region-stat"><span>Blood Flow</span><span>${(region.properties.bloodFlow * 100).toFixed(0)}%</span></div>
      </div>

      <div style="margin-top:8px;">
        ${rState.reservoir ? '<span style="color:' + PAL.positive + ';">[RESERVOIR]</span> ' : ''}
        ${rState.biofilm ? '<span style="color:' + PAL.info + ';">[BIOFILM]</span> ' : ''}
        ${(rState.modifiers || []).map((m) => `<span style="color:${PAL.warning};">[${m}]</span>`).join(' ')}
      </div>
    `;

    this._updateActionPanel(rState);
  }

  _updateActionPanel(rState) {
    // Build action buttons below the region panel
    let actionHtml = '';

    if (rState) {
      const region = REGION_MAP.get(this.selectedRegion);
      const state = this.engine?.state;

      // Spread button — if adjacent uncolonised regions exist
      const adjacentIds = ADJACENCY[this.selectedRegion] || [];
      const canSpread = rState.colonization > 20 && adjacentIds.some((id) => {
        const rs = state?.regions?.[id];
        return !rs || rs.colonization < 10;
      });
      if (canSpread) {
        actionHtml += `<button class="pd-btn primary" onclick="window.__pdAction('spread','${this.selectedRegion}')">SPREAD</button>`;
      }

      // Reinforce
      if (rState.colonization > 0 && rState.colonization < 100) {
        actionHtml += `<button class="pd-btn" onclick="window.__pdAction('reinforce','${this.selectedRegion}')">REINFORCE</button>`;
      }

      // Establish reservoir
      if (rState.colonization >= 70 && !rState.reservoir) {
        actionHtml += `<button class="pd-btn warning" onclick="window.__pdAction('reservoir','${this.selectedRegion}')">RESERVOIR</button>`;
      }

      // Biofilm
      if (rState.colonization >= 40 && !rState.biofilm) {
        actionHtml += `<button class="pd-btn" onclick="window.__pdAction('biofilm','${this.selectedRegion}')">BIOFILM</button>`;
      }
    }

    // Global actions
    actionHtml += `<button class="pd-btn" onclick="window.__pdAction('research')">RESEARCH</button>`;
    actionHtml += `<button class="pd-btn primary" onclick="window.__pdAction('endTurn')">END TURN</button>`;

    // Inject into region panel bottom or a separate div
    const panel = document.getElementById('region-panel');
    if (panel) {
      const actDiv = document.createElement('div');
      actDiv.style.cssText = 'margin-top:10px;border-top:1px solid #4a4a6a;padding-top:8px;display:flex;flex-wrap:wrap;gap:4px;';
      actDiv.innerHTML = actionHtml;
      panel.appendChild(actDiv);
    }
  }

  updateLog() {
    const logBar = document.getElementById('log-bar');
    if (!logBar) return;
    const logs = this.engine?.state?.log || [];
    const recent = logs.slice(-5).reverse();

    logBar.innerHTML = recent.map((entry) => {
      const color =
        entry.type === 'good' ? PAL.positive :
        entry.type === 'bad' ? PAL.negative :
        entry.type === 'event' || entry.type === 'warning' ? PAL.warning :
        PAL.cream;
      return `<span class="log-entry" style="color:${color}">${entry.text || entry}</span>`;
    }).join('<span style="color:#333;"> | </span>');
  }

  // ════════════════════════════════════════════════════════════════════════
  // RESEARCH PANEL (overlay)
  // ════════════════════════════════════════════════════════════════════════

  toggleResearchPanel() {
    this.showResearchOverlay = !this.showResearchOverlay;
    const el = document.getElementById('research-overlay');
    if (!el) return;

    if (this.showResearchOverlay) {
      el.classList.add('visible');
      this._renderResearchPanel(el);
    } else {
      el.classList.remove('visible');
    }
  }

  _renderResearchPanel(container) {
    const state = this.engine?.state;
    const categories = typeof RESEARCH_CATEGORIES !== 'undefined' ? RESEARCH_CATEGORIES : [];
    const allResearch = typeof RESEARCH !== 'undefined' ? RESEARCH : [];
    const completed = state?.completedResearch || [];
    const currentResearch = state?.currentResearch || null;
    const factionId = state?.faction?.id;

    let html = `
      <div style="padding:16px;overflow-y:auto;max-height:100vh;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:14px;color:${PAL.cream};">RESEARCH</span>
          <button class="pd-btn danger" onclick="window.__pdAction('closeResearch')">CLOSE</button>
        </div>
    `;

    if (currentResearch) {
      const cur = allResearch.find((r) => r.id === currentResearch.id);
      html += `
        <div class="pd-panel" style="margin-bottom:12px;border-color:${PAL.warning};">
          <div class="pd-panel-title" style="background:${PAL.warning};color:#000;">RESEARCHING</div>
          <div>${cur?.name || currentResearch.id}</div>
          <div style="margin-top:4px;">
            <span class="region-bar-outer" style="width:200px;">
              <span class="region-bar-inner" style="width:${((currentResearch.turnsSpent / (cur?.turnCost || 1)) * 100)}%;background:${PAL.warning}"></span>
            </span>
            <span>${currentResearch.turnsSpent}/${cur?.turnCost || '?'}</span>
          </div>
        </div>
      `;
    }

    // Group by category
    const grouped = {};
    for (const r of allResearch) {
      const cat = r.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(r);
    }

    for (const [catName, items] of Object.entries(grouped)) {
      html += `<div style="margin-top:10px;margin-bottom:4px;color:${PAL.info};font-size:10px;">${catName}</div>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;

      for (const r of items) {
        const isCompleted = completed.includes(r.id);
        const isResearching = currentResearch?.id === r.id;
        const prereqsMet = (r.prerequisites || []).every((p) => completed.includes(p));
        const factionLocked = r.factionExclusive && r.factionExclusive !== factionId;
        const available = !isCompleted && !isResearching && prereqsMet && !factionLocked;

        let borderColor = PAL.panelBg;
        let bgColor = PAL.panelBgDark;
        let labelColor = '#666';
        if (isCompleted) { borderColor = PAL.positive; labelColor = PAL.positive; }
        else if (isResearching) { borderColor = PAL.warning; labelColor = PAL.warning; bgColor = '#3a3520'; }
        else if (available) { labelColor = PAL.cream; }
        if (factionLocked) { labelColor = '#444'; }

        const cursor = available ? 'cursor:pointer;' : '';
        const onclick = available ? `onclick="window.__pdAction('startResearch','${r.id}')"` : '';

        html += `
          <div class="pd-panel" style="width:160px;border-color:${borderColor};background:${bgColor};${cursor}" ${onclick}>
            <div style="font-size:8px;color:${labelColor};margin-bottom:4px;">${r.name}${r.factionExclusive ? ' *' : ''}</div>
            <div style="font-size:7px;color:#888;">${r.description || ''}</div>
            <div style="font-size:7px;color:#666;margin-top:4px;">
              Cost: ${r.diversityCost ?? '?'}D / ${r.turnCost ?? '?'}T
            </div>
            ${isCompleted ? '<div style="color:' + PAL.positive + ';font-size:7px;">COMPLETE</div>' : ''}
            ${isResearching ? '<div style="color:' + PAL.warning + ';font-size:7px;">IN PROGRESS</div>' : ''}
            ${factionLocked ? '<div style="color:#555;font-size:7px;">FACTION LOCKED</div>' : ''}
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // ════════════════════════════════════════════════════════════════════════
  // EVENT POPUP
  // ════════════════════════════════════════════════════════════════════════

  showEventPopup(event) {
    const popup = document.getElementById('event-popup');
    if (!popup) return;
    this.showEventOverlay = true;

    const hasChoices = event.choices && event.choices.length > 0;
    let choicesHtml = '';
    if (hasChoices) {
      choicesHtml = event.choices.map((c, i) => `
        <button class="pd-btn" style="margin:4px 0;" onclick="window.__pdAction('eventChoice',${i})">${c.label || c.text || 'Choice ' + (i + 1)}</button>
      `).join('');
    } else {
      choicesHtml = `<button class="pd-btn primary" onclick="window.__pdAction('dismissEvent')">OK</button>`;
    }

    popup.innerHTML = `
      <div class="pd-panel-title" style="color:${PAL.warning}">${event.name || 'EVENT'}</div>
      <div style="font-size:8px;color:${PAL.cream};line-height:1.5;margin-bottom:8px;" id="event-typewriter"></div>
      <div style="font-size:7px;color:#aaa;margin-bottom:8px;">${event.effectSummary || ''}</div>
      <div>${choicesHtml}</div>
    `;
    popup.classList.add('visible');

    // Typewriter effect for description
    const desc = event.description || '';
    const target = document.getElementById('event-typewriter');
    if (target) {
      let idx = 0;
      const typeInterval = setInterval(() => {
        if (idx < desc.length) {
          target.textContent += desc[idx];
          idx++;
        } else {
          clearInterval(typeInterval);
        }
      }, 25);
      // Store interval so it can be cleared on dismiss
      this._typewriterInterval = typeInterval;
    }

    // Auto-dismiss after 8 seconds if no choices
    if (!hasChoices) {
      this._eventTimeout = setTimeout(() => this.dismissEventPopup(), 8000);
    }
  }

  dismissEventPopup() {
    const popup = document.getElementById('event-popup');
    if (popup) popup.classList.remove('visible');
    this.showEventOverlay = false;
    if (this._typewriterInterval) clearInterval(this._typewriterInterval);
    if (this._eventTimeout) clearTimeout(this._eventTimeout);
  }

  // ════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════

  addNotification(text, type = 'info') {
    const area = document.getElementById('notification-area');
    if (!area) return;

    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.textContent = text;
    area.appendChild(el);

    // Fade and remove
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
    setTimeout(() => { el.remove(); }, 3000);

    // Internal tracking
    this.notifications.push({ text, type, frame: this.animationFrame });
    if (this.notifications.length > 20) this.notifications.shift();
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER LOOP
  // ════════════════════════════════════════════════════════════════════════

  startRenderLoop() {
    this._stopRenderLoop();
    const loop = () => {
      this.animationFrame++;
      this.renderMap();
      this.updateParticles();
      // DOM panels are managed by main.js — renderer only handles canvas
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _startScreenLoop(renderFn) {
    this._stopRenderLoop();
    const loop = () => {
      renderFn();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // INPUT HANDLING
  // ════════════════════════════════════════════════════════════════════════

  _onCanvasClick(e) {
    const { x, y } = this._canvasCoords(e);

    if (this.currentScreen === 'title') {
      this._handleTitleClick(x, y);
      return;
    }
    if (this.currentScreen === 'factionSelect') {
      this._handleFactionSelectClick(x, y);
      return;
    }
    if (this.currentScreen === 'victory' || this.currentScreen === 'defeat') {
      this.showTitleScreen();
      return;
    }
    if (this.currentScreen === 'game') {
      this.handleCanvasClick(x, y);
    }
  }

  _onCanvasMouseMove(e) {
    const { x, y } = this._canvasCoords(e);
    this.mouseX = x;
    this.mouseY = y;

    if (this.currentScreen === 'game') {
      this.handleCanvasMouseMove(x, y);
    }
  }

  _onKeyDown(e) {
    if (this.currentScreen === 'title') {
      if (e.key === 'ArrowUp') {
        this.titleMenuIndex = Math.max(0, this.titleMenuIndex - 1);
      } else if (e.key === 'ArrowDown') {
        this.titleMenuIndex = Math.min(1, this.titleMenuIndex + 1);
      } else if (e.key === 'Enter') {
        if (this.titleMenuIndex === 0) this.showFactionSelect();
        // index 1 = Options (no-op for now)
      }
      return;
    }

    if (this.currentScreen === 'factionSelect') {
      const factions = typeof FACTIONS !== 'undefined' ? FACTIONS : [];
      if (e.key === 'ArrowUp') {
        this.factionSelectIndex = Math.max(0, this.factionSelectIndex - 1);
      } else if (e.key === 'ArrowDown') {
        this.factionSelectIndex = Math.min(factions.length - 1, this.factionSelectIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        this.difficultyIndex = Math.max(0, this.difficultyIndex - 1);
      } else if (e.key === 'ArrowRight') {
        this.difficultyIndex = Math.min(2, this.difficultyIndex + 1);
      } else if (e.key === 'Enter') {
        const fac = factions[this.factionSelectIndex];
        if (fac && this.engine?.startGame) {
          this.engine.startGame(fac.id, ['easy', 'normal', 'hard'][this.difficultyIndex]);
          this.showGameScreen();
        }
      }
      return;
    }

    if (this.currentScreen === 'victory' || this.currentScreen === 'defeat') {
      if (e.key === 'Enter') this.showTitleScreen();
      return;
    }

    if (this.currentScreen === 'game') {
      if (e.key === 'r' || e.key === 'R') this.toggleResearchPanel();
      if (e.key === 'Escape') {
        if (this.showResearchOverlay) this.toggleResearchPanel();
        else if (this.showEventOverlay) this.dismissEventPopup();
        else this.selectedRegion = null;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (this.engine?.endTurn) this.engine.endTurn();
      }
    }
  }

  _handleTitleClick(x, y) {
    // Check menu item hit areas
    const menuTop = 280;
    const menuSpacing = 32;
    const items = ['New Game', 'Options'];
    for (let i = 0; i < items.length; i++) {
      const iy = menuTop + i * menuSpacing;
      if (Math.abs(y - iy) < 14 && Math.abs(x - MAP_W / 2) < 80) {
        this.titleMenuIndex = i;
        if (i === 0) this.showFactionSelect();
        return;
      }
    }
  }

  _handleFactionSelectClick(x, y) {
    const factions = typeof FACTIONS !== 'undefined' ? FACTIONS : [];
    const listTop = 50;
    const itemH = 30;

    // Faction list
    for (let i = 0; i < factions.length; i++) {
      const iy = listTop + i * itemH;
      if (x >= 20 && x <= 220 && y >= iy && y <= iy + itemH - 2) {
        this.factionSelectIndex = i;
        return;
      }
    }

    // Difficulty
    const diffY = MAP_H - 50;
    const difficulties = [0, 1, 2];
    for (const d of difficulties) {
      const dx = 200 + d * 80;
      if (Math.abs(x - dx) < 30 && Math.abs(y - diffY) < 12) {
        this.difficultyIndex = d;
        return;
      }
    }

    // Start game button area
    if (y > MAP_H - 36 && y < MAP_H - 10 && x > MAP_W / 2 - 120 && x < MAP_W / 2 + 120) {
      const fac = factions[this.factionSelectIndex];
      if (fac && this.engine?.startGame) {
        this.engine.startGame(fac.id, ['easy', 'normal', 'hard'][this.difficultyIndex]);
        this.showGameScreen();
      }
    }
  }

  handleCanvasClick(x, y) {
    const regionId = this.getRegionAtPoint(x, y);
    if (regionId) {
      this.selectedRegion = regionId;
      if (this.onRegionSelect) this.onRegionSelect(regionId);
    } else {
      this.selectedRegion = null;
    }
  }

  handleCanvasMouseMove(x, y) {
    const regionId = this.getRegionAtPoint(x, y);
    this.hoveredRegion = regionId;
    this.canvas.style.cursor = regionId ? 'pointer' : 'default';
  }

  getRegionAtPoint(x, y) {
    const state = this.engine?.state;
    // Check in reverse so top-rendered regions have priority
    for (let i = this._regionScreenCoords.length - 1; i >= 0; i--) {
      const sc = this._regionScreenCoords[i];
      const rState = state?.regions?.[sc.id];
      const discovered = rState?.discovered ?? REGION_MAP.get(sc.id)?.entryPoint;
      if (!discovered) continue;
      if (dist(x, y, sc.x, sc.y) <= sc.radius + 2) {
        return sc.id;
      }
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // UTILITY DRAWING
  // ════════════════════════════════════════════════════════════════════════

  drawPixelText(ctx, text, x, y, size = 1, color = '#fff') {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.font = `${8 * size}px ${PIXEL_FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, Math.round(x), Math.round(y));
    ctx.restore();
  }

  _drawBar(ctx, x, y, width, height, value, maxValue, fillColor, bgColor = '#222') {
    x = Math.round(x);
    y = Math.round(y);
    width = Math.round(width);
    height = Math.round(height);
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);
    // Fill
    const fillW = Math.round((Math.min(value, maxValue) / maxValue) * (width - 2));
    ctx.fillStyle = fillColor;
    ctx.fillRect(x + 1, y + 1, fillW, height - 2);
    // Border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }

  _drawPixelRect(ctx, x, y, w, h, borderColor = '#fff', fillColor = null, borderWidth = 1) {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(x, y, w, h);
  }

  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, cy);
        line = word + ' ';
        cy += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), x, cy);
  }

  // ── Color helpers ────────────────────────────────────────────────────

  getColonizationColor(level, factionColor) {
    // Blend from neutral gray to faction colour based on colonisation %
    return lerpColor('#3a3a4a', factionColor, Math.min(level / 100, 1));
  }

  getImmuneColor(level) {
    // Green (low) through yellow to red (high)
    if (level < 50) {
      return lerpColor(PAL.positive, PAL.warning, level / 50);
    }
    return lerpColor(PAL.warning, PAL.negative, (level - 50) / 50);
  }

  // ── Toggles ──────────────────────────────────────────────────────────

  toggleScanlines() {
    this.scanlineEnabled = !this.scanlineEnabled;
    const el = document.getElementById('scanline-overlay');
    if (el) el.classList.toggle('visible', this.scanlineEnabled);
  }

  toggleCRT() {
    this.crtEnabled = !this.crtEnabled;
    document.body.classList.toggle('crt-enabled', this.crtEnabled);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  destroy() {
    this._stopRenderLoop();
    this.canvas?.removeEventListener('click', this._onCanvasClick);
    this.canvas?.removeEventListener('mousemove', this._onCanvasMouseMove);
  }
}

// ── Global action bridge ──────────────────────────────────────────────────
// DOM onclick handlers call window.__pdAction which the engine should bind.
// This provides a default no-op so the renderer can work standalone.
if (typeof window !== 'undefined' && !window.__pdAction) {
  window.__pdAction = (action, ...args) => {
    console.log('[Pathogen Dominion] Action:', action, ...args);
  };
}
