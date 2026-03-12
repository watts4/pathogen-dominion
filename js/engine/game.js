/**
 * @module game
 * @description Core game engine for Pathogen Dominion — a Civ II-inspired strategy game
 * about pathogen conquest inside a human body. Manages all game state, turn processing,
 * immune system AI, resource economy, and win/loss conditions.
 *
 * Architecture: The engine is UI-agnostic. It exposes state through getState() and
 * accepts commands through action methods. UI updates are driven via the event emitter.
 */

import { REGIONS, ADJACENCY, REGION_MAP } from '../data/regions.js';
import { FACTIONS } from '../data/factions.js';
import { RESEARCH, RESEARCH_MAP } from '../data/research.js';
import { EVENTS, resolveEventTarget, checkEventConditions } from './events.js';

// =============================================================================
// DIFFICULTY PRESETS
// =============================================================================

/**
 * Difficulty scaling parameters.
 * @type {Object<string, {immuneMod: number, adaptiveThreshold: number, treatmentThreshold: number, startingResources: number, eventFreq: number}>}
 */
export const DIFFICULTY = {
  easy: {
    immuneMod: 0.7,
    adaptiveThreshold: 60,
    treatmentThreshold: 90,
    startingResources: 1.5,
    eventFreq: 0.7,
  },
  normal: {
    immuneMod: 1.0,
    adaptiveThreshold: 50,
    treatmentThreshold: 80,
    startingResources: 1.0,
    eventFreq: 1.0,
  },
  hard: {
    immuneMod: 1.3,
    adaptiveThreshold: 40,
    treatmentThreshold: 70,
    startingResources: 0.8,
    eventFreq: 1.3,
  },
  nightmare: {
    immuneMod: 1.6,
    adaptiveThreshold: 30,
    treatmentThreshold: 60,
    startingResources: 0.6,
    eventFreq: 1.5,
  },
};

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum colonization in any region */
const MAX_COLONIZATION = 100;
/** Maximum biomass */
const MAX_BIOMASS = 200;
/** Maximum alert level */
const MAX_ALERT = 100;
/** Maximum stealth */
const MAX_STEALTH = 100;
/** Percentage of regions required for domination victory */
const VICTORY_THRESHOLD = 0.6;
/** Turn limit before stalemate */
const MAX_TURNS = 200;
/** Total damage across all regions that kills the host (also a loss) */
const HOST_DEATH_THRESHOLD = 500;
/** Colonization threshold to count a region as "colonized" for victory */
const COLONIZED_THRESHOLD = 25;
/** Colonization required to establish a reservoir */
const RESERVOIR_THRESHOLD = 70;

// =============================================================================
// UTILITY
// =============================================================================

