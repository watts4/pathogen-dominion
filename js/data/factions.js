/**
 * Pathogen Dominion — Faction Data
 *
 * Six playable pathogen archetypes, each with distinct mechanics
 * and scientifically-grounded flavor.
 */

export const FACTIONS = [
  // ── 1. The Swarm — Extracellular Bacterium ─────────────────────────
  {
    id: 'swarm',
    name: 'The Swarm',
    subtitle: 'Extracellular Bacterium',
    inspiration:
      'Inspired by fast-growing pyogenic cocci and staphylococci that thrive on exposed surfaces and in wounds.',
    description:
      'A teeming horde that overwhelms through sheer numbers. The Swarm multiplies rapidly in nutrient-rich tissue, coating surfaces in resilient biofilms that frustrate immune clearance. What they lack in subtlety they make up for in relentless expansion.',
    color: '#e6a820',
    secondaryColor: '#f0d060',
    strengths: [
      'Fastest replication in the game',
      'Biofilm grants passive defense in colonized regions',
      'Broad tissue compatibility — can colonize most surfaces',
      'Strong early-game momentum',
    ],
    weaknesses: [
      'Highly visible to adaptive immunity',
      'Vulnerable to targeted immune response once detected',
      'Cannot easily enter intracellular sanctuaries',
      'Biofilm takes time to mature',
    ],
    preferredTissues: ['skin_upper', 'skin_lower', 'wound_site', 'pharynx', 'bloodstream'],
    spreadRoutes: ['contact', 'bloodborne'],
    startRegions: ['wound_site', 'pharynx'],
    stats: {
      replicationRate: 8,
      persistence: 6,
      stealth: 4,
      mutationRate: 5,
      tissueRange: 7,
      damageOutput: 6,
      immuneEvasion: 3,
      environmentalTolerance: 5,
    },
    starterTraits: [
      'surface_adhesins',
      'rapid_binary_fission',
      'basic_nutrient_scavenge',
      'contact_spread',
    ],
    uniqueResearch: [
      'swarm_biofilm_matrix',
      'swarm_quorum_sensing',
      'swarm_leukocidin',
      'swarm_superantigen',
      'swarm_siderophore_burst',
    ],
    passiveAbility: {
      name: 'Biofilm Fortress',
      description:
        'Each colonized region accumulates +2 defense per turn (max +20). Biofilm must be destroyed before the pathogen can be cleared.',
      effect: { type: 'defensePerTurn', value: 2 },
    },
    victoryBonus:
      'Territorial Dominion — bonus victory points for controlling the most regions simultaneously.',
    spriteColor: '#e6a820',
    icon: '🦠',
  },

  // ── 2. The Phantom — Intracellular Bacterium ───────────────────────
  {
    id: 'phantom',
    name: 'The Phantom',
    subtitle: 'Intracellular Bacterium',
    inspiration:
      'Inspired by slow-growing intracellular pathogens that persist within host macrophages for years.',
    description:
      'Patient and insidious, The Phantom slips inside the very cells sent to destroy it. Growing slowly within macrophages and epithelial cells, it evades detection for long stretches — only revealing itself when deeply entrenched.',
    color: '#6060c0',
    secondaryColor: '#9090e0',
    strengths: [
      'Extremely difficult to clear once established',
      'Hides inside host immune cells',
      'High persistence lets it survive immune surges',
      'Excels in deep tissue organs',
    ],
    weaknesses: [
      'Slowest early-game expansion',
      'Requires intracellular entry machinery',
      'Vulnerable during extracellular transit',
      'Cell-mediated immunity (Th1) is its nemesis',
    ],
    preferredTissues: ['lungs_deep', 'alveoli', 'liver', 'bone_marrow'],
    spreadRoutes: ['mucosal', 'bloodborne'],
    startRegions: ['alveoli', 'pharynx'],
    stats: {
      replicationRate: 3,
      persistence: 9,
      stealth: 8,
      mutationRate: 3,
      tissueRange: 5,
      damageOutput: 4,
      immuneEvasion: 7,
      environmentalTolerance: 5,
    },
    starterTraits: [
      'cell_invasion_pili',
      'phagosome_escape',
      'basic_nutrient_scavenge',
      'mucosal_attachment',
    ],
    uniqueResearch: [
      'phantom_granuloma_fortress',
      'phantom_macrophage_subversion',
      'phantom_latency_program',
      'phantom_iron_piracy',
      'phantom_reactivation_trigger',
    ],
    passiveAbility: {
      name: 'Intracellular Refuge',
      description:
        'Immune attacks against The Phantom deal 40% reduced damage. Immune detection thresholds are raised by +15.',
      effect: { type: 'immuneDamageReduction', value: 0.4 },
    },
    victoryBonus:
      'Endurance Victory — bonus victory points for maintaining presence in any region for 30+ consecutive turns.',
    spriteColor: '#6060c0',
    icon: '👻',
  },

  // ── 3. The Shifting Tide — Enveloped RNA Virus ─────────────────────
  {
    id: 'shifting_tide',
    name: 'The Shifting Tide',
    subtitle: 'Enveloped RNA Virus',
    inspiration:
      'Inspired by highly mutable respiratory viruses that sweep through populations in seasonal waves.',
    description:
      'A quicksilver contagion that evolves faster than the immune system can adapt. The Shifting Tide burns through respiratory tissue at blistering speed, its RNA genome reshuffling surface proteins to stay one step ahead of antibodies — until the host catches up.',
    color: '#20a0d0',
    secondaryColor: '#60d0f0',
    strengths: [
      'Fastest spread in the game',
      'Unmatched mutation rate resets immune targeting',
      'Dominates respiratory tissue',
      'Can trigger pandemic-scale events',
    ],
    weaknesses: [
      'Burns out quickly — very low persistence',
      'Fragile envelope limits environmental survival',
      'Once adaptive immunity locks on, decline is rapid',
      'Limited tissue range outside respiratory tract',
    ],
    preferredTissues: ['nasal_cavity', 'pharynx', 'bronchi', 'alveoli'],
    spreadRoutes: ['mucosal', 'respiratory'],
    startRegions: ['nasal_cavity', 'pharynx'],
    stats: {
      replicationRate: 9,
      persistence: 2,
      stealth: 5,
      mutationRate: 10,
      tissueRange: 4,
      damageOutput: 5,
      immuneEvasion: 6,
      environmentalTolerance: 2,
    },
    starterTraits: [
      'receptor_binding_spike',
      'rapid_binary_fission',
      'mucosal_attachment',
      'antigenic_drift',
    ],
    uniqueResearch: [
      'tide_antigenic_shift',
      'tide_reassortment',
      'tide_cytokine_storm',
      'tide_tropism_expansion',
      'tide_neuraminidase_boost',
    ],
    passiveAbility: {
      name: 'Antigenic Shift',
      description:
        'Every 8 turns, reset 50% of accumulated immune memory against this faction. Costs 3 diversity.',
      effect: { type: 'immuneMemoryReset', value: 0.5 },
    },
    victoryBonus:
      'Blitz Victory — bonus victory points for colonizing 10+ regions within 20 turns.',
    spriteColor: '#20a0d0',
    icon: '🌊',
  },

  // ── 4. The Lurker — Non-enveloped Virus ────────────────────────────
  {
    id: 'lurker',
    name: 'The Lurker',
    subtitle: 'Non-enveloped Virus',
    inspiration:
      'Inspired by robust enteric viruses that survive stomach acid and persist on surfaces for days.',
    description:
      'Encased in a naked protein capsid that shrugs off acid, detergent, and desiccation, The Lurker patiently endures the harshest environments in the body. It owns the GI tract, quietly hijacking enterocytes while the immune system fights flashier threats.',
    color: '#505050',
    secondaryColor: '#808080',
    strengths: [
      'Survives extreme pH and hostile environments',
      'Dominates GI tract like no other faction',
      'Tough capsid resists environmental damage',
      'Difficult to fully eliminate from GI surfaces',
    ],
    weaknesses: [
      'Very narrow tissue tropism',
      'Completely dependent on host cell replication machinery',
      'Slow to escape the GI tract',
      'Limited bloodborne spread capacity',
    ],
    preferredTissues: ['small_intestine', 'large_intestine', 'stomach', 'liver'],
    spreadRoutes: ['fecal_oral', 'mucosal'],
    startRegions: ['oral_cavity', 'stomach'],
    stats: {
      replicationRate: 6,
      persistence: 7,
      stealth: 5,
      mutationRate: 4,
      tissueRange: 3,
      damageOutput: 5,
      immuneEvasion: 4,
      environmentalTolerance: 9,
    },
    starterTraits: [
      'acid_resistance_capsid',
      'enterocyte_binding',
      'basic_nutrient_scavenge',
      'bile_tolerance',
    ],
    uniqueResearch: [
      'lurker_capsid_reinforcement',
      'lurker_hepatotropism',
      'lurker_fecal_shedding',
      'lurker_chronic_carrier',
      'lurker_epithelial_tunneling',
    ],
    passiveAbility: {
      name: 'Environmental Persistence',
      description:
        'Hostile region properties (pH, temperature, fluidFlow) deal 50% less attrition. Can colonize stomach at reduced threshold.',
      effect: { type: 'environmentalAttritionReduction', value: 0.5 },
    },
    victoryBonus:
      'Fortress Victory — bonus victory points for holding all GI tract regions simultaneously for 10+ turns.',
    spriteColor: '#505050',
    icon: '💀',
  },

  // ── 5. The Creeping Mold — Fungal Pathogen ─────────────────────────
  {
    id: 'creeping_mold',
    name: 'The Creeping Mold',
    subtitle: 'Fungal Pathogen',
    inspiration:
      'Inspired by opportunistic molds and yeasts that colonize immunocompromised hosts with tenacious, branching growth.',
    description:
      'Slow. Inexorable. Unkillable. The Creeping Mold extends thread-like hyphae through tissue, sharing nutrients across a living network. It waits for the immune system to falter, then spreads like roots through cracked earth — patient, adaptive, and nearly impossible to uproot.',
    color: '#408040',
    secondaryColor: '#70b070',
    strengths: [
      'Highest persistence in the game — nearly impossible to eradicate',
      'Hyphal network shares resources between adjacent regions',
      'Thrives in immunocompromised conditions',
      'High environmental tolerance across tissue types',
    ],
    weaknesses: [
      'Slowest replication of all factions',
      'Healthy immune systems suppress growth aggressively',
      'Requires turns of buildup before becoming dangerous',
      'Poor at rapid territorial expansion',
    ],
    preferredTissues: ['lungs_deep', 'skin_upper', 'sinuses', 'oral_cavity'],
    spreadRoutes: ['contact', 'mucosal'],
    startRegions: ['sinuses', 'oral_cavity', 'skin_upper'],
    stats: {
      replicationRate: 2,
      persistence: 10,
      stealth: 6,
      mutationRate: 2,
      tissueRange: 6,
      damageOutput: 4,
      immuneEvasion: 5,
      environmentalTolerance: 8,
    },
    starterTraits: [
      'chitin_cell_wall',
      'hyphal_growth',
      'basic_nutrient_scavenge',
      'contact_spread',
    ],
    uniqueResearch: [
      'mold_hyphal_network',
      'mold_sporulation',
      'mold_melanin_shield',
      'mold_enzymatic_invasion',
      'mold_dimorphic_switch',
    ],
    passiveAbility: {
      name: 'Hyphal Network',
      description:
        'Adjacent colonized regions share 25% of their resource yield. Losing one region does not break the network unless all connections are severed.',
      effect: { type: 'adjacentResourceShare', value: 0.25 },
    },
    victoryBonus:
      'Network Victory — bonus victory points for having 5+ connected colonized regions forming a contiguous network.',
    spriteColor: '#408040',
    icon: '🍄',
  },

  // ── 6. The Shapeshifter — Protozoan Parasite ───────────────────────
  {
    id: 'shapeshifter',
    name: 'The Shapeshifter',
    subtitle: 'Protozoan Parasite',
    inspiration:
      'Inspired by complex-lifecycle parasites that alternate between tissue stages and manipulate host immune responses.',
    description:
      'A master of reinvention, The Shapeshifter cycles through distinct lifecycle stages — each optimized for a different tissue and tactical role. It manipulates host cells to build safe havens, evades immune detection through surface variation, and strikes from unexpected angles.',
    color: '#a040a0',
    secondaryColor: '#d070d0',
    strengths: [
      'Lifecycle stages grant unique bonuses per tissue type',
      'Highest immune evasion through surface switching',
      'Can colonize diverse tissue types via stage transformation',
      'Manipulates host immune response directly',
    ],
    weaknesses: [
      'Must research stage transitions — locked out of some tissues early',
      'Complex lifecycle requirements slow expansion',
      'Losing a lifecycle stage region disrupts the chain',
      'Jack of all trades, master of none without investment',
    ],
    preferredTissues: ['liver', 'bloodstream', 'cns', 'bone_marrow'],
    spreadRoutes: ['bloodborne'],
    startRegions: ['bloodstream', 'liver'],
    stats: {
      replicationRate: 5,
      persistence: 6,
      stealth: 7,
      mutationRate: 5,
      tissueRange: 7,
      damageOutput: 5,
      immuneEvasion: 9,
      environmentalTolerance: 5,
    },
    starterTraits: [
      'cell_invasion_pili',
      'surface_variation',
      'basic_nutrient_scavenge',
      'blood_stage_entry',
    ],
    uniqueResearch: [
      'shifter_liver_stage',
      'shifter_blood_stage_mastery',
      'shifter_cns_tropism',
      'shifter_antigenic_switching',
      'shifter_dormant_cyst',
    ],
    passiveAbility: {
      name: 'Lifecycle Stages',
      description:
        'Can transform between Trophozoite (high replication), Merozoite (high spread), and Cyst (high persistence) forms. Transformation costs 1 turn and 2 diversity.',
      effect: { type: 'lifecycleTransform', value: 3 },
    },
    victoryBonus:
      'Infiltration Victory — bonus victory points for colonizing all four preferred tissues simultaneously.',
    spriteColor: '#a040a0',
    icon: '🔄',
  },
];

export const FACTION_MAP = new Map(FACTIONS.map((f) => [f.id, f]));
