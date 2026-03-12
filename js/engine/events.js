/**
 * @module events
 * @description Random events that occur during gameplay in Pathogen Dominion.
 * Events inject narrative variety and strategic disruption into each turn,
 * forcing the player to adapt their plans. Some events offer choices,
 * creating meaningful decision points.
 *
 * Event lifecycle:
 * 1. Each turn, every event is evaluated against its conditions and probability.
 * 2. If triggered, effects are applied immediately (or player chooses).
 * 3. Duration-based effects are tracked and cleaned up in upkeep.
 */

/**
 * @typedef {Object} EventEffect
 * @property {string} type - One of: 'immuneChange', 'colonizationChange',
 *   'resourceChange', 'modifierAdd', 'stealthChange', 'alertChange',
 *   'inflammationChange', 'damageChange', 'immunePresenceChange',
 *   'replicationMod', 'transitBlock'
 * @property {string|null} target - Region ID, 'all', 'random_colonized',
 *   'all_respiratory', 'all_gi', 'all_colonized', or null for global
 * @property {number} value - Magnitude of the effect (positive = beneficial to pathogen)
 * @property {number} duration - 0 = permanent/instant, N = lasts N turns
 */

/**
 * @typedef {Object} EventChoice
 * @property {string} text - Description shown to the player
 * @property {EventEffect[]} effects - Effects applied if this choice is selected
 */

/**
 * @typedef {Object} EventConditions
 * @property {number|null} minAlertLevel - Minimum immune alert level required
 * @property {number|null} maxAlertLevel - Maximum immune alert level allowed
 * @property {string[]|null} requiresColonized - Region IDs that must be colonized
 * @property {boolean|null} requiresTreatment - Whether treatment must be active
 * @property {number|null} minTotalColonization - Minimum sum of all region colonization
 * @property {number|null} minTurn - Minimum turn (overrides top-level minTurn if set)
 * @property {string[]|null} requiresRegionVisible - Regions that must be visible/discovered
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - Narrative description of what's happening
 * @property {number} probability - Base chance per turn (0.0 - 1.0)
 * @property {number} minTurn - Earliest turn this event can trigger
 * @property {number} maxOccurrences - Maximum times per game (-1 = unlimited)
 * @property {EventConditions} conditions - Required game state conditions
 * @property {EventEffect[]} effects - Effects applied when event triggers (if no choices)
 * @property {EventChoice[]|null} choices - If not null, player must choose a response
 */