/** Clamp a number between min and max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Deep clone via structured clone (or JSON fallback) */
function deepCopy(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

/** Roll a random float 0-1 */
function roll() {
  return Math.random();
}

/** Pick a random element from an array */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// =============================================================================
// GAME ENGINE
// =============================================================================

/**
 * Main game engine class. Manages all state and turn processing.
 *
 * Usage:
 * ```js
 * const engine = new GameEngine();
 * engine.on('turnEnd', (data) => updateUI(data));
 * engine.on('log', (entry) => appendLog(entry));
 * engine.newGame('bacteria', 'normal');
 * engine.spreadTo('respiratory_tract');
 * engine.endTurn();
 * ```
 */
export class GameEngine {
  constructor() {
    /** @type {Object|null} Full game state object */
    this.state = null;
    /** @type {Array<{event: string, callback: Function}>} Registered event listeners */
    this.listeners = [];
    /** @type {Object<string, number>} Tracks event occurrence counts */
    this.eventOccurrences = {};
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Start a new game with the given faction and difficulty.
   *
   * @param {string} factionId - ID matching a key in FACTIONS
   * @param {'easy'|'normal'|'hard'|'nightmare'} difficulty - Difficulty preset
   * @returns {Object} The initial game state
   */
  newGame(factionId, difficulty = 'normal') {
    const faction = FACTIONS.find(f => f.id === factionId);
    if (!faction) throw new Error(`Unknown faction: ${factionId}`);
    const diff = DIFFICULTY[difficulty];
    if (!diff) throw new Error(`Unknown difficulty: ${difficulty}`);

    // Build region states
    const regions = {};
    for (const region of REGIONS) {
      regions[region.id] = {
        colonization: 0,
        immunePresence: region.defaultImmunePresence || 30,
        inflammation: 0,
        damage: 0,
        discovered: false,
        visible: false,
        isReservoir: false,
        hasBiofilm: false,
        modifiers: [],
        turnsColonized: 0,
      };
    }

    // Colonize starting regions (faction.startRegions is an array)
    const startRegions = faction.startRegions || [];
    const startId = startRegions[0] || 'pharynx';
    for (const sid of startRegions) {
      if (regions[sid]) {
        regions[sid].colonization = 20;
        regions[sid].discovered = true;
        regions[sid].visible = true;
        regions[sid].turnsColonized = 1;
      }

      // Reveal adjacent regions
      const adjacent = ADJACENCY[sid] || [];
      for (const adj of adjacent) {
        if (adj.regionId && regions[adj.regionId]) {
          regions[adj.regionId].visible = true;
        } else if (typeof adj === 'string' && regions[adj]) {
          regions[adj].visible = true;
        }
      }
    }

    // Build starting resources, scaled by difficulty
    const resourceMod = diff.startingResources;
    this.state = {
      turn: 1,
      phase: 'player',
      faction: deepCopy(faction),
      difficulty,
      resources: {
        biomass: Math.round(10 * resourceMod),
        replicationCapacity: Math.round((faction.stats?.replicationRate || 5) * resourceMod),
        geneticDiversity: Math.round(3 * resourceMod),
        stealth: (faction.stats?.stealth || 5) * 10,
        energy: Math.round(10 * resourceMod),
      },
      regions,
      research: {
        completed: [],
        current: null,
        available: [],
      },
      immune: {
        alertLevel: 0,
        adaptiveActive: false,
        adaptiveTurn: null,
        antibodyTargets: [],
        treatmentPhase: 0,
        treatmentTurn: null,
        turnsAboveAdaptiveThreshold: 0,
        turnsAboveTreatmentThreshold: 0,
      },
      log: [],
      turnActions: [],
      activeEvents: [], // currently active duration-based events
      gameOver: false,
      victory: false,
      victoryType: null,
    };

    // Apply faction starter traits
    if (faction.starterTraits) {
      for (const traitId of faction.starterTraits) {
        this._applyResearchEffects(traitId);
        this.state.research.completed.push(traitId);
      }
    }

    // Compute initially available research
    this.state.research.available = this._computeAvailableResearch();

    // Reset event occurrences
    this.eventOccurrences = {};

    this.log(`${faction.name} has established a foothold in the ${(startId || '').replace(/_/g, ' ')}.`, 'system');
    this.emit('newGame', { factionId, difficulty });

    return this.getState();
  }

  /**
   * Restore a game from a saved state snapshot.
   * @param {Object} savedState - Previously exported game state
   */
  loadGame(savedState) {
    this.state = deepCopy(savedState);
    this.eventOccurrences = savedState._eventOccurrences || {};
    this.emit('loadGame', {});
  }

  /**
   * Get a deep copy of the current game state (safe for UI consumption).
   * @returns {Object} Deep copy of game state
   */
  getState() {
    if (!this.state) return null;
    const copy = deepCopy(this.state);
    copy._eventOccurrences = deepCopy(this.eventOccurrences);
    return copy;
  }

  // ===========================================================================
  // EVENT EMITTER
  // ===========================================================================

  /**
   * Register a listener for a game event.
   * @param {string} event - Event name (e.g. 'turnEnd', 'log', 'newGame', 'gameOver')
   * @param {Function} callback - Called with event data
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  /**
   * Remove all listeners for a given event, or all listeners if no event specified.
   * @param {string} [event] - Optional event name to clear
   */
  off(event) {
    if (event) {
      this.listeners = this.listeners.filter((l) => l.event !== event);
    } else {
      this.listeners = [];
    }
  }

  /**
   * Emit an event to all registered listeners.
   * @param {string} event - Event name
   * @param {*} data - Data payload
   */
  emit(event, data) {
    for (const listener of this.listeners) {
      if (listener.event === event) {
        try {
          listener.callback(data);
        } catch (err) {
          console.error(`Event listener error (${event}):`, err);
        }
      }
    }
  }

  // ===========================================================================
  // PLAYER ACTIONS
  // ===========================================================================

  /**
   * Attempt to spread pathogen to an adjacent region.
   *
   * Requirements:
   * - Must be adjacent to a region with colonization > 10
   * - Must have replication capacity to spend
   * - Connection type must be compatible with pathogen spread routes
   *
   * @param {string} targetRegionId - ID of the target region
   * @returns {{success: boolean, message: string}}
   */
  spreadTo(targetRegionId) {
    if (this.state.gameOver) return { success: false, message: 'Game is over.' };
    if (this.state.phase !== 'player') return { success: false, message: 'Not your turn phase.' };

    const targetRegion = this.state.regions[targetRegionId];
    if (!targetRegion) return { success: false, message: 'Unknown region.' };

    // Check adjacency: find a colonized source region adjacent to the target
    const sourceRegion = this._findSpreadSource(targetRegionId);
    if (!sourceRegion) {
      return { success: false, message: 'No colonized region adjacent to target.' };
    }

    // Cost: 1 replication capacity + 2 energy
    const cost = { replicationCapacity: 1, energy: 2 };
    if (!this.canAfford(cost)) {
      return { success: false, message: 'Insufficient replication capacity or energy.' };
    }

    // Check if target is already heavily colonized
    if (targetRegion.colonization >= 80) {
      return { success: false, message: 'Target region is already heavily colonized.' };
    }

    // Calculate spread success
    const regionData = REGION_MAP ? REGION_MAP.get(targetRegionId) : null;
    const barrierStrength = regionData?.barrierStrength || 30;
    const factionSpreadBonus = this.state.faction.spreadBonus || 0;
    const researchBonus = this._getResearchBonus('spreadPower');
    const stealthBonus = this.state.resources.stealth > 60 ? 10 : 0;

    // Base success chance: 70% modified by barrier, bonuses, and stealth
    const successChance = clamp(
      0.70 - (barrierStrength / 200) + (factionSpreadBonus / 100) + (researchBonus / 100) + (stealthBonus / 100),
      0.15,
      0.95
    );

    this.spendResources(cost);

    const succeeded = roll() < successChance;

    if (succeeded) {
      // Initial colonization depends on source strength and faction bonuses
      const sourceStrength = this.state.regions[sourceRegion].colonization;
      const baseColonization = clamp(Math.round(10 + sourceStrength * 0.1 + factionSpreadBonus), 5, 25);
      targetRegion.colonization = clamp(targetRegion.colonization + baseColonization, 0, MAX_COLONIZATION);
      targetRegion.discovered = true;
      targetRegion.visible = true;

      // Reveal newly adjacent regions
      const newAdjacent = ADJACENCY[targetRegionId] || [];
      for (const adj of newAdjacent) {
        const adjId = typeof adj === 'string' ? adj : adj.regionId;
        if (adjId && this.state.regions[adjId]) {
          this.state.regions[adjId].visible = true;
        }
      }

      // Increase immune alert
      const alertIncrease = clamp(3 + Math.round(baseColonization * 0.1), 2, 8);
      this.state.immune.alertLevel = clamp(this.state.immune.alertLevel + alertIncrease, 0, MAX_ALERT);

      // Slight stealth decrease from spreading
      this.state.resources.stealth = clamp(this.state.resources.stealth - 2, 0, MAX_STEALTH);

      this.state.turnActions.push({ action: 'spread', target: targetRegionId, success: true });
      const msg = `Spread to ${targetRegionId.replace(/_/g, ' ')} — colonization at ${targetRegion.colonization}%.`;
      this.log(msg, 'action');
      this.emit('spread', { regionId: targetRegionId, colonization: targetRegion.colonization });
      return { success: true, message: msg };
    } else {
      // Failed spread still raises some alert
      this.state.immune.alertLevel = clamp(this.state.immune.alertLevel + 2, 0, MAX_ALERT);
      this.state.turnActions.push({ action: 'spread', target: targetRegionId, success: false });
      const msg = `Failed to spread to ${targetRegionId.replace(/_/g, ' ')} — barrier held.`;
      this.log(msg, 'action');
      return { success: false, message: msg };
    }
  }

  /**
   * Reinforce colonization in an already-colonized region.
   *
   * @param {string} regionId - ID of the region to reinforce
   * @returns {{success: boolean, message: string}}
   */
  reinforceRegion(regionId) {
    if (this.state.gameOver) return { success: false, message: 'Game is over.' };
    if (this.state.phase !== 'player') return { success: false, message: 'Not your turn phase.' };

    const region = this.state.regions[regionId];
    if (!region) return { success: false, message: 'Unknown region.' };
    if (region.colonization <= 0) return { success: false, message: 'Region is not colonized.' };
    if (region.colonization >= MAX_COLONIZATION) return { success: false, message: 'Region is at maximum colonization.' };

    const cost = { replicationCapacity: 1, energy: 1 };
    if (!this.canAfford(cost)) {
      return { success: false, message: 'Insufficient replication capacity or energy.' };
    }

    this.spendResources(cost);

    // Reinforcement amount: higher current colonization = diminishing returns
    const diminishing = 1 - (region.colonization / MAX_COLONIZATION) * 0.5;
    const baseReinforce = 8 + (this.state.faction.replicationBonus || 0);
    const researchBonus = this._getResearchBonus('replicationPower');
    const reinforceAmount = Math.round((baseReinforce + researchBonus) * diminishing);

    region.colonization = clamp(region.colonization + reinforceAmount, 0, MAX_COLONIZATION);

    // Immune detection risk scales with colonization level
    const alertRisk = region.colonization > 50 ? 3 : 1;
    this.state.immune.alertLevel = clamp(this.state.immune.alertLevel + alertRisk, 0, MAX_ALERT);

    this.state.turnActions.push({ action: 'reinforce', target: regionId });
    const msg = `Reinforced ${regionId.replace(/_/g, ' ')} — colonization now ${region.colonization}%.`;
    this.log(msg, 'action');
    this.emit('reinforce', { regionId, colonization: region.colonization });
    return { success: true, message: msg };
  }

  /**
   * Establish a reservoir in a heavily colonized region.
   * Reservoirs provide steady resource income and are harder for the immune system to clear.
   *
   * @param {string} regionId - ID of the region
   * @returns {{success: boolean, message: string}}
   */
  establishReservoir(regionId) {
    if (this.state.gameOver) return { success: false, message: 'Game is over.' };
    if (this.state.phase !== 'player') return { success: false, message: 'Not your turn phase.' };

    const region = this.state.regions[regionId];
    if (!region) return { success: false, message: 'Unknown region.' };
    if (region.colonization < RESERVOIR_THRESHOLD) {
      return { success: false, message: `Colonization must be at least ${RESERVOIR_THRESHOLD}% to establish a reservoir.` };
    }
    if (region.isReservoir) return { success: false, message: 'Region is already a reservoir.' };

    const cost = { energy: 5, biomass: 8 };
    if (!this.canAfford(cost)) {
      return { success: false, message: 'Insufficient energy or biomass.' };
    }

    this.spendResources(cost);
    region.isReservoir = true;

    // Reservoirs are a big commitment — immune system will notice
    this.state.immune.alertLevel = clamp(this.state.immune.alertLevel + 5, 0, MAX_ALERT);

    this.state.turnActions.push({ action: 'reservoir', target: regionId });
    const msg = `Established reservoir in ${regionId.replace(/_/g, ' ')} — persistent colony secured.`;
    this.log(msg, 'action');
    this.emit('reservoir', { regionId });
    return { success: true, message: msg };
  }

  /**
   * Build a biofilm defense in a colonized region.
   * Requires specific factions or research to unlock.
   *
   * @param {string} regionId - ID of the region
   * @returns {{success: boolean, message: string}}
   */
  buildBiofilm(regionId) {
    if (this.state.gameOver) return { success: false, message: 'Game is over.' };
    if (this.state.phase !== 'player') return { success: false, message: 'Not your turn phase.' };

    // Check if faction or research allows biofilm
    const canBiofilm =
      this.state.faction.canBiofilm ||
      this.state.research.completed.includes('biofilm_formation') ||
      this.state.research.completed.includes('advanced_biofilm');
    if (!canBiofilm) {
      return { success: false, message: 'Biofilm construction not yet unlocked.' };
    }

    const region = this.state.regions[regionId];
    if (!region) return { success: false, message: 'Unknown region.' };
    if (region.colonization < 20) return { success: false, message: 'Insufficient colonization to support a biofilm.' };
    if (region.hasBiofilm) return { success: false, message: 'Region already has a biofilm.' };

    const cost = { energy: 4, biomass: 5 };
    if (!this.canAfford(cost)) {
      return { success: false, message: 'Insufficient energy or biomass.' };
    }

    this.spendResources(cost);
    region.hasBiofilm = true;

    this.state.turnActions.push({ action: 'biofilm', target: regionId });
    const msg = `Biofilm constructed in ${regionId.replace(/_/g, ' ')} — defense matrix established.`;
    this.log(msg, 'action');
    this.emit('biofilm', { regionId });
    return { success: true, message: msg };
  }

  /**
   * Begin researching an adaptation/mutation.
   *
   * @param {string} researchId - ID from RESEARCH data
   * @returns {{success: boolean, message: string}}
   */
  startResearch(researchId) {
    if (this.state.gameOver) return { success: false, message: 'Game is over.' };
    if (this.state.phase !== 'player') return { success: false, message: 'Not your turn phase.' };
    if (this.state.research.current) {
      return { success: false, message: `Already researching: ${this.state.research.current.id}. Complete or cancel it first.` };
    }

    const research = RESEARCH_MAP ? RESEARCH_MAP.get(researchId) : null;
    if (!research) return { success: false, message: 'Unknown research.' };

    // Check prerequisites
    if (research.prerequisites) {
      for (const prereq of research.prerequisites) {
        if (!this.state.research.completed.includes(prereq)) {
          return { success: false, message: `Missing prerequisite: ${prereq}` };
        }
      }
    }

    // Check faction exclusivity
    if (research.factionExclusive && research.factionExclusive !== this.state.faction.id) {
      return { success: false, message: 'This adaptation is exclusive to another pathogen type.' };
    }

    // Check cost
    const gdCost = research.cost?.diversity ?? research.cost ?? 3;
    const turnsCost = research.cost?.turns ?? research.turns ?? 3;
    if (this.state.resources.geneticDiversity < gdCost) {
      return { success: false, message: `Need ${gdCost} genetic diversity (have ${this.state.resources.geneticDiversity}).` };
    }

    // Already completed?
    if (this.state.research.completed.includes(researchId)) {
      return { success: false, message: 'Already researched.' };
    }

    this.state.resources.geneticDiversity -= gdCost;
    this.state.research.current = {
      id: researchId,
      turnsRemaining: turnsCost,
    };

    this.state.turnActions.push({ action: 'research', target: researchId });
    const msg = `Began researching: ${research.name} (${this.state.research.current.turnsRemaining} turns).`;
    this.log(msg, 'research');
    this.emit('researchStarted', { researchId, turnsRemaining: this.state.research.current.turnsRemaining });
    return { success: true, message: msg, name: research.name };
  }

  /**
   * Activate a faction-specific special ability.
   *
   * @param {string} abilityId - The ability to activate
   * @returns {{success: boolean, message: string}}
   */
  activateAbility(abilityId) {
    if (this.state.gameOver) return { success: false, message: 'Game is over.' };
    if (this.state.phase !== 'player') return { success: false, message: 'Not your turn phase.' };

    const ability = (this.state.faction.abilities || []).find((a) => a.id === abilityId);
    if (!ability) return { success: false, message: 'Unknown or unavailable ability.' };

    // Check cooldown
    if (ability._lastUsed && this.state.turn - ability._lastUsed < (ability.cooldown || 5)) {
      const remaining = (ability.cooldown || 5) - (this.state.turn - ability._lastUsed);
      return { success: false, message: `Ability on cooldown (${remaining} turns remaining).` };
    }

    const cost = ability.cost || { energy: 5 };
    if (!this.canAfford(cost)) {
      return { success: false, message: 'Insufficient resources for ability.' };
    }

    this.spendResources(cost);
    ability._lastUsed = this.state.turn;

    // Apply ability effects
    this._applyAbilityEffects(ability);

    this.state.turnActions.push({ action: 'ability', target: abilityId });
    const msg = `Activated ability: ${ability.name}.`;
    this.log(msg, 'ability');
    this.emit('abilityActivated', { abilityId });
    return { success: true, message: msg };
  }

  // ===========================================================================
  // END TURN — the heart of the game loop
  // ===========================================================================

  /**
   * End the player's turn and process all game phases.
   * This is the core game loop tick: upkeep -> research -> immune -> regions -> events -> passives -> win/lose.
   *
   * @returns {Object} Turn summary with all changes
   */
  endTurn() {
    if (this.state.gameOver) return { error: 'Game is over.' };

    const summary = {
      turn: this.state.turn,
      resourcesBefore: { ...this.state.resources },
      events: [],
      immuneActions: [],
      regionChanges: {},
      researchCompleted: null,
      gameOver: false,
      victory: false,
    };

    // ---- Phase 1: UPKEEP — resource income ----
    this.state.phase = 'upkeep';
    this._processUpkeep(summary);

    // ---- Phase 2: RESEARCH — tick research progress ----
    this._processResearch(summary);

    // ---- Phase 3: IMMUNE RESPONSE ----
    this.state.phase = 'immune';
    this._processImmuneResponse(summary);

    // ---- Phase 4: REGION UPDATES — environmental hazards ----
    this._processRegionUpdates(summary);

    // ---- Phase 5: EVENTS — random events ----
    this.state.phase = 'event';
    this._processEvents(summary);

    // ---- Phase 6: PASSIVE ABILITIES — faction-specific ----
    this._processPassiveAbilities(summary);

    // ---- Phase 7: CLEANUP — expire timed effects ----
    this._processCleanup();

    // ---- Phase 8: WIN/LOSE CHECK ----
    this._checkVictoryConditions(summary);

    // ---- Phase 9: Advance turn ----
    this.state.turn += 1;
    this.state.phase = 'player';
    this.state.turnActions = [];
    summary.resourcesAfter = { ...this.state.resources };

    this.emit('turnEnd', summary);
    return summary;
  }

  // ===========================================================================
  // TURN PHASE PROCESSORS
  // ===========================================================================

  /**
   * Phase 1: Calculate and apply resource income.
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _processUpkeep(summary) {
    const { resources, regions, faction } = this.state;

    // Biomass income: proportional to colonization across all regions
    let biomassIncome = 0;
    for (const [id, region] of Object.entries(regions)) {
      if (region.colonization > 0) {
        let yield_ = region.colonization * 0.08;
        if (region.isReservoir) yield_ *= 1.5;
        // Some regions are nutrient-rich
        const regionData = REGION_MAP ? REGION_MAP.get(id) : null;
        if (regionData?.nutrientRichness) yield_ *= regionData.nutrientRichness;
        biomassIncome += yield_;
      }
    }
    resources.biomass = clamp(Math.round(resources.biomass + biomassIncome), 0, MAX_BIOMASS);

    // Replication capacity resets each turn (base + faction bonus + research)
    const baseReplication = faction.baseReplication || 5;
    const replicationResearch = this._getResearchBonus('replicationCapacity');
    resources.replicationCapacity = baseReplication + replicationResearch;

    // Genetic diversity slowly generates
    const baseGD = 1;
    const gdBonus = this._getResearchBonus('geneticDiversity');
    const reservoirBonus = Object.values(regions).filter((r) => r.isReservoir).length > 0 ? 1 : 0;
    resources.geneticDiversity += baseGD + gdBonus + reservoirBonus;

    // Energy regenerates
    const baseEnergy = 5;
    const energyBonus = this._getResearchBonus('energyRegen');
    const factionEnergyBonus = faction.energyBonus || 0;
    resources.energy = clamp(
      resources.energy + baseEnergy + energyBonus + factionEnergyBonus,
      0,
      30 + energyBonus * 5
    );

    // Stealth drifts toward equilibrium based on total colonization vs immune alert
    const totalCol = this.getTotalColonization();
    const stealthPressure = totalCol * 0.15 + this.state.immune.alertLevel * 0.2;
    const stealthRegen = (faction.stealthRegen || 2) + this._getResearchBonus('stealth');
    const stealthDelta = stealthRegen - Math.round(stealthPressure * 0.1);
    resources.stealth = clamp(resources.stealth + stealthDelta, 0, MAX_STEALTH);

    summary.biomassIncome = Math.round(biomassIncome);
  }

  /**
   * Phase 2: Tick research progress and apply completed research.
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _processResearch(summary) {
    const { research } = this.state;
    if (!research.current) return;

    research.current.turnsRemaining -= 1;

    if (research.current.turnsRemaining <= 0) {
      const completedId = research.current.id;
      research.completed.push(completedId);
      this._applyResearchEffects(completedId);

      const researchData = RESEARCH_MAP ? RESEARCH_MAP.get(completedId) : null;
      const name = researchData?.name || completedId;
      this.log(`Research complete: ${name}!`, 'research');
      this.emit('researchCompleted', { researchId: completedId });
      summary.researchCompleted = completedId;

      research.current = null;
      research.available = this._computeAvailableResearch();
    }
  }

  /**
   * Phase 3: Process the immune system response.
   * The immune system is the primary antagonist — it must be smart enough to
   * challenge the player but have exploitable patterns.
   *
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _processImmuneResponse(summary) {
    const { immune, regions, resources } = this.state;
    const diff = DIFFICULTY[this.state.difficulty];

    // --- Update alert level ---
    let alertDelta = 0;

    // Alert rises from colonization activity
    const colonizedRegions = this.getColonizedRegions();
    const totalCol = this.getTotalColonization();
    alertDelta += colonizedRegions.length * 0.5; // more regions = more detected
    alertDelta += totalCol * 0.02;               // raw mass

    // Alert rises from high-colonization regions
    for (const [, region] of Object.entries(regions)) {
      if (region.colonization > 60) alertDelta += 1;
      if (region.colonization > 80) alertDelta += 2;
    }

    // Alert decays if pathogen is stealthy
    if (resources.stealth > 60) alertDelta -= 2;
    if (resources.stealth > 80) alertDelta -= 3;

    // New colonization this turn raises alert
    alertDelta += this.state.turnActions.filter((a) => a.action === 'spread' && a.success).length * 2;

    immune.alertLevel = clamp(immune.alertLevel + Math.round(alertDelta), 0, MAX_ALERT);

    // --- Track turns above adaptive/treatment thresholds ---
    if (immune.alertLevel >= diff.adaptiveThreshold) {
      immune.turnsAboveAdaptiveThreshold += 1;
    } else {
      immune.turnsAboveAdaptiveThreshold = Math.max(0, immune.turnsAboveAdaptiveThreshold - 1);
    }

    if (immune.alertLevel >= diff.treatmentThreshold) {
      immune.turnsAboveTreatmentThreshold += 1;
    } else {
      immune.turnsAboveTreatmentThreshold = Math.max(0, immune.turnsAboveTreatmentThreshold - 1);
    }

    // --- Activate adaptive immune system ---
    if (!immune.adaptiveActive && immune.turnsAboveAdaptiveThreshold >= 3) {
      immune.adaptiveActive = true;
      immune.adaptiveTurn = this.state.turn;
      this.log('The adaptive immune system has activated — T cells and antibodies are now targeting you.', 'immune');
      this.emit('adaptiveActivated', { turn: this.state.turn });
    }

    // --- Activate treatment ---
    if (immune.treatmentPhase === 0 && immune.turnsAboveTreatmentThreshold >= 5) {
      immune.treatmentPhase = 1;
      immune.treatmentTurn = this.state.turn;
      this.log('Medical treatment has begun — broad-spectrum assault incoming.', 'immune');
      this.emit('treatmentStarted', { phase: 1 });
    } else if (immune.treatmentPhase === 1 && this.state.turn - immune.treatmentTurn >= 3) {
      immune.treatmentPhase = 2;
      this.log('Treatment escalated to Phase 2 — targeted therapy.', 'immune');
    } else if (immune.treatmentPhase === 2 && this.state.turn - immune.treatmentTurn >= 6) {
      immune.treatmentPhase = 3;
      this.log('Treatment escalated to Phase 3 — aggressive intervention (host tissue at risk).', 'immune');
    }

    // --- Apply immune attacks to colonized regions ---
    for (const [regionId, region] of Object.entries(regions)) {
      if (region.colonization <= 0) continue;

      // Base immune attack from innate response
      let immuneAttack = region.immunePresence * (immune.alertLevel / 100) * diff.immuneMod;

      // Innate: neutrophils proportional to inflammation
      if (region.inflammation > 20) {
        immuneAttack += region.inflammation * 0.15 * diff.immuneMod;
      }

      // Adaptive amplification
      if (immune.adaptiveActive) {
        immuneAttack *= 1.5;

        // Antibody targeting: if immune has adapted to a pathogen trait, extra damage
        if (immune.antibodyTargets.length > 0) {
          immuneAttack += immune.antibodyTargets.length * 3;
        }
      }

      // Treatment damage
      if (immune.treatmentPhase >= 1) {
        const treatmentDamage = [0, 10, 20, 30][immune.treatmentPhase] || 0;
        immuneAttack += treatmentDamage;
      }

      // Phase 3 treatment also damages host
      if (immune.treatmentPhase >= 3) {
        region.damage = clamp(region.damage + 5, 0, 100);
      }

      // --- Pathogen defense ---
      let defense = region.colonization * 0.3;
      if (region.hasBiofilm) defense += 20;
      if (region.isReservoir) defense += 10;
      defense += this._getResearchBonus('immuneEvasion');

      // Stealth chance to be skipped entirely
      if (resources.stealth > 70 && roll() < 0.3) {
        summary.immuneActions.push({ regionId, action: 'evaded', detail: 'Stealth evasion' });
        continue;
      }

      // Net damage to colonization
      const netDamage = Math.max(0, immuneAttack - defense);
      let colonizationLoss = netDamage * 0.5;

      // Reservoirs halve the loss
      if (region.isReservoir) colonizationLoss *= 0.5;

      if (colonizationLoss > 0) {
        const before = region.colonization;
        region.colonization = clamp(Math.round(region.colonization - colonizationLoss), 0, MAX_COLONIZATION);

        // Immune attacks cause inflammation
        region.inflammation = clamp(region.inflammation + Math.round(colonizationLoss * 0.3), 0, 100);

        // Immune presence regenerates where there's fighting
        region.immunePresence = clamp(region.immunePresence + Math.round(netDamage * 0.1), 0, 100);

        if (before > 0 && region.colonization <= 0) {
          this.log(`Colony in ${regionId.replace(/_/g, ' ')} has been cleared by immune response.`, 'immune');
          region.isReservoir = false;
          region.hasBiofilm = false;
        }

        summary.immuneActions.push({
          regionId,
          action: 'attacked',
          immuneAttack: Math.round(immuneAttack),
          defense: Math.round(defense),
          colonizationLoss: Math.round(before - region.colonization),
        });
      }
    }

    // --- Adaptive learning: each turn, immune may learn about a pathogen trait ---
    if (immune.adaptiveActive && roll() < 0.15) {
      const knownTraits = this.state.research.completed.filter(
        (id) => !immune.antibodyTargets.includes(id)
      );
      if (knownTraits.length > 0) {
        const targeted = pickRandom(knownTraits);
        immune.antibodyTargets.push(targeted);
        this.log(`Immune system has developed antibodies targeting: ${targeted.replace(/_/g, ' ')}.`, 'immune');
      }
    }
  }

  /**
   * Phase 4: Environmental region updates — hazards, clearance, and damage.
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _processRegionUpdates(summary) {
    const { regions } = this.state;

    for (const [regionId, region] of Object.entries(regions)) {
      const regionData = REGION_MAP ? REGION_MAP.get(regionId) : null;

      // Track colonization duration
      if (region.colonization > 0) {
        region.turnsColonized += 1;
      } else {
        region.turnsColonized = 0;
      }

      // --- Environmental hazards ---

      // Mucus clearance in respiratory regions
      if (regionData?.hasMucusClearance && region.colonization > 0 && !region.hasBiofilm) {
        const clearance = Math.round(3 + region.inflammation * 0.1);
        region.colonization = clamp(region.colonization - clearance, 0, MAX_COLONIZATION);
      }

      // Acid damage in stomach
      if (regionData?.hasAcid && region.colonization > 0) {
        const acidResist = this._getResearchBonus('acidResistance');
        const acidDamage = Math.max(0, 5 - acidResist);
        region.colonization = clamp(region.colonization - acidDamage, 0, MAX_COLONIZATION);
      }

      // Fluid flow washout in bloodstream and urinary
      if (regionData?.hasFluidFlow && region.colonization > 0 && region.colonization < 30 && !region.isReservoir) {
        const washout = Math.round(4 + roll() * 3);
        region.colonization = clamp(region.colonization - washout, 0, MAX_COLONIZATION);
      }

      // --- Inflammation spread ---
      if (region.inflammation > 30) {
        const adjacentIds = (ADJACENCY[regionId] || []).map((a) => (typeof a === 'string' ? a : a.regionId));
        for (const adjId of adjacentIds) {
          if (regions[adjId]) {
            const spread = Math.round(region.inflammation * 0.05);
            regions[adjId].inflammation = clamp(regions[adjId].inflammation + spread, 0, 100);
          }
        }
      }

      // --- Damage from combined colonization + inflammation ---
      if (region.colonization > 40 && region.inflammation > 30) {
        const damageRate = Math.round((region.colonization * 0.02 + region.inflammation * 0.03));
        region.damage = clamp(region.damage + damageRate, 0, 100);
      }

      // --- Inflammation decays slowly ---
      if (region.inflammation > 0 && region.colonization === 0) {
        region.inflammation = clamp(region.inflammation - 3, 0, 100);
      } else if (region.inflammation > 0) {
        region.inflammation = clamp(region.inflammation - 1, 0, 100);
      }

      // --- Immune presence regenerates toward baseline ---
      if (regionData) {
        const baseline = regionData.defaultImmunePresence || 30;
        if (region.immunePresence < baseline && region.colonization === 0) {
          region.immunePresence = clamp(region.immunePresence + 2, 0, baseline);
        }
      }

      summary.regionChanges[regionId] = {
        colonization: region.colonization,
        immunePresence: region.immunePresence,
        inflammation: region.inflammation,
        damage: region.damage,
      };
    }
  }

  /**
   * Phase 5: Process random events.
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _processEvents(summary) {
    const diff = DIFFICULTY[this.state.difficulty];

    for (const event of EVENTS) {
      const count = this.eventOccurrences[event.id] || 0;

      if (!checkEventConditions(event, this.state, count)) continue;

      // Roll for probability, modified by difficulty event frequency
      const adjustedProb = event.probability * diff.eventFreq;
      if (roll() > adjustedProb) continue;

      // Event triggers!
      this.eventOccurrences[event.id] = count + 1;
      this.log(`EVENT: ${event.name} — ${event.description}`, 'event');
      this.emit('event', { event });

      // If event has choices, we apply default effects and store choice for UI.
      // In a real UI integration, the game would pause here for player input.
      // For the engine, we apply the base effects and flag the choice.
      if (event.choices && (event.choices.options || event.choices)) {
        // Apply base effects
        this._applyEventEffects(event.effects);
        summary.events.push({
          id: event.id,
          name: event.name,
          description: event.description,
          hasChoice: true,
          choices: event.choices.options || event.choices,
        });
      } else {
        this._applyEventEffects(event.effects);
        summary.events.push({
          id: event.id,
          name: event.name,
          description: event.description,
          hasChoice: false,
        });
      }

      // Handle immune memory event specially
      if (event.id === 'immune_memory_formed') {
        const targetable = this.state.research.completed.filter(
          (id) => !this.state.immune.antibodyTargets.includes(id)
        );
        if (targetable.length > 0) {
          const targeted = pickRandom(targetable);
          this.state.immune.antibodyTargets.push(targeted);
          this.log(`Immune memory now targets: ${targeted.replace(/_/g, ' ')}.`, 'immune');
        }
      }
    }
  }

  /**
   * Process a player's choice for an event that offers options.
   *
   * @param {string} eventId - The event ID
   * @param {number} choiceIndex - Index of the chosen option
   * @returns {{success: boolean, message: string}}
   */
  resolveEventChoice(eventId, choiceIndex) {
    const event = EVENTS.find((e) => e.id === eventId);
    if (!event || !event.choices) return { success: false, message: 'No choice available for this event.' };

    const options = event.choices.options || event.choices;
    if (choiceIndex < 0 || choiceIndex >= options.length) {
      return { success: false, message: 'Invalid choice index.' };
    }

    const chosen = options[choiceIndex];
    this._applyEventEffects(chosen.effects);
    this.log(`Chose: ${chosen.text}`, 'event');
    return { success: true, message: `Applied choice: ${chosen.text}` };
  }

  /**
   * Phase 6: Apply faction-specific passive abilities each turn.
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _processPassiveAbilities(summary) {
    const { faction, regions, resources } = this.state;

    if (!faction.passives) return;

    for (const passive of faction.passives) {
      switch (passive.id) {
        case 'biofilm_growth': {
          // The Swarm: biofilms slowly reinforce colonized regions
          for (const [, region] of Object.entries(regions)) {
            if (region.hasBiofilm && region.colonization > 0) {
              region.colonization = clamp(region.colonization + 2, 0, MAX_COLONIZATION);
            }
          }
          break;
        }

        case 'intracellular_hiding': {
          // The Phantom: colonies in low-colonization regions are harder to detect
          for (const [, region] of Object.entries(regions)) {
            if (region.colonization > 0 && region.colonization < 30) {
              region.immunePresence = clamp(region.immunePresence - 1, 0, 100);
            }
          }
          resources.stealth = clamp(resources.stealth + 1, 0, MAX_STEALTH);
          break;
        }

        case 'antigenic_variation': {
          // The Shifting Tide: periodically sheds antibody targets
          if (this.state.immune.antibodyTargets.length > 0 && roll() < 0.2) {
            const shed = this.state.immune.antibodyTargets.pop();
            this.log(`Antigenic variation shed immune targeting of: ${shed.replace(/_/g, ' ')}.`, 'faction');
          }
          break;
        }

        case 'rapid_mutation': {
          // Fast mutator: bonus genetic diversity but occasional colony instability
          resources.geneticDiversity += 1;
          if (roll() < 0.15) {
            const colonized = this.getColonizedRegions();
            if (colonized.length > 0) {
              const target = pickRandom(colonized);
              regions[target].colonization = clamp(regions[target].colonization - 3, 0, MAX_COLONIZATION);
            }
          }
          break;
        }

        case 'toxin_production': {
          // Toxin producers: damage host tissue faster, which can help or hurt
          for (const [, region] of Object.entries(regions)) {
            if (region.colonization > 50) {
              region.damage = clamp(region.damage + 2, 0, 100);
              region.immunePresence = clamp(region.immunePresence - 1, 0, 100);
            }
          }
          break;
        }

        case 'spore_formation': {
          // Spore formers: colonies at very low health can enter dormancy
          for (const [, region] of Object.entries(regions)) {
            if (region.colonization > 0 && region.colonization < 10 && !region.isReservoir) {
              // Instead of dying, go dormant (keep at 5)
              region.colonization = Math.max(region.colonization, 5);
            }
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Phase 7: Clean up expired timed effects and modifiers.
   * @private
   */
  _processCleanup() {
    // Decrement and remove expired region modifiers
    for (const region of Object.values(this.state.regions)) {
      region.modifiers = region.modifiers
        .map((m) => ({ ...m, duration: m.duration - 1 }))
        .filter((m) => m.duration > 0 || m.duration === -1);
    }

    // Clean up active events
    this.state.activeEvents = this.state.activeEvents
      .map((e) => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
      .filter((e) => e.turnsRemaining > 0);
  }

  /**
   * Phase 8: Check victory and defeat conditions.
   * @param {Object} summary - Turn summary to annotate
   * @private
   */
  _checkVictoryConditions(summary) {
    const { regions, immune } = this.state;
    const regionList = Object.entries(regions);
    const totalRegions = regionList.length;

    // Count colonized regions (>= threshold)
    const colonizedCount = regionList.filter(([, r]) => r.colonization >= COLONIZED_THRESHOLD).length;
    const colonizedPercent = totalRegions > 0 ? colonizedCount / totalRegions : 0;

    // Total damage across all regions
    const totalDamage = regionList.reduce((sum, [, r]) => sum + r.damage, 0);

    // VICTORY: domination — colonize 60%+ of regions
    if (colonizedPercent >= VICTORY_THRESHOLD) {
      this.state.gameOver = true;
      this.state.victory = true;
      this.state.victoryType = 'domination';
      this.log('VICTORY — You have achieved systemic domination. The host body has fallen to your pathogen.', 'victory');
      summary.gameOver = true;
      summary.victory = true;
      this.emit('gameOver', { victory: true, type: 'domination' });
      return;
    }

    // DEFEAT: all colonies cleared
    const anyColonized = regionList.some(([, r]) => r.colonization > 0);
    if (!anyColonized && this.state.turn > 1) {
      this.state.gameOver = true;
      this.state.victory = false;
      this.state.victoryType = 'eradicated';
      this.log('DEFEAT — Your pathogen has been completely eradicated. The immune system wins.', 'defeat');
      summary.gameOver = true;
      summary.victory = false;
      this.emit('gameOver', { victory: false, type: 'eradicated' });
      return;
    }

    // DEFEAT: host death (pyrrhic — you killed the host)
    if (totalDamage >= HOST_DEATH_THRESHOLD) {
      this.state.gameOver = true;
      this.state.victory = false;
      this.state.victoryType = 'host_death';
      this.log('DEFEAT — The host has died from accumulated tissue damage. A pathogen needs a living host.', 'defeat');
      summary.gameOver = true;
      summary.victory = false;
      this.emit('gameOver', { victory: false, type: 'host_death' });
      return;
    }

    // STALEMATE: turn limit reached
    if (this.state.turn >= MAX_TURNS) {
      this.state.gameOver = true;
      this.state.victory = false;
      this.state.victoryType = 'stalemate';
      this.log('STALEMATE — The infection has become chronic but never achieved dominance. The host survives.', 'defeat');
      summary.gameOver = true;
      summary.victory = false;
      this.emit('gameOver', { victory: false, type: 'stalemate' });
      return;
    }
  }

  // ===========================================================================
  // COMPUTED PROPERTIES
  // ===========================================================================

  /**
   * Return research items available for the player to start.
   * Filters by: not completed, prerequisites met, faction compatibility, affordability.
   *
   * @returns {Object[]} Array of available research objects with affordability flag
   */
  getAvailableResearch() {
    if (!this.state) return [];
    return this._computeAvailableResearch().map((id) => {
      const data = RESEARCH_MAP ? RESEARCH_MAP.get(id) : { id, name: id, cost: { diversity: 3, turns: 2 } };
      const cost = data?.cost?.diversity ?? data?.cost ?? 3;
      return {
        ...data,
        canAfford: this.state.resources.geneticDiversity >= cost,
      };
    });
  }

  /**
   * Return regions that the pathogen can attempt to spread to.
   *
   * @returns {Array<{regionId: string, sourceId: string, difficulty: string}>}
   */
  getSpreadTargets() {
    if (!this.state) return [];

    const targets = [];
    const checked = new Set();

    for (const [regionId, region] of Object.entries(this.state.regions)) {
      if (region.colonization < 10) continue;

      const adjacent = ADJACENCY[regionId] || [];
      for (const adj of adjacent) {
        const adjId = typeof adj === 'string' ? adj : adj.regionId;
        if (!adjId || checked.has(adjId)) continue;
        checked.add(adjId);

        const adjRegion = this.state.regions[adjId];
        if (!adjRegion || adjRegion.colonization >= 80) continue;

        const regionData = REGION_MAP ? REGION_MAP.get(adjId) : null;
        const barrier = regionData?.barrierStrength || 30;
        const difficulty = barrier > 60 ? 'hard' : barrier > 30 ? 'medium' : 'easy';

        targets.push({ id: adjId, regionId: adjId, sourceId: regionId, difficulty });
      }
    }

    return targets;
  }

  /**
   * Apply a player's choice for an event that offers options.
   * @param {Object} eventData - Event data with choices array
   * @param {number} choiceIndex - Index of the chosen option
   */
  applyEventChoice(eventData, choiceIndex) {
    if (eventData?.choices?.[choiceIndex]?.effects) {
      for (const effect of eventData.choices[choiceIndex].effects) {
        this._applyEventEffects([effect]);
      }
    }
  }

  /**
   * Return available actions for a specific region.
   *
   * @param {string} regionId - Region to query
   * @returns {string[]} Array of action names available
   */
  getRegionActions(regionId) {
    if (!this.state) return [];
    const region = this.state.regions[regionId];
    if (!region) return [];

    const actions = [];

    if (region.colonization > 0 && region.colonization < MAX_COLONIZATION) {
      actions.push('reinforce');
    }
    if (region.colonization >= RESERVOIR_THRESHOLD && !region.isReservoir) {
      actions.push('establish_reservoir');
    }
    if (
      region.colonization >= 20 &&
      !region.hasBiofilm &&
      (this.state.faction.canBiofilm ||
        this.state.research.completed.includes('biofilm_formation') ||
        this.state.research.completed.includes('advanced_biofilm'))
    ) {
      actions.push('build_biofilm');
    }

    return actions;
  }

  /**
   * Get progress toward victory/defeat conditions.
   *
   * @returns {{regionsColonized: number, regionsTotal: number, percentColonized: number, damageTotal: number, hostHealth: number, turnsElapsed: number}}
   */
  getVictoryProgress() {
    if (!this.state) return null;

    const regionList = Object.entries(this.state.regions);
    const total = regionList.length;
    const colonized = regionList.filter(([, r]) => r.colonization >= COLONIZED_THRESHOLD).length;
    const totalDamage = regionList.reduce((sum, [, r]) => sum + r.damage, 0);

    return {
      regionsColonized: colonized,
      regionsTotal: total,
      percentColonized: total > 0 ? Math.round((colonized / total) * 100) : 0,
      damageTotal: totalDamage,
      hostHealth: Math.max(0, Math.round(100 - (totalDamage / HOST_DEATH_THRESHOLD) * 100)),
      turnsElapsed: this.state.turn,
      turnsRemaining: MAX_TURNS - this.state.turn,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Add a message to the game log and emit it.
   *
   * @param {string} message - Log message text
   * @param {'info'|'action'|'research'|'immune'|'event'|'faction'|'system'|'victory'|'defeat'} type - Message category
   */
  log(message, type = 'info') {
    if (!this.state) return;
    this.state.log.push({ turn: this.state.turn, message, type });
    this.emit('log', { turn: this.state.turn, message, type });
  }

  /**
   * Check if the player can afford a set of resource costs.
   *
   * @param {Object} costs - Map of resource name to amount required
   * @returns {boolean}
   */
  canAfford(costs) {
    if (!this.state) return false;
    for (const [resource, amount] of Object.entries(costs)) {
      if ((this.state.resources[resource] || 0) < amount) return false;
    }
    return true;
  }

  /**
   * Deduct resources. Assumes canAfford was already checked.
   *
   * @param {Object} costs - Map of resource name to amount to deduct
   */
  spendResources(costs) {
    for (const [resource, amount] of Object.entries(costs)) {
      this.state.resources[resource] = Math.max(0, (this.state.resources[resource] || 0) - amount);
    }
  }

  /**
   * Get all region IDs with colonization > 0.
   * @returns {string[]}
   */
  getColonizedRegions() {
    if (!this.state) return [];
    return Object.entries(this.state.regions)
      .filter(([, r]) => r.colonization > 0)
      .map(([id, r]) => ({ id, colonization: r.colonization, immunePresence: r.immunePresence }));
  }

  /**
   * Get the sum of colonization across all regions.
   * @returns {number}
   */
  getTotalColonization() {
    if (!this.state) return 0;
    return Object.values(this.state.regions).reduce((sum, r) => sum + r.colonization, 0);
  }

  /**
   * Get effective pathogen stats (faction base + all research bonuses).
   * @returns {Object} Stats map
   */
  getEffectiveStats() {
    if (!this.state) return {};
    const stats = { ...(this.state.faction.stats || {}) };
    for (const researchId of this.state.research.completed) {
      const research = RESEARCH_MAP ? RESEARCH_MAP.get(researchId) : null;
      if (research?.effects) {
        for (const effect of research.effects) {
          if (effect.stat) {
            stats[effect.stat] = (stats[effect.stat] || 0) + (effect.value || 0);
          }
        }
      }
    }
    return stats;
  }

  /**
   * Check whether a specific research item is currently available.
   *
   * @param {string} researchId - Research ID to check
   * @returns {boolean}
   */
  isResearchAvailable(researchId) {
    if (!this.state) return false;
    return this.state.research.available.includes(researchId);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Find a colonized source region adjacent to the target.
   * @param {string} targetId - Target region ID
   * @returns {string|null} Source region ID or null
   * @private
   */
  _findSpreadSource(targetId) {
    for (const [regionId, region] of Object.entries(this.state.regions)) {
      if (region.colonization < 10) continue;
      const adjacent = ADJACENCY[regionId] || [];
      for (const adj of adjacent) {
        const adjId = typeof adj === 'string' ? adj : adj.regionId;
        if (adjId === targetId) return regionId;
      }
    }
    return null;
  }

  /**
   * Compute which research IDs are currently available.
   * @returns {string[]}
   * @private
   */
  _computeAvailableResearch() {
    if (!RESEARCH) return [];
    const available = [];
    const completed = new Set(this.state.research.completed);

    const researchList = Array.isArray(RESEARCH) ? RESEARCH : Object.values(RESEARCH);

    for (const research of researchList) {
      if (completed.has(research.id)) continue;

      // Check faction exclusivity
      if (research.factionExclusive && research.factionExclusive !== this.state.faction.id) continue;

      // Check prerequisites
      const prereqsMet = (research.prerequisites || []).every((p) => completed.has(p));
      if (!prereqsMet) continue;

      available.push(research.id);
    }

    return available;
  }

  /**
   * Apply the stat effects of a completed research item.
   * @param {string} researchId
   * @private
   */
  _applyResearchEffects(researchId) {
    const research = RESEARCH_MAP ? RESEARCH_MAP.get(researchId) : null;
    if (!research || !research.effects) return;

    for (const effect of research.effects) {
      // Immediate resource changes
      if (effect.type === 'resourceBonus' && effect.resource) {
        this.state.resources[effect.resource] = (this.state.resources[effect.resource] || 0) + (effect.value || 0);
      }

      // Unlock flags
      if (effect.type === 'unlock') {
        if (effect.flag === 'canBiofilm') this.state.faction.canBiofilm = true;
        if (effect.flag === 'bloodstreamSpread') this.state.faction.bloodstreamSpread = true;
      }
    }
  }

  /**
   * Get the total bonus from completed research for a specific stat.
   * @param {string} stat - Stat name to sum
   * @returns {number}
   * @private
   */
  _getResearchBonus(stat) {
    let bonus = 0;
    for (const researchId of this.state.research.completed) {
      const research = RESEARCH_MAP ? RESEARCH_MAP.get(researchId) : null;
      if (!research || !research.effects) continue;
      for (const effect of research.effects) {
        if (effect.stat === stat) bonus += effect.value || 0;
      }
    }
    return bonus;
  }

  /**
   * Apply effects from an event.
   * @param {Array} effects - Array of event effect objects
   * @private
   */
  _applyEventEffects(effects) {
    if (!effects || effects.length === 0) return;

    for (const effect of effects) {
      const targetRegions = resolveEventTarget(effect.target, this.state.regions);

      switch (effect.type) {
        case 'colonizationChange':
          for (const rid of targetRegions) {
            this.state.regions[rid].colonization = clamp(
              this.state.regions[rid].colonization + effect.value,
              0,
              MAX_COLONIZATION
            );
          }
          break;

        case 'immunePresenceChange':
          for (const rid of targetRegions) {
            this.state.regions[rid].immunePresence = clamp(
              this.state.regions[rid].immunePresence + effect.value,
              0,
              100
            );
          }
          break;

        case 'inflammationChange':
          for (const rid of targetRegions) {
            this.state.regions[rid].inflammation = clamp(
              this.state.regions[rid].inflammation + effect.value,
              0,
              100
            );
          }
          break;

        case 'damageChange':
          for (const rid of targetRegions) {
            this.state.regions[rid].damage = clamp(
              this.state.regions[rid].damage + effect.value,
              0,
              100
            );
          }
          break;

        case 'resourceChange':
          // Positive value = biomass and energy bonus
          if (effect.value > 0) {
            this.state.resources.biomass = clamp(this.state.resources.biomass + effect.value, 0, MAX_BIOMASS);
            this.state.resources.energy = clamp(this.state.resources.energy + Math.round(effect.value * 0.5), 0, 50);
          } else {
            this.state.resources.energy = Math.max(0, this.state.resources.energy + effect.value);
          }
          break;

        case 'stealthChange':
          this.state.resources.stealth = clamp(
            this.state.resources.stealth + effect.value,
            0,
            MAX_STEALTH
          );
          break;

        case 'alertChange':
          this.state.immune.alertLevel = clamp(
            this.state.immune.alertLevel + effect.value,
            0,
            MAX_ALERT
          );
          break;

        case 'replicationMod':
          this.state.resources.replicationCapacity = Math.max(
            1,
            this.state.resources.replicationCapacity + effect.value
          );
          break;

        case 'modifierAdd':
          for (const rid of targetRegions) {
            this.state.regions[rid].modifiers.push({
              source: 'event',
              value: effect.value,
              duration: effect.duration > 0 ? effect.duration : -1,
            });
          }
          break;

        case 'transitBlock':
          for (const rid of targetRegions) {
            this.state.regions[rid].modifiers.push({
              source: 'transit_block',
              value: effect.value,
              duration: effect.duration > 0 ? effect.duration : 3,
            });
          }
          break;

        default:
          break;
      }

      // Track duration-based effects globally
      if (effect.duration > 0) {
        this.state.activeEvents.push({
          type: effect.type,
          target: effect.target,
          value: effect.value,
          turnsRemaining: effect.duration,
        });
      }
    }
  }

  /**
   * Apply a faction ability's effects.
   * @param {Object} ability - The ability object from faction data
   * @private
   */
  _applyAbilityEffects(ability) {
    if (!ability.effects) return;

    for (const effect of ability.effects) {
      switch (effect.type) {
        case 'stealth_burst':
          this.state.resources.stealth = clamp(this.state.resources.stealth + (effect.value || 20), 0, MAX_STEALTH);
          this.log('Stealth surge — immune detection temporarily reduced.', 'faction');
          break;

        case 'mass_spread': {
          // Attempt to reinforce all colonized regions slightly
          for (const region of Object.values(this.state.regions)) {
            if (region.colonization > 0) {
              region.colonization = clamp(region.colonization + (effect.value || 5), 0, MAX_COLONIZATION);
            }
          }
          this.log('Mass replication pulse — all colonies reinforced.', 'faction');
          break;
        }

        case 'immune_suppression': {
          // Temporarily reduce immune presence everywhere
          for (const region of Object.values(this.state.regions)) {
            region.immunePresence = clamp(region.immunePresence - (effect.value || 10), 0, 100);
          }
          this.state.immune.alertLevel = clamp(this.state.immune.alertLevel - (effect.value || 10), 0, MAX_ALERT);
          this.log('Immune suppression toxin released — defenses falter.', 'faction');
          break;
        }

        case 'antigenic_shift':
          // Clear all antibody targets
          this.state.immune.antibodyTargets = [];
          this.log('Major antigenic shift — immune memory wiped clean.', 'faction');
          break;

        case 'sporulate': {
          // All colonies drop to minimum but become invulnerable for 2 turns
          for (const region of Object.values(this.state.regions)) {
            if (region.colonization > 0) {
              region.colonization = Math.max(5, Math.round(region.colonization * 0.3));
              region.modifiers.push({ source: 'spore_shield', value: 1, duration: 2 });
            }
          }
          this.log('Emergency sporulation — colonies hardened but diminished.', 'faction');
          break;
        }

        case 'biofilm_fortify': {
          // All biofilm regions get massive defense boost
          for (const region of Object.values(this.state.regions)) {
            if (region.hasBiofilm) {
              region.colonization = clamp(region.colonization + 10, 0, MAX_COLONIZATION);
              region.modifiers.push({ source: 'fortified_biofilm', value: 2, duration: 3 });
            }
          }
          this.log('Biofilm matrix reinforced — defenses hardened across all biofilm sites.', 'faction');
          break;
        }

        default:
          // Generic effects fall through to event effect processor
          this._applyEventEffects([effect]);
          break;
      }
    }
  }
}
