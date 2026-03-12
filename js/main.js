import { GameEngine, DIFFICULTY } from './engine/game.js';
import { FACTIONS } from './data/factions.js';
import { REGIONS } from './data/regions.js';
import { RESEARCH, RESEARCH_CATEGORIES, RESEARCH_MAP } from './data/research.js';
import { Renderer } from './ui/renderer.js';

class PathogenDominion {
  constructor() {
    this.engine = new GameEngine();
    this.renderer = new Renderer(this.engine);
    this.selectedFaction = null;
    this.selectedDifficulty = 'normal';
  }

  init() {
    this.renderer.init();
    this.setupTitleScreen();
    this.setupFactionScreen();
    this.setupGameScreen();
    this.setupEventHandlers();
    this.checkForSavedGame();
    this.showScreen('title');
  }

  setupTitleScreen() {
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this.showScreen('faction');
    });

    document.getElementById('btn-load-game').addEventListener('click', () => {
      this.loadGame();
    });

    document.getElementById('btn-options').addEventListener('click', () => {
      this.showOptionsFromTitle();
    });
  }

  setupFactionScreen() {
    const list = document.getElementById('faction-list');

    // Populate faction list
    FACTIONS.forEach(faction => {
      const item = document.createElement('div');
      item.className = 'faction-item';
      item.dataset.factionId = faction.id;
      item.innerHTML = `
        <span class="faction-icon">${faction.icon}</span>
        <div class="faction-info">
          <span class="faction-name">${faction.name}</span>
          <span class="faction-type">${faction.subtitle}</span>
        </div>
      `;
      item.addEventListener('click', () => this.selectFaction(faction));
      list.appendChild(item);
    });

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDifficulty = btn.dataset.diff;
      });
    });

    // Start button
    document.getElementById('btn-start-game').addEventListener('click', () => {
      if (this.selectedFaction) {
        this.startGame();
      }
    });
  }

  selectFaction(faction) {
    this.selectedFaction = faction;

    // Update selection highlight
    document.querySelectorAll('.faction-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.factionId === faction.id);
      item.style.borderColor = item.dataset.factionId === faction.id ? faction.color : '';
    });

    // Update detail panel
    const detail = document.getElementById('faction-detail');
    const statNames = ['replicationRate', 'persistence', 'stealth', 'mutationRate', 'tissueRange', 'damageOutput', 'immuneEvasion', 'environmentalTolerance'];
    const statLabels = ['Replication', 'Persistence', 'Stealth', 'Mutation Rate', 'Tissue Range', 'Damage', 'Immune Evasion', 'Env. Tolerance'];

    detail.innerHTML = `
      <h3>${faction.icon} ${faction.name}</h3>
      <div class="faction-subtitle">${faction.subtitle}</div>
      <div class="faction-desc">${faction.description}</div>

      <div class="stats-section">
        ${statNames.map((stat, i) => `
          <div class="stat-row">
            <span class="stat-name">${statLabels[i]}</span>
            <div class="stat-bar">
              <div class="stat-fill" style="width: ${faction.stats[stat] * 10}%; background: ${faction.color}"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="traits-section">
        <h4>STRENGTHS</h4>
        <div class="trait-list">
          ${faction.strengths.map(s => `<span class="trait-tag" style="border-color: ${faction.color}">${s}</span>`).join('')}
        </div>
      </div>

      <div class="traits-section">
        <h4>WEAKNESSES</h4>
        <div class="trait-list">
          ${faction.weaknesses.map(w => `<span class="trait-tag" style="border-color: var(--accent-red)">${w}</span>`).join('')}
        </div>
      </div>

      <div class="traits-section">
        <h4>PASSIVE: ${faction.passiveAbility.name}</h4>
        <p class="faction-desc">${faction.passiveAbility.description}</p>
      </div>

      <div class="traits-section">
        <h4>PREFERRED TISSUES</h4>
        <div class="trait-list">
          ${faction.preferredTissues.map(t => {
            const region = REGIONS.find(r => r.id === t);
            return `<span class="trait-tag">${region ? region.name : t}</span>`;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-start-game').disabled = false;
  }

  startGame() {
    this.engine.newGame(this.selectedFaction.id, this.selectedDifficulty);
    this.showScreen('game');
    this.renderer.showGameScreen();
    this.renderer.startRenderLoop();
    this.updateUI();
  }

  setupGameScreen() {
    // End Turn button
    document.getElementById('btn-end-turn').addEventListener('click', () => this.endTurn());

    // Research button
    document.getElementById('btn-research').addEventListener('click', () => this.toggleResearch());
    document.getElementById('btn-close-research').addEventListener('click', () => this.toggleResearch());

    // Overview button
    document.getElementById('btn-overview').addEventListener('click', () => this.toggleOverview());
    document.getElementById('btn-close-overview').addEventListener('click', () => this.toggleOverview());

    // Event popup OK
    document.getElementById('btn-event-ok').addEventListener('click', () => {
      document.getElementById('event-popup').classList.add('hidden');
    });

    // Options in-game
    document.getElementById('btn-close-options').addEventListener('click', () => {
      document.getElementById('options-panel').classList.add('hidden');
    });

    // Save/Load/Export buttons
    document.getElementById('btn-save-game').addEventListener('click', () => this.saveGame());
    document.getElementById('btn-export-save').addEventListener('click', () => this.exportSave());
    document.getElementById('btn-import-save').addEventListener('click', () => {
      document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', (e) => this.importSave(e));
    document.getElementById('btn-quit-to-title').addEventListener('click', () => {
      document.getElementById('options-panel').classList.add('hidden');
      this.showScreen('title');
    });

    // Visual options
    document.getElementById('opt-scanlines').addEventListener('change', (e) => {
      document.getElementById('scanline-overlay').classList.toggle('hidden', !e.target.checked);
      this.renderer.scanlineEnabled = e.target.checked;
    });

    // Endgame buttons
    document.getElementById('btn-play-again').addEventListener('click', () => this.showScreen('faction'));
    document.getElementById('btn-try-again').addEventListener('click', () => this.showScreen('faction'));

    // Engine event listeners
    this.engine.on('log', (data) => this.addLogEntry(data));
    this.engine.on('regionUpdate', () => this.updateUI());
    this.engine.on('event', (data) => this.showEvent(data));
    this.engine.on('victory', (data) => this.showVictory(data));
    this.engine.on('defeat', (data) => this.showDefeat(data));
    this.engine.on('researchCompleted', (data) => this.onResearchComplete(data));
    this.engine.on('turnEnd', () => this.updateUI());

    // Canvas click handler via renderer
    this.renderer.onRegionSelect = (regionId) => this.onRegionSelect(regionId);
    this.renderer.onRegionAction = (action, regionId) => this.onRegionAction(action, regionId);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close any open overlay
        document.querySelectorAll('.overlay-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById('event-popup').classList.add('hidden');
      }
      if (e.key === 'Enter' || e.key === ' ') {
        // Dismiss event popup if showing
        const popup = document.getElementById('event-popup');
        if (!popup.classList.contains('hidden')) {
          popup.classList.add('hidden');
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        // Toggle research
        if (!document.getElementById('event-popup').classList.contains('hidden')) return;
        this.toggleResearch();
      }
      if (e.key === 'e' || e.key === 'E') {
        // End turn
        if (!document.getElementById('event-popup').classList.contains('hidden')) return;
        if (document.querySelectorAll('.overlay-panel:not(.hidden)').length > 0) return;
        this.endTurn();
      }
    });
  }

  setupEventHandlers() {
    // Additional global event handlers can go here
  }

  onRegionSelect(regionId) {
    if (!this.engine.state) return;
    this.engine.state.selectedRegion = regionId;
    this.renderer.selectedRegion = regionId;
    this.updateRegionPanel(regionId);
  }

  onRegionAction(action, regionId) {
    if (!this.engine.state) return;
    let result;
    switch(action) {
      case 'spread':
        result = this.engine.spreadTo(regionId);
        break;
      case 'reinforce':
        result = this.engine.reinforceRegion(regionId);
        break;
      case 'reservoir':
        result = this.engine.establishReservoir(regionId);
        break;
      case 'biofilm':
        result = this.engine.buildBiofilm(regionId);
        break;
    }
    if (result) {
      this.addNotification(result.message, result.success ? 'good' : 'bad');
    }
    this.updateUI();
  }

  endTurn() {
    if (!this.engine.state || this.engine.state.gameOver) return;

    const result = this.engine.endTurn();

    // Show events if any
    if (result.events && result.events.length > 0) {
      this.showEventQueue(result.events);
    }

    this.updateUI();

    // Check game over
    if (this.engine.state.gameOver) {
      if (this.engine.state.victory) {
        this.showVictoryScreen();
      } else {
        this.showDefeatScreen();
      }
    }
  }

  updateUI() {
    if (!this.engine.state) return;
    const state = this.engine.state;

    // Update resource bar
    document.getElementById('val-turn').textContent = state.turn;
    document.getElementById('val-biomass').textContent = Math.floor(state.resources.biomass);
    document.getElementById('val-replication').textContent = Math.floor(state.resources.replicationCapacity);
    document.getElementById('val-diversity').textContent = Math.floor(state.resources.geneticDiversity);
    document.getElementById('val-stealth').textContent = Math.floor(state.resources.stealth);
    document.getElementById('val-energy').textContent = Math.floor(state.resources.energy);
    document.getElementById('val-alert').textContent = Math.floor(state.immune.alertLevel);

    document.getElementById('fill-biomass').style.width = `${Math.min(100, state.resources.biomass / 2)}%`;
    document.getElementById('fill-replication').style.width = `${state.resources.replicationCapacity * 10}%`;
    document.getElementById('fill-diversity').style.width = `${Math.min(100, state.resources.geneticDiversity * 5)}%`;
    document.getElementById('fill-stealth').style.width = `${state.resources.stealth}%`;
    document.getElementById('fill-energy').style.width = `${Math.min(100, state.resources.energy * 5)}%`;
    document.getElementById('fill-alert').style.width = `${state.immune.alertLevel}%`;

    // Update region panel if a region is selected
    if (state.selectedRegion) {
      this.updateRegionPanel(state.selectedRegion);
    }
  }

  updateRegionPanel(regionId) {
    const state = this.engine.state;
    const region = REGIONS.find(r => r.id === regionId);
    const regionState = state.regions[regionId];
    if (!region || !regionState) return;

    document.getElementById('region-name').textContent = region.name;

    const content = document.getElementById('region-content');
    const isColonized = regionState.colonization > 0;
    const isAdjacentToColonized = this.engine.getSpreadTargets().some(t => t.id === regionId);
    const canSpread = !isColonized && isAdjacentToColonized && state.resources.replicationCapacity >= 2;
    const canReinforce = isColonized && state.resources.replicationCapacity >= 1;
    const canReservoir = regionState.colonization >= 70 && !regionState.isReservoir && state.resources.energy >= 5;
    const canBiofilm = isColonized && !regionState.hasBiofilm && state.resources.energy >= 3 && state.resources.biomass >= 5;

    content.innerHTML = `
      <div class="region-desc">${region.description}</div>
      <div class="region-stat"><span class="stat-label">System</span><span class="stat-value">${region.system}</span></div>

      <div class="region-stat"><span class="stat-label">Colonization</span><span class="stat-value">${Math.floor(regionState.colonization)}%</span></div>
      <div class="region-bar"><div class="region-bar-fill" style="width: ${regionState.colonization}%; background: ${state.faction.color}"></div></div>

      <div class="region-stat"><span class="stat-label">Immune Presence</span><span class="stat-value">${Math.floor(regionState.immunePresence)}%</span></div>
      <div class="region-bar"><div class="region-bar-fill" style="width: ${regionState.immunePresence}%; background: var(--accent-red)"></div></div>

      <div class="region-stat"><span class="stat-label">Inflammation</span><span class="stat-value">${Math.floor(regionState.inflammation)}%</span></div>
      <div class="region-bar"><div class="region-bar-fill" style="width: ${regionState.inflammation}%; background: var(--accent-yellow)"></div></div>

      <div class="region-stat"><span class="stat-label">Tissue Damage</span><span class="stat-value">${Math.floor(regionState.damage)}%</span></div>
      <div class="region-bar"><div class="region-bar-fill" style="width: ${regionState.damage}%; background: #c06060"></div></div>

      ${regionState.isReservoir ? '<div class="region-stat"><span class="stat-label" style="color:var(--accent-green)">&#9670; RESERVOIR ESTABLISHED</span></div>' : ''}
      ${regionState.hasBiofilm ? '<div class="region-stat"><span class="stat-label" style="color:var(--accent-blue)">&#9670; BIOFILM ACTIVE</span></div>' : ''}

      <div class="region-props">
        <div class="region-prop"><span class="prop-label">pH</span><span class="prop-value">${region.properties.ph}</span></div>
        <div class="region-prop"><span class="prop-label">O2</span><span class="prop-value">${(region.properties.oxygenLevel * 100).toFixed(0)}%</span></div>
        <div class="region-prop"><span class="prop-label">Temp</span><span class="prop-value">${region.properties.temperature}C</span></div>
        <div class="region-prop"><span class="prop-label">Nutrients</span><span class="prop-value">${(region.properties.nutrientAvailability * 100).toFixed(0)}%</span></div>
        <div class="region-prop"><span class="prop-label">Barrier</span><span class="prop-value">${(region.properties.epithelialBarrier * 100).toFixed(0)}%</span></div>
        <div class="region-prop"><span class="prop-label">Microbiome</span><span class="prop-value">${(region.properties.microbiomeCompetition * 100).toFixed(0)}%</span></div>
      </div>
    `;

    // Update action buttons
    const actionDiv = document.getElementById('action-buttons');
    actionDiv.innerHTML = '';

    if (canSpread) {
      actionDiv.innerHTML += `<button class="action-btn" onclick="window.game.onRegionAction('spread', '${regionId}')">
        > SPREAD HERE <span class="action-cost">2 Rep</span>
      </button>`;
    }
    if (canReinforce) {
      actionDiv.innerHTML += `<button class="action-btn" onclick="window.game.onRegionAction('reinforce', '${regionId}')">
        ^ REINFORCE <span class="action-cost">1 Rep</span>
      </button>`;
    }
    if (canReservoir) {
      actionDiv.innerHTML += `<button class="action-btn" onclick="window.game.onRegionAction('reservoir', '${regionId}')">
        * ESTABLISH RESERVOIR <span class="action-cost">5 Energy</span>
      </button>`;
    }
    if (canBiofilm) {
      actionDiv.innerHTML += `<button class="action-btn" onclick="window.game.onRegionAction('biofilm', '${regionId}')">
        + BUILD BIOFILM <span class="action-cost">3 Energy, 5 Biomass</span>
      </button>`;
    }
    if (!canSpread && !canReinforce && !canReservoir && !canBiofilm) {
      if (!regionState.visible) {
        actionDiv.innerHTML = '<div style="font-size:8px;color:var(--text-dim);padding:8px;">Region not yet discovered</div>';
      } else if (!isColonized && !isAdjacentToColonized) {
        actionDiv.innerHTML = '<div style="font-size:8px;color:var(--text-dim);padding:8px;">Not adjacent to colonized territory</div>';
      } else {
        actionDiv.innerHTML = '<div style="font-size:8px;color:var(--text-dim);padding:8px;">No actions available</div>';
      }
    }
  }

  toggleResearch() {
    const panel = document.getElementById('research-panel');
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (isHidden) {
      this.renderResearchPanel();
    }
  }

  renderResearchPanel() {
    if (!this.engine.state) return;
    const state = this.engine.state;

    // Render category tabs
    const catContainer = document.getElementById('research-categories');
    catContainer.innerHTML = RESEARCH_CATEGORIES.map(cat => `
      <button class="research-cat ${this.selectedResearchCategory === cat.id ? 'active' : ''}"
              data-cat="${cat.id}"
              onclick="window.game.selectResearchCategory('${cat.id}')">
        ${cat.name}
      </button>
    `).join('');

    if (!this.selectedResearchCategory) {
      this.selectedResearchCategory = RESEARCH_CATEGORIES[0].id;
    }
    this.renderResearchTree();
    this.renderResearchCurrent();
  }

  selectResearchCategory(catId) {
    this.selectedResearchCategory = catId;
    document.querySelectorAll('.research-cat').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === catId);
    });
    this.renderResearchTree();
  }

  renderResearchTree() {
    if (!this.engine.state) return;
    const state = this.engine.state;
    const available = this.engine.getAvailableResearch();
    const availableIds = available.map(r => r.id);

    const filtered = RESEARCH.filter(r => {
      if (r.category !== this.selectedResearchCategory) return false;
      if (r.factionExclusive && r.factionExclusive !== state.faction.id) return false;
      return true;
    }).sort((a, b) => a.tier - b.tier);

    const treeContainer = document.getElementById('research-tree');
    treeContainer.innerHTML = filtered.map(r => {
      const isCompleted = state.research.completed.includes(r.id);
      const isResearching = state.research.current && state.research.current.id === r.id;
      const isAvailable = availableIds.includes(r.id);
      const statusClass = isCompleted ? 'completed' : isResearching ? 'researching' : isAvailable ? 'available' : 'locked';

      return `<div class="research-item ${statusClass}" onclick="window.game.selectResearch('${r.id}')">
        <div class="ri-tier">T${r.tier}</div>
        <div class="ri-name">${r.name}</div>
        <div class="ri-cost">${isCompleted ? '* DONE' : isResearching ? 'IN PROGRESS' : `${r.cost.diversity} Div / ${r.cost.turns} Turns`}</div>
      </div>`;
    }).join('');
  }

  selectResearch(researchId) {
    const research = RESEARCH_MAP.get(researchId);
    if (!research) return;
    const state = this.engine.state;
    const isCompleted = state.research.completed.includes(researchId);
    const isResearching = state.research.current && state.research.current.id === researchId;
    const isAvailable = this.engine.getAvailableResearch().some(r => r.id === researchId);

    const detail = document.getElementById('research-detail');
    detail.innerHTML = `
      <h4>${research.name}</h4>
      <div class="rd-desc">${research.description}</div>
      <div class="rd-effects">+ ${research.effects.map(e => `${e.type}: ${e.value > 0 ? '+' : ''}${e.value}${e.target ? ` (${e.target})` : ''}`).join('<br>+ ')}</div>
      <div class="rd-tradeoff">! ${research.tradeoff.description}</div>
      <div class="rd-flavor">"${research.flavor}"</div>
      <div style="font-size:8px;color:var(--text-dim);margin-bottom:8px;">
        Cost: ${research.cost.diversity} Diversity / ${research.cost.turns} Turns<br>
        ${research.prerequisites.length > 0 ? 'Requires: ' + research.prerequisites.map(p => RESEARCH_MAP.get(p)?.name || p).join(', ') : 'No prerequisites'}
      </div>
      ${!isCompleted && !isResearching && isAvailable ?
        `<button class="pixel-btn" onclick="window.game.beginResearch('${researchId}')">BEGIN RESEARCH</button>` :
        isCompleted ? '<div style="color:var(--accent-green);font-size:10px;">* COMPLETED</div>' :
        isResearching ? '<div style="color:var(--accent-yellow);font-size:10px;">~ RESEARCHING...</div>' :
        '<div style="color:var(--text-dim);font-size:10px;">LOCKED</div>'}
    `;
  }

  beginResearch(researchId) {
    const result = this.engine.startResearch(researchId);
    if (result.success) {
      this.addNotification(`Research started: ${result.name}`, 'good');
      this.renderResearchPanel();
      this.updateUI();
    } else {
      this.addNotification(result.message, 'bad');
    }
  }

  renderResearchCurrent() {
    const container = document.getElementById('research-current');
    const state = this.engine.state;
    if (state.research.current) {
      const r = RESEARCH_MAP.get(state.research.current.id);
      const totalTurns = r ? r.cost.turns : 1;
      const elapsed = totalTurns - state.research.current.turnsRemaining;
      const pct = (elapsed / totalTurns) * 100;
      container.innerHTML = `
        <span style="color:var(--accent-yellow);">RESEARCHING: ${r ? r.name : '???'}</span>
        <span style="color:var(--text-dim);"> (${state.research.current.turnsRemaining} turns left)</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      `;
    } else {
      container.innerHTML = '<span style="color:var(--text-dim);">No active research</span>';
    }
  }

  toggleOverview() {
    const panel = document.getElementById('overview-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      this.renderOverview();
    }
  }

  renderOverview() {
    if (!this.engine.state) return;
    const state = this.engine.state;
    const progress = this.engine.getVictoryProgress();
    const colonizedRegions = this.engine.getColonizedRegions();

    document.getElementById('overview-content').innerHTML = `
      <div class="overview-section">
        <h3>INFECTION PROGRESS</h3>
        <div class="region-stat"><span class="stat-label">Regions Colonized</span><span class="stat-value">${progress.regionsColonized} / ${progress.regionsTotal}</span></div>
        <div class="region-bar"><div class="region-bar-fill" style="width:${progress.percentColonized}%;background:${state.faction.color}"></div></div>
        <div class="region-stat"><span class="stat-label">Host Health</span><span class="stat-value">${Math.floor(progress.hostHealth)}%</span></div>
        <div class="region-bar"><div class="region-bar-fill" style="width:${progress.hostHealth}%;background:var(--accent-green)"></div></div>
        <div class="region-stat"><span class="stat-label">Victory at 60% colonization</span></div>
      </div>

      <div class="overview-section">
        <h3>COLONIZED REGIONS</h3>
        <div class="overview-grid">
          ${colonizedRegions.map(r => {
            const region = REGIONS.find(reg => reg.id === r.id);
            return `<div class="overview-region">
              <div class="or-name">${region ? region.name : r.id}</div>
              <div style="font-size:7px;color:var(--text-dim);">Col: ${Math.floor(r.colonization)}% | Immune: ${Math.floor(r.immunePresence)}%</div>
              <div class="or-bar"><div class="or-fill" style="width:${r.colonization}%;background:${state.faction.color}"></div></div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="overview-section">
        <h3>IMMUNE STATUS</h3>
        <div class="region-stat"><span class="stat-label">Alert Level</span><span class="stat-value">${Math.floor(state.immune.alertLevel)}</span></div>
        <div class="region-stat"><span class="stat-label">Adaptive Response</span><span class="stat-value">${state.immune.adaptiveActive ? 'ACTIVE' : 'Inactive'}</span></div>
        <div class="region-stat"><span class="stat-label">Treatment Phase</span><span class="stat-value">${state.immune.treatmentPhase > 0 ? 'Phase ' + state.immune.treatmentPhase : 'None'}</span></div>
      </div>
    `;
  }

  showEvent(eventData) {
    const popup = document.getElementById('event-popup');
    document.getElementById('event-title').textContent = eventData.name;
    document.getElementById('event-description').textContent = eventData.description;

    const effectsDiv = document.getElementById('event-effects');
    effectsDiv.innerHTML = eventData.effectSummary || '';

    const choicesDiv = document.getElementById('event-choices');
    if (eventData.choices) {
      this.currentEvent = eventData;
      choicesDiv.innerHTML = eventData.choices.map((choice, i) => `
        <button class="pixel-btn small" onclick="window.game.eventChoice(${i})">${choice.text}</button>
      `).join('');
      document.getElementById('btn-event-ok').classList.add('hidden');
    } else {
      choicesDiv.innerHTML = '';
      document.getElementById('btn-event-ok').classList.remove('hidden');
    }

    popup.classList.remove('hidden');
  }

  showEventQueue(events) {
    // Show events one at a time
    if (events.length === 0) return;
    this.eventQueue = events.slice(1);
    this.showEvent(events[0]);

    // Override the OK button to show next event
    const okBtn = document.getElementById('btn-event-ok');
    okBtn.onclick = () => {
      document.getElementById('event-popup').classList.add('hidden');
      if (this.eventQueue && this.eventQueue.length > 0) {
        const next = this.eventQueue.shift();
        setTimeout(() => this.showEvent(next), 300);
      }
    };
  }

  eventChoice(index) {
    // Handle event choice
    if (this.engine.state && this.currentEvent) {
      this.engine.applyEventChoice(this.currentEvent, index);
    }
    document.getElementById('event-popup').classList.add('hidden');
    this.updateUI();
  }

  addLogEntry(data) {
    const logContent = document.getElementById('log-content');
    const entry = document.createElement('div');
    entry.className = `log-entry ${data.type}`;
    entry.innerHTML = `<span class="log-turn">[T${data.turn}]</span>${data.message}`;
    logContent.prepend(entry);

    // Keep only last 50 entries
    while (logContent.children.length > 50) {
      logContent.removeChild(logContent.lastChild);
    }
  }

  addNotification(text, type = 'info') {
    const container = document.getElementById('notifications');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = text;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
  }

  onResearchComplete(data) {
    this.addNotification(`Research complete: ${data.name}`, 'good');
    if (!document.getElementById('research-panel').classList.contains('hidden')) {
      this.renderResearchPanel();
    }
  }

  showVictoryScreen() {
    const state = this.engine.state;
    const progress = this.engine.getVictoryProgress();
    document.getElementById('victory-stats').innerHTML = `
      <div>Faction: ${state.faction.name}</div>
      <div>Turns: ${state.turn}</div>
      <div>Regions Colonized: ${progress.regionsColonized}</div>
      <div>Difficulty: ${state.difficulty}</div>
    `;
    this.showScreen('victory');
  }

  showDefeatScreen() {
    const state = this.engine.state;
    const reason = state.victoryType === 'host_death' ? 'HOST LOST' : 'PATHOGEN CLEARED';
    document.getElementById('defeat-reason').textContent = reason;
    document.getElementById('defeat-stats').innerHTML = `
      <div>Faction: ${state.faction.name}</div>
      <div>Survived: ${state.turn} turns</div>
      <div>Difficulty: ${state.difficulty}</div>
    `;
    this.showScreen('defeat');
  }

  showScreen(screenId) {
    const screenMap = {
      'title': 'title-screen',
      'faction': 'faction-screen',
      'game': 'game-screen',
      'victory': 'victory-screen',
      'defeat': 'defeat-screen'
    };
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(screenMap[screenId]);
    if (el) el.classList.add('active');
  }

  showOptionsFromTitle() {
    document.getElementById('options-panel').classList.remove('hidden');
  }

  // Save/Load
  saveGame() {
    if (!this.engine.state) return;
    localStorage.setItem('pathogen_dominion_save', JSON.stringify(this.engine.state));
    this.addNotification('Game saved!', 'good');
  }

  loadGame() {
    const saved = localStorage.getItem('pathogen_dominion_save');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        this.engine.loadGame(state);
        this.showScreen('game');
        this.renderer.showGameScreen();
        this.renderer.startRenderLoop();
        this.updateUI();
        this.addNotification('Game loaded!', 'good');
      } catch (e) {
        this.addNotification('Failed to load save!', 'bad');
      }
    } else {
      this.addNotification('No saved game found', 'bad');
    }
  }

  exportSave() {
    if (!this.engine.state) return;
    const data = JSON.stringify(this.engine.state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pathogen_dominion_save_t${this.engine.state.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importSave(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        this.engine.loadGame(state);
        this.showScreen('game');
        this.renderer.showGameScreen();
        this.renderer.startRenderLoop();
        this.updateUI();
        this.addNotification('Save imported!', 'good');
      } catch (err) {
        this.addNotification('Invalid save file!', 'bad');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  checkForSavedGame() {
    const saved = localStorage.getItem('pathogen_dominion_save');
    if (saved) {
      document.getElementById('btn-load-game').disabled = false;
    } else {
      document.getElementById('btn-load-game').disabled = true;
    }
  }
}

// Initialize
const game = new PathogenDominion();
window.game = game; // expose for inline event handlers
game.init();