/** @type {GameEvent[]} */
export const EVENTS = [
  // =========================================================================
  // POSITIVE EVENTS (Benefit the pathogen)
  // =========================================================================
  {
    id: 'wound_opens',
    name: 'Wound Opens',
    description:
      'A small cut on the skin breaks the epithelial barrier. Immune cells rush to the site, ' +
      'thinning defenses elsewhere. A perfect entry point for opportunistic colonization.',
    probability: 0.06,
    minTurn: 3,
    maxOccurrences: 3,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: 70,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'skin', value: -25, duration: 3 },
      { type: 'colonizationChange', target: 'skin', value: 15, duration: 0 },
      { type: 'alertChange', target: null, value: 5, duration: 0 },
    ],
    choices: null,
  },

  {
    id: 'immune_suppression',
    name: 'Immune Suppression',
    description:
      'The host is exhausted — perhaps from stress or poor sleep. Cortisol floods the system, ' +
      'dampening immune surveillance across the board. A window of opportunity.',
    probability: 0.07,
    minTurn: 5,
    maxOccurrences: 4,
    conditions: {
      minAlertLevel: 20,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 50,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'all', value: -10, duration: 3 },
      { type: 'alertChange', target: null, value: -8, duration: 0 },
      { type: 'stealthChange', target: null, value: 5, duration: 3 },
    ],
    choices: null,
  },

  {
    id: 'stress_response',
    name: 'Stress Response',
    description:
      'The host is under psychological stress. Adrenaline diverts resources away from ' +
      'immune patrol, and the gut-brain axis weakens GI defenses slightly.',
    probability: 0.09,
    minTurn: 2,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'all', value: -5, duration: 2 },
      { type: 'immunePresenceChange', target: 'gi_tract', value: -8, duration: 2 },
      { type: 'alertChange', target: null, value: -3, duration: 0 },
    ],
    choices: null,
  },

  {
    id: 'microbiome_disruption',
    name: 'Microbiome Disruption',
    description:
      'Something has upset the delicate balance of the gut microbiome. Commensal bacteria ' +
      'are depleted, leaving ecological niches wide open. The GI tract is vulnerable.',
    probability: 0.05,
    minTurn: 6,
    maxOccurrences: 2,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 30,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'gi_tract', value: -20, duration: 4 },
      { type: 'immunePresenceChange', target: 'intestines', value: -20, duration: 4 },
      { type: 'colonizationChange', target: 'gi_tract', value: 10, duration: 0 },
      { type: 'resourceChange', target: null, value: 3, duration: 0 },
    ],
    choices: null,
  },

  {
    id: 'nutrient_surge',
    name: 'Nutrient Surge',
    description:
      'The host has consumed a large, nutrient-rich meal. Sugars and amino acids flood ' +
      'the bloodstream and GI tract — a metabolic feast for fast-growing pathogens.',
    probability: 0.08,
    minTurn: 1,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 10,
    },
    effects: [
      { type: 'resourceChange', target: null, value: 5, duration: 0 },
    ],
    choices: {
      prompt: 'A flood of nutrients is available. How will you use this bounty?',
      options: [
        {
          text: 'Rapid replication — convert nutrients into raw biomass growth.',
          effects: [
            { type: 'resourceChange', target: null, value: 8, duration: 0 },
            { type: 'alertChange', target: null, value: 5, duration: 0 },
          ],
        },
        {
          text: 'Measured growth — store energy reserves for later turns.',
          effects: [
            { type: 'resourceChange', target: null, value: 4, duration: 0 },
          ],
        },
      ],
    },
  },

  {
    id: 'mutation_opportunity',
    name: 'Mutation Opportunity',
    description:
      'A replication error has produced a beneficial mutation. New genetic material ' +
      'is available — this could accelerate your adaptation research.',
    probability: 0.06,
    minTurn: 4,
    maxOccurrences: 5,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 40,
    },
    effects: [],
    choices: {
      prompt: 'A mutation has emerged. How will you incorporate it?',
      options: [
        {
          text: 'Channel it into research — gain a burst of genetic diversity.',
          effects: [
            { type: 'resourceChange', target: null, value: 5, duration: 0 },
          ],
        },
        {
          text: 'Express it immediately — boost stealth at the cost of stability.',
          effects: [
            { type: 'stealthChange', target: null, value: 10, duration: 4 },
            { type: 'colonizationChange', target: 'random_colonized', value: -5, duration: 0 },
          ],
        },
        {
          text: 'Strengthen existing colonies — reinforce current positions.',
          effects: [
            { type: 'colonizationChange', target: 'all_colonized', value: 5, duration: 0 },
          ],
        },
      ],
    },
  },

  {
    id: 'commensal_alliance',
    name: 'Commensal Alliance',
    description:
      'Resident gut bacteria have shifted their metabolic output in a way that benefits ' +
      'your colonies. Their biofilms provide partial cover, and their metabolites feed your growth.',
    probability: 0.04,
    minTurn: 8,
    maxOccurrences: 2,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: 60,
      requiresColonized: ['gi_tract'],
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'colonizationChange', target: 'gi_tract', value: 10, duration: 0 },
      { type: 'colonizationChange', target: 'intestines', value: 8, duration: 0 },
      { type: 'stealthChange', target: null, value: 5, duration: 5 },
      { type: 'modifierAdd', target: 'gi_tract', value: 1, duration: 5 },
    ],
    choices: null,
  },

  // =========================================================================
  // NEGATIVE EVENTS (Benefit the immune system)
  // =========================================================================
  {
    id: 'fever_spike',
    name: 'Fever Spike',
    description:
      'The hypothalamus has triggered a sharp temperature increase. The heat accelerates ' +
      'immune cell activity but slows pathogen replication. Everything feels hostile.',
    probability: 0.08,
    minTurn: 5,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: 40,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 60,
    },
    effects: [
      { type: 'replicationMod', target: null, value: -2, duration: 3 },
      { type: 'immunePresenceChange', target: 'all', value: 8, duration: 3 },
      { type: 'alertChange', target: null, value: 5, duration: 0 },
    ],
    choices: null,
  },

  {
    id: 'antibiotic_course',
    name: 'Antibiotic Course',
    description:
      'The host has begun a course of antibiotics. Chemical warfare rages through every ' +
      'tissue — broad-spectrum destruction that hits pathogen and commensal alike.',
    probability: 0.10,
    minTurn: 10,
    maxOccurrences: 2,
    conditions: {
      minAlertLevel: 70,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: true,
      minTotalColonization: 100,
    },
    effects: [
      { type: 'colonizationChange', target: 'all_colonized', value: -15, duration: 0 },
      { type: 'immunePresenceChange', target: 'all', value: 10, duration: 4 },
    ],
    choices: {
      prompt: 'Antibiotics are flooding in. How do you respond?',
      options: [
        {
          text: 'Hunker down — retreat to reservoirs and biofilms. Survive the storm.',
          effects: [
            { type: 'colonizationChange', target: 'all_colonized', value: -10, duration: 0 },
            { type: 'stealthChange', target: null, value: 15, duration: 3 },
          ],
        },
        {
          text: 'Resist — burn energy to maintain colonies through the assault.',
          effects: [
            { type: 'resourceChange', target: null, value: -8, duration: 0 },
            { type: 'colonizationChange', target: 'all_colonized', value: 5, duration: 0 },
          ],
        },
      ],
    },
  },

  {
    id: 'mucus_surge',
    name: 'Mucus Surge',
    description:
      'Goblet cells in the respiratory tract are producing mucus at an accelerated rate. ' +
      'A thick, sticky tide sweeps through the airways, carrying pathogens toward expulsion.',
    probability: 0.07,
    minTurn: 3,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: 20,
      maxAlertLevel: null,
      requiresColonized: ['respiratory_tract'],
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'colonizationChange', target: 'respiratory_tract', value: -12, duration: 0 },
      { type: 'colonizationChange', target: 'nasal_cavity', value: -10, duration: 0 },
      { type: 'colonizationChange', target: 'lungs', value: -8, duration: 0 },
      { type: 'inflammationChange', target: 'respiratory_tract', value: 10, duration: 2 },
    ],
    choices: null,
  },

  {
    id: 'tissue_repair',
    name: 'Tissue Repair',
    description:
      'The host body is actively repairing damaged tissue in a colonized region. ' +
      'New healthy cells displace infected ones, and local immune surveillance intensifies.',
    probability: 0.07,
    minTurn: 6,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 80,
    },
    effects: [
      { type: 'colonizationChange', target: 'random_colonized', value: -15, duration: 0 },
      { type: 'damageChange', target: 'random_colonized', value: -10, duration: 0 },
      { type: 'immunePresenceChange', target: 'random_colonized', value: 10, duration: 3 },
    ],
    choices: null,
  },

  {
    id: 'lymph_node_activation',
    name: 'Lymph Node Activation',
    description:
      'A nearby lymph node has detected pathogen antigens and gone into overdrive. ' +
      'Waves of activated lymphocytes are deploying — the adaptive immune system is surging.',
    probability: 0.05,
    minTurn: 10,
    maxOccurrences: 3,
    conditions: {
      minAlertLevel: 50,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 100,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'all_colonized', value: 15, duration: 4 },
      { type: 'alertChange', target: null, value: 10, duration: 0 },
      { type: 'stealthChange', target: null, value: -10, duration: 4 },
    ],
    choices: null,
  },

  {
    id: 'immune_memory_formed',
    name: 'Immune Memory Formed',
    description:
      'The adaptive immune system has catalogued one of your key surface proteins. ' +
      'Memory B cells now produce antibodies that specifically target this trait. ' +
      'Future immune responses against it will be swift and devastating.',
    probability: 0.04,
    minTurn: 12,
    maxOccurrences: 4,
    conditions: {
      minAlertLevel: 45,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 80,
    },
    effects: [
      { type: 'alertChange', target: null, value: 5, duration: 0 },
      { type: 'stealthChange', target: null, value: -8, duration: 0 },
      { type: 'immunePresenceChange', target: 'all_colonized', value: 5, duration: 0 },
      // Note: The game engine also selects and permanently marks a pathogen trait
      // as "targeted" when this event fires. See processEvents() in game.js.
    ],
    choices: null,
  },

  // =========================================================================
  // DOUBLE-EDGED EVENTS (Mixed effects)
  // =========================================================================
  {
    id: 'inflammatory_storm',
    name: 'Inflammatory Storm',
    description:
      'The immune system has overreacted catastrophically. A cytokine storm rages through ' +
      'colonized regions — destroying pathogen AND host tissue alike. Collateral damage is immense.',
    probability: 0.03,
    minTurn: 15,
    maxOccurrences: 2,
    conditions: {
      minAlertLevel: 70,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 150,
    },
    effects: [
      { type: 'colonizationChange', target: 'all_colonized', value: -20, duration: 0 },
      { type: 'damageChange', target: 'all_colonized', value: 25, duration: 0 },
      { type: 'inflammationChange', target: 'all_colonized', value: 30, duration: 3 },
      { type: 'immunePresenceChange', target: 'all', value: -10, duration: 2 },
      { type: 'alertChange', target: null, value: -10, duration: 0 },
    ],
    choices: null,
  },

  {
    id: 'blood_clot',
    name: 'Blood Clot',
    description:
      'A clot has formed in a blood vessel, blocking the normal flow. Transit through ' +
      'the bloodstream is temporarily impaired — trapping pathogens but also immune cells.',
    probability: 0.05,
    minTurn: 5,
    maxOccurrences: 3,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: ['bloodstream'],
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'transitBlock', target: 'bloodstream', value: 1, duration: 3 },
      { type: 'immunePresenceChange', target: 'bloodstream', value: -15, duration: 3 },
      { type: 'colonizationChange', target: 'bloodstream', value: -5, duration: 0 },
    ],
    choices: {
      prompt: 'A blood clot has formed, creating a stagnant zone. How do you exploit it?',
      options: [
        {
          text: 'Colonize the clot — use it as a sheltered micro-environment.',
          effects: [
            { type: 'colonizationChange', target: 'bloodstream', value: 12, duration: 0 },
            { type: 'damageChange', target: 'bloodstream', value: 5, duration: 0 },
          ],
        },
        {
          text: 'Stay clear — focus on other regions while transit is blocked.',
          effects: [
            { type: 'resourceChange', target: null, value: 3, duration: 0 },
          ],
        },
      ],
    },
  },

  {
    id: 'hormone_fluctuation',
    name: 'Hormone Fluctuation',
    description:
      'A shift in the host\'s hormonal balance is altering tissue environments. ' +
      'Some regions become more hospitable to pathogens, others less so.',
    probability: 0.06,
    minTurn: 4,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: 20,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'random_colonized', value: -12, duration: 3 },
      { type: 'immunePresenceChange', target: 'random_colonized', value: 8, duration: 3 },
      { type: 'colonizationChange', target: 'random_colonized', value: 5, duration: 0 },
    ],
    choices: null,
  },

  {
    id: 'sleep_cycle',
    name: 'Deep Sleep Phase',
    description:
      'The host has entered deep sleep. Immune cell redistribution occurs — some tissues ' +
      'see increased patrolling while others are temporarily neglected. A quiet moment to grow.',
    probability: 0.08,
    minTurn: 1,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: 60,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'skin', value: -8, duration: 1 },
      { type: 'immunePresenceChange', target: 'respiratory_tract', value: -8, duration: 1 },
      { type: 'immunePresenceChange', target: 'bloodstream', value: 5, duration: 1 },
      { type: 'immunePresenceChange', target: 'lymph_nodes', value: 10, duration: 1 },
    ],
    choices: null,
  },

  {
    id: 'dehydration',
    name: 'Dehydration',
    description:
      'The host hasn\'t been drinking enough water. Mucus membranes are drying out, ' +
      'reducing the effectiveness of mucus barriers but also slowing pathogen motility.',
    probability: 0.06,
    minTurn: 2,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'respiratory_tract', value: -10, duration: 2 },
      { type: 'immunePresenceChange', target: 'nasal_cavity', value: -10, duration: 2 },
      { type: 'immunePresenceChange', target: 'urinary_tract', value: -8, duration: 2 },
    ],
    choices: {
      prompt: 'Mucus barriers are weakened by dehydration. How do you respond?',
      options: [
        {
          text: 'Push into respiratory regions while defenses are down.',
          effects: [
            { type: 'colonizationChange', target: 'respiratory_tract', value: 10, duration: 0 },
            { type: 'colonizationChange', target: 'nasal_cavity', value: 8, duration: 0 },
            { type: 'alertChange', target: null, value: 5, duration: 0 },
          ],
        },
        {
          text: 'Exploit weakened urinary flushing to establish in the urinary tract.',
          effects: [
            { type: 'colonizationChange', target: 'urinary_tract', value: 12, duration: 0 },
            { type: 'alertChange', target: null, value: 3, duration: 0 },
          ],
        },
      ],
    },
  },

  {
    id: 'exercise_response',
    name: 'Exercise Response',
    description:
      'The host is exercising vigorously. Blood flow increases dramatically, immune cells ' +
      'circulate faster, but oxygen demand creates metabolic opportunities in muscle tissue.',
    probability: 0.07,
    minTurn: 3,
    maxOccurrences: -1,
    conditions: {
      minAlertLevel: null,
      maxAlertLevel: null,
      requiresColonized: null,
      requiresTreatment: null,
      minTotalColonization: null,
    },
    effects: [
      { type: 'immunePresenceChange', target: 'bloodstream', value: 10, duration: 2 },
      { type: 'immunePresenceChange', target: 'skin', value: -5, duration: 2 },
      { type: 'immunePresenceChange', target: 'respiratory_tract', value: -5, duration: 2 },
    ],
    choices: null,
  },
];

