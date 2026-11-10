import { describe, expect, it } from 'vite-plus/test'
import { splashBackground, splashHtml } from './splash-page'

const base = { logo: Buffer.from('logo'), variant: 'classic' as const, version: '0.1.1', reducedMotion: false }

describe('boot splash', () => {
  it('names the build and embeds the chosen logo without loading anything from outside', () => {
    const html = splashHtml(base)
    expect(html).toContain('Version 0.1.1')
    expect(html).toContain(`data:image/png;base64,${Buffer.from('logo').toString('base64')}`)
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/https?:\/\//)
  })
  it('reads a nightly build as its date', () => {
    expect(splashHtml({ ...base, version: '0.1.1-nightly.20261110.54' })).toContain('Nightly 2026-11-10')
  })
  it('stays still when reduced motion is on', () => {
    expect(splashHtml({ ...base, reducedMotion: true })).toContain('<body class="">')
    expect(splashHtml(base)).toContain('<body class="animated">')
  })
  it('changes edition line, colors, and base tone with the chosen icon', () => {
    const classic = splashHtml(base), halloween = splashHtml({ ...base, variant: 'halloween' })
    expect(classic).toContain('For World of Warcraft')
    expect(halloween).toContain('Hallow&#39;s End edition')
    expect(halloween).toContain('--tint: #f87101')
    expect(splashBackground('#f87101')).not.toBe(splashBackground('#30adf9'))
    expect(splashBackground('#000000')).toBe('#05060a')
  })
})
