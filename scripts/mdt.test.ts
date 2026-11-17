import { describe, expect, it } from 'vite-plus/test'
import { mdtFileFor, parseMdtEnemies } from './mdt'

const lua = `local dungeonIndex = 17
MDT.dungeonTotalCount[dungeonIndex] = { normal = 608 }
MDT.dungeonEnemies[dungeonIndex] = {
  [3] = {
    ["name"] = "Risen Hexer",
    ["id"] = 134174,
    ["count"] = 20,
    ["displayId"] = 83371,
    ["characteristics"] = {
      ["Taunt"] = true,
    },
    ["spells"] = {
      [269972] = {
        ["interruptible"] = true,
        ["curse"] = true,
      },
      [1294815] = {
      },
    },
    ["clones"] = {
      [4] = {
        ["x"] = 706.6,
      },
    },
  },
  [4] = {
    ["name"] = "Umbral Warrior",
    ["id"] = 134157,
    ["characteristics"] = {
      ["Taunt"] = true,
      ["Stun"] = true,
    },
    ["spells"] = {
      [1294900] = {
        ["bleed"] = true,
      },
    },
  },
}
`

describe('Mythic Dungeon Tools data', () => {
  it('reads each enemy with its spells, flags, and stun immunity', () => {
    const enemies = parseMdtEnemies(lua)
    expect(enemies.get(134174)).toEqual({ npcId: 134174, displayId: 83371, stunnable: false, spells: [{ id: 269972, interrupt: true, tags: ['curse'] }, { id: 1294815, interrupt: false }] })
    expect(enemies.get(134157)).toEqual({ npcId: 134157, displayId: null, stunnable: true, spells: [{ id: 1294900, interrupt: false, tags: ['bleed'] }] })
  })
  it('reads nothing outside the enemies table', () => {
    expect(parseMdtEnemies('MDT.dungeonTotalCount[1] = { normal = 1 }').size).toBe(0)
  })
  it('finds a dungeon file from its Raider.IO slug', () => {
    expect(mdtFileFor('kings-rest', ['AltarOfFangs.lua', 'KingsRest.lua'])).toBe('KingsRest.lua')
    expect(mdtFileFor('the-blinding-vale', ['TheBlindingVale.lua'])).toBe('TheBlindingVale.lua')
    expect(mdtFileFor('unknown', ['KingsRest.lua'])).toBeNull()
  })
})