/**
 * Resolve a target string to actual region IDs given current game state.
 * Used by the game engine when applying event effects.
 *
 * @param {string|null} target - The target specifier from the event effect
 * @param {Object} regions - The game state regions map { regionId: RegionState }
 * @returns {string[]} Array of region IDs to apply the effect to
 */
export function resolveEventTarget(target, regions) {
  if (target === null) return [];
  if (target === 'all') return Object.keys(regions);

  if (target === 'all_colonized') {
    return Object.keys(regions).filter((id) => regions[id].colonization > 0);
  }

  if (target === 'random_colonized') {
    const colonized = Object.keys(regions).filter((id) => regions[id].colonization > 0);
    if (colonized.length === 0) return [];
    const idx = Math.floor(Math.random() * colonized.length);
    return [colonized[idx]];
  }

  if (target === 'all_respiratory') {
    return Object.keys(regions).filter(
      (id) =>
        id === 'respiratory_tract' ||
        id === 'nasal_cavity' ||
        id === 'lungs' ||
        id === 'trachea'
    );
  }

  if (target === 'all_gi') {
    return Object.keys(regions).filter(
      (id) =>
        id === 'gi_tract' ||
        id === 'stomach' ||
        id === 'intestines' ||
        id === 'oral_cavity'
    );
  }

  // Assume it's a specific region ID
  if (regions[target] !== undefined) return [target];

  return [];
}

