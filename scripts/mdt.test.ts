import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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
    assert.deepEqual(enemies.get(134174), { npcId: 134174, displayId: 83371, stunnable: false, spells: [{ id: 269972, interrupt: true, tags: ['curse'] }, { id: 1294815, interrupt: false }] })
    assert.deepEqual(enemies.get(134157), { npcId: 134157, displayId: null, stunnable: true, spells: [{ id: 1294900, interrupt: false, tags: ['bleed'] }] })
  })
  it('leaves stuns unknown when the file lists no characteristics', () => {
    const newer = lua.replace(/ {4}\["characteristics"\] = \{\n[\s\S]*?\n {4}\},\n/g, '')
    assert.equal(parseMdtEnemies(newer).get(134174)?.stunnable, undefined)
  })
  it('reads nothing outside the enemies table', () => {
    assert.equal(parseMdtEnemies('MDT.dungeonTotalCount[1] = { normal = 1 }').size, 0)
  })
  it('finds a dungeon file from its Raider.IO slug', () => {
    assert.equal(mdtFileFor('kings-rest', ['AltarOfFangs.lua', 'KingsRest.lua']), 'KingsRest.lua')
    assert.equal(mdtFileFor('the-blinding-vale', ['TheBlindingVale.lua']), 'TheBlindingVale.lua')
    assert.equal(mdtFileFor('unknown', ['KingsRest.lua']), null)
  })
})
