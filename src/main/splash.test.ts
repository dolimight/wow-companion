import { describe, expect, it, vi } from 'vite-plus/test'
vi.mock('electron', () => ({ BrowserWindow: class {} }))
const { splashHtml } = await import('./splash')

const base = { logo: Buffer.from('logo'), color: '#30adf9', accent: '#74d3fc', version: '0.1.1', reducedMotion: false }

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
  it('stays still when reduced motion is on, and rejects colors that are not plain hex', () => {
    expect(splashHtml({ ...base, reducedMotion: true })).toContain('<body class="">')
    expect(splashHtml(base)).toContain('<body class="animated">')
    expect(splashHtml({ ...base, color: 'red;}</style><script>' })).not.toContain('</style><script>')
  })
})