/**
 * Check whether an event's conditions are met given the current game state.
 *
 * @param {GameEvent} event - The event to check
 * @param {Object} state - Full game state from GameEngine
 * @param {number} occurrenceCount - How many times this event has already fired
 * @returns {boolean} True if the event may trigger this turn
 */
export function checkEventConditions(event, state, occurrenceCount) {
  // Max occurrences
  if (event.maxOccurrences !== -1 && occurrenceCount >= event.maxOccurrences) {
    return false;
  }

  // Min turn
  if (state.turn < event.minTurn) return false;

  const { conditions } = event;

  if (conditions.minAlertLevel !== null && state.immune.alertLevel < conditions.minAlertLevel) {
    return false;
  }
  if (conditions.maxAlertLevel !== null && state.immune.alertLevel > conditions.maxAlertLevel) {
    return false;
  }
  if (conditions.requiresTreatment === true && state.immune.treatmentPhase === 0) {
    return false;
  }
  if (conditions.requiresColonized) {
    for (const regionId of conditions.requiresColonized) {
      if (!state.regions[regionId] || state.regions[regionId].colonization <= 0) {
        return false;
      }
    }
  }
  if (conditions.minTotalColonization !== null) {
    const total = Object.values(state.regions).reduce((sum, r) => sum + r.colonization, 0);
    if (total < conditions.minTotalColonization) return false;
  }

  return true;
}
