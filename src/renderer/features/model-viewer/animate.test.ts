import { describe, expect, it } from 'vite-plus/test'
import { animationChoices, sample } from './animate'

describe('model animation', () => {
  const track = { global: -1, keys: [{ times: [0, 100], values: [0, 0, 0, 10, 20, 30] }, null] }

  it('interpolates keyframes, holds the ends, and leaves a missing animation at rest', () => {
    expect(sample(track, 0, 50, 0, [], 3)).toEqual([5, 10, 15])
    expect(sample(track, 0, 500, 0, [], 3)).toEqual([10, 20, 30])
    expect(sample(track, 1, 50, 0, [], 3)).toBeNull()
    expect(sample(null, 0, 50, 0, [], 3)).toBeNull()
  })

  it('plays global tracks on their own loop and turns rotations the short way', () => {
    const glow = { global: 0, keys: [{ times: [0, 1000], values: [0, 1] }] }
    expect(sample(glow, 3, 0, 2500, [2000], 1)![0]).toBeCloseTo(0.5)
    const turn = { global: -1, keys: [{ times: [0, 100], values: [0, 0, 0, 1, 0, 0, 0, -1] }] }
    // The same orientation written with the opposite sign stays put instead of spinning
    expect(sample(turn, 0, 50, 0, [], 4)).toEqual([0, 0, 0, 1])
  })

  it('offers each animation once, Stand first', () => {
    expect(animationChoices([{ animations: [{ id: 4, name: 'Walk', duration: 1 }, { id: 0, name: 'Stand', duration: 1 }] }, { animations: [{ id: 4, name: 'Walk', duration: 2 }] }]).map(entry => entry.name)).toEqual(['Stand', 'Walk'])
  })
})
