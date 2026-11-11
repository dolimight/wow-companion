/** Retail specializations by class, with the game's specialization IDs */
export const classSpecializations: Record<string, Array<{ id: number; name: string }>> = {
  'warrior': [{ id: 71, name: 'Arms' }, { id: 72, name: 'Fury' }, { id: 73, name: 'Protection' }],
  'paladin': [{ id: 65, name: 'Holy' }, { id: 66, name: 'Protection' }, { id: 70, name: 'Retribution' }],
  'hunter': [{ id: 253, name: 'Beast Mastery' }, { id: 254, name: 'Marksmanship' }, { id: 255, name: 'Survival' }],
  'rogue': [{ id: 259, name: 'Assassination' }, { id: 260, name: 'Outlaw' }, { id: 261, name: 'Subtlety' }],
  'priest': [{ id: 256, name: 'Discipline' }, { id: 257, name: 'Holy' }, { id: 258, name: 'Shadow' }],
  'death knight': [{ id: 250, name: 'Blood' }, { id: 251, name: 'Frost' }, { id: 252, name: 'Unholy' }],
  'shaman': [{ id: 262, name: 'Elemental' }, { id: 263, name: 'Enhancement' }, { id: 264, name: 'Restoration' }],
  'mage': [{ id: 62, name: 'Arcane' }, { id: 63, name: 'Fire' }, { id: 64, name: 'Frost' }],
  'warlock': [{ id: 265, name: 'Affliction' }, { id: 266, name: 'Demonology' }, { id: 267, name: 'Destruction' }],
  'monk': [{ id: 268, name: 'Brewmaster' }, { id: 270, name: 'Mistweaver' }, { id: 269, name: 'Windwalker' }],
  'druid': [{ id: 102, name: 'Balance' }, { id: 103, name: 'Feral' }, { id: 104, name: 'Guardian' }, { id: 105, name: 'Restoration' }],
  'demon hunter': [{ id: 577, name: 'Havoc' }, { id: 581, name: 'Vengeance' }, { id: 1480, name: 'Devourer' }],
  'evoker': [{ id: 1467, name: 'Devastation' }, { id: 1468, name: 'Preservation' }, { id: 1473, name: 'Augmentation' }],
}

/** The specializations a character's class can play; empty when the class is unknown */
export function specializationsFor(className: string) {
  return classSpecializations[className.trim().toLowerCase().replace(/\s+/g, ' ')] ?? []
}

/** A specialization's name, falling back to the character's own spec name when the ID isn't listed */
export function specializationName(specId: number | null, fallback = 'Unknown') {
  for (const specs of Object.values(classSpecializations)) { const found = specs.find(spec => spec.id === specId); if (found) return found.name }
  return fallback
}
