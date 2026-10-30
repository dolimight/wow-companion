import { app, type BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DatabaseClient } from './database'

type Step = { name: string; status: 'pass' | 'fail' | 'skip'; detail?: unknown }
export type DesktopAcceptanceReport = { startedAt: string; finishedAt?: string; passed: boolean; steps: Step[]; screenshots: string[]; consoleErrors: string[]; debugger?: { attached: boolean; pauses: Array<{ reason: string; functionName?: string; url?: string }>; exceptions: string[]; probe?: unknown }; gpu?: unknown }

/** Explicit --acceptance mode only, against a dedicated database supplied by main */
export async function runDesktopAcceptance({ window, db, service, outputDir }: {
  window: BrowserWindow
  db: DatabaseClient
  service: { changed(characterId?: string): Promise<void> }
  outputDir: string
}): Promise<DesktopAcceptanceReport> {
  await mkdir(outputDir, { recursive: true })
  const report: DesktopAcceptanceReport = { startedAt: new Date().toISOString(), passed: false, steps: [], screenshots: [], consoleErrors: [] }
  const contents = window.webContents
  let activeStep = 'startup'
  const debugRequested = process.env.WOW_COMPANION_DEBUG_ACCEPTANCE === '1'
  const onDebugMessage = (_event: Electron.Event, method: string, params: any) => {
    if (method === 'Debugger.paused') {
      report.debugger?.pauses.push({ reason: params.reason, functionName: params.callFrames?.[0]?.functionName, url: params.callFrames?.[0]?.url })
      if (params.reason === 'exception') report.debugger?.exceptions.push(params.data?.description ?? 'Paused on uncaught exception')
      void contents.debugger.sendCommand('Debugger.resume').catch((cause) => report.debugger?.exceptions.push(String(cause)))
    }
    if (method === 'Runtime.exceptionThrown') report.debugger?.exceptions.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'Uncaught renderer exception')
  }
  const onConsole = (details: Electron.Event<Electron.WebContentsConsoleMessageEventParams>) => { if (details.level === 'error') report.consoleErrors.push(`[${activeStep}] ${details.message}`) }
  contents.on('console-message', onConsole)
  const evaluate = <T = unknown>(expression: string): Promise<T> => contents.executeJavaScript(expression, true) as Promise<T>
  const assert = (condition: unknown, reason: string) => { if (!condition) throw new Error(reason) }
  const wait = async (expression: string, label: string, timeout = 12_000) => {
    const success = await evaluate<boolean>(`new Promise(resolve=>{const until=Date.now()+${timeout};const check=()=>{try{if(${expression})return resolve(true)}catch{}if(Date.now()>until)return resolve(false);setTimeout(check,50)};check()})`)
    assert(success, `Timed out: ${label}`)
  }
  const click = async (label: string, selector = 'button,a') => {
    const result = await evaluate<boolean>(`(()=>{const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getAttribute('aria-label')===${JSON.stringify(label)}||node.textContent.trim()===${JSON.stringify(label)});if(!node||node.disabled)return false;node.click();return true})()`)
    assert(result, `Clickable control missing: ${label}`)
  }
  const choose = async (label: string, option: string) => {
    await click(label)
    await wait(`!!document.querySelector('[role="option"]')`, `${label} options`)
    await click(option, '[role="option"]')
    await wait(`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})?.getAttribute('aria-expanded')!=='true'`, `${label} selection`)
  }
  const field = async (label: string, value: string) => {
    const result = await evaluate<boolean>(`(()=>{const group=[...document.querySelectorAll('label.field')].find(node=>node.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)});const node=group?.querySelector('input,textarea');if(!node)return false;const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    assert(result, `Editable field missing: ${label}`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  }
  const capture = async (name: string) => {
    await evaluate(`document.querySelector('.workspace-scroll')?.scrollTo(0,0);document.querySelector('.page-content')?.scrollTo(0,0);document.querySelector('main')?.scrollTo(0,0)`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const target = path.join(outputDir, `${name}.png`)
    let paintedFrame:Electron.NativeImage|undefined
    // Hidden offscreen windows provide complete frames through paint; capturePage can
    // race the first compositor surface in a freshly packaged executable
    if (contents.isOffscreen()) await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { contents.removeListener('paint', painted); reject(new Error('No offscreen compositor frame arrived')) }, 5_000)
      const painted = (_event: Electron.Event<Electron.WebContentsPaintEventParams>, _dirty: Electron.Rectangle, image: Electron.NativeImage) => {
        if (image.isEmpty()) return
        paintedFrame=image
        clearTimeout(timeout)
        contents.removeListener('paint', painted)
        resolve()
      }
      contents.on('paint', painted)
      contents.invalidate()
    })
    // The paint event primes the first compositor surface; capturePage reads the
    // current frame rather than an older queued paint notification
    let frame:Electron.NativeImage
    try{frame=await contents.capturePage()}catch(error){if(!paintedFrame)throw error;frame=paintedFrame}
    await writeFile(target, frame.toPNG())
    report.screenshots.push(target)
    return target
  }
  const step = async (name: string, operation: () => Promise<unknown>) => {
    activeStep = name
    try { const detail = await operation(); report.steps.push({ name, status: 'pass', ...(detail === undefined ? {} : { detail }) }); return true }
    catch (cause) { report.steps.push({ name, status: 'fail', detail: cause instanceof Error ? cause.message : String(cause) }); await capture(`failure-${report.steps.length}`).catch(() => undefined); return false }
  }
  const waitDb = async (condition: () => Promise<boolean>, label: string) => {
    const end = Date.now() + 10_000
    while (Date.now() < end) { if (await condition()) return; await new Promise((resolve) => setTimeout(resolve, 75)) }
    throw new Error(`Persisted state not observed: ${label}`)
  }
  const nav = async (label: string, heading: string) => { await click(label, '.navigation a'); await wait(`document.querySelector('h1')?.textContent===${JSON.stringify(heading)}`, heading) }
  // Click the whole switcher choice: strong clicks bubble through the real React handler
  const switchCharacter = async (name: string) => {
    await click('Switch character')
    await wait(`document.querySelector('.character-popover')`, 'character switcher')
    const chosen = await evaluate<boolean>(`(()=>{const node=[...document.querySelectorAll('.switcher-choice')].find(node=>node.querySelector('.identity strong')?.firstChild?.textContent===${JSON.stringify(name)});if(!node)return false;node.click();return true})()`)
    assert(chosen, `Switcher character missing: ${name}`)
    await wait(`document.querySelector('.switcher strong')?.textContent===${JSON.stringify(name)}`, `selected ${name}`)
  }

  try {
    if (debugRequested) {
      const attached = await step('Renderer debugger attaches and resumes an actual JavaScript pause', async () => {
        report.debugger = { attached: false, pauses: [], exceptions: [] }
        contents.debugger.attach('1.3')
        report.debugger.attached = true
        contents.debugger.on('message', onDebugMessage)
        await contents.debugger.sendCommand('Debugger.enable')
        await contents.debugger.sendCommand('Runtime.enable')
        await contents.debugger.sendCommand('Debugger.setPauseOnExceptions', { state: 'uncaught' })
        const result = await contents.debugger.sendCommand('Runtime.evaluate', { expression: '(function companionRendererDebugProbe(){debugger;return {url:location.href,nodeUnavailable:typeof require==="undefined",resumed:true}})()', returnByValue: true })
        assert(!result.exceptionDetails && result.result?.value?.resumed, 'Renderer debugger did not resume its probe')
        assert(report.debugger.pauses.some((entry) => entry.functionName === 'companionRendererDebugProbe'), 'Renderer debugger did not observe the JavaScript pause')
        report.debugger.probe = result.result.value
        return report.debugger.probe
      })
      if (!attached) return report
    }
    // An offscreen window has no OS focus even when activeElement changes
    // Enable Chromium's focus emulation so focusin and keyboard behavior are real
    if (contents.isOffscreen()) {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
      await contents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
      assert(await evaluate('document.hasFocus()'), 'Offscreen focus emulation did not activate')
    }
    const emptyWorkspace = await step('Empty local workspace is usable', async () => {
      assert((await db.call('listCharacters')).length === 0, 'Acceptance requires an empty dedicated database')
      await wait(`document.body.innerText.includes('Bring your characters together')`, 'empty state')
      await capture('empty-state')
      return { activeCharacters: 0 }
    })
    if (!emptyWorkspace) return report
    await step('Settings page preserves custom dropdown and toggle preferences with a pure-black theme', async () => {
      await click('Open settings')
      await wait(`location.hash.includes('/settings')&&document.querySelector('h1')?.textContent==='Settings'`, 'dedicated settings route')
      assert(await evaluate(`!document.querySelector('[role="dialog"]')`), 'Settings still opens in a dialog')
      await choose('Appearance', 'Dark')
      await waitDb(async () => (await db.call('getSettings')).theme === 'dark', 'saved dark appearance')
      await wait(`getComputedStyle(document.documentElement).backgroundColor==='rgb(0, 0, 0)'`, 'pure-black ground')
      await wait(`document.querySelector('.brand-logo')?.complete&&document.querySelector('.brand-logo')?.naturalWidth>0`, 'generated logo asset')
      assert(await evaluate(`document.title==='WOW Companion'&&document.querySelector('.brand-name')?.textContent==='WOW Companion'`), 'App name mismatch')
      assert(await evaluate(`!document.querySelector('[aria-label="Window frame"]')`), 'Window frame should not be configurable')
      await click('Reduce motion')
      await waitDb(async () => (await db.call('getSettings')).reducedMotion === true, 'shadcn motion toggle')
      await window.loadURL(contents.getURL())
      await wait(`location.hash.includes('/settings')&&document.querySelector('[aria-label="Appearance"]')?.dataset.value==='dark'&&document.querySelector('[aria-label="Reduce motion"]')?.getAttribute('aria-pressed')==='true'`, 'custom settings controls after reload')
      assert(await evaluate(`!document.querySelector('select,input[type="checkbox"]')`), 'Native selection controls remain in the settings UI')
      await click('Reduce motion')
      await waitDb(async () => (await db.call('getSettings')).reducedMotion === false, 'motion toggle off')
      await capture('settings-black')
      await click('Appearance')
      await wait(`document.querySelectorAll('[role="option"]').length===3`, 'custom theme popup')
      await capture('settings-dropdown-black')
      await click('Dark', '[role="option"]')
      await click('Characters', '.navigation a')
      await wait(`document.body.innerText.includes('Bring your characters together')`, 'return to empty roster')
      return { savedTheme: (await db.call('getSettings')).theme, page: '/settings', background: 'rgb(0, 0, 0)' }
    })
    await step('Shadcn sidebar drag and keyboard resizing persist across a renderer reload', async () => {
      await wait(`!!document.querySelector('[data-slot="resizable-handle"][aria-label="Resize sidebar"]')`, 'shadcn resize handle')
      const before = await evaluate<number>(`document.querySelector('.sidebar').getBoundingClientRect().width`)
      const point = await evaluate<{ x: number; y: number }>(`(()=>{const r=document.querySelector('[aria-label="Resize sidebar"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+140)}})()`)
      contents.sendInputEvent({ type: 'mouseMove', ...point })
      contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      contents.sendInputEvent({ type: 'mouseMove', x: point.x + 48, y: point.y, modifiers: ['leftbuttondown'] })
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: point.x + 48, y: point.y })
      await waitDb(async () => (await db.call('getSettings')).sidebarWidth > before + 20, 'dragged sidebar width')
      await evaluate(`document.querySelector('[aria-label="Resize sidebar"]').focus()`)
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'Left' })
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'Left' })
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      const keyboardWidth = await evaluate<number>(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)`)
      await waitDb(async () => Math.abs((await db.call('getSettings')).sidebarWidth - keyboardWidth) < 2, 'keyboard sidebar width')
      const saved = (await db.call('getSettings')).sidebarWidth
      await window.loadURL(contents.getURL())
      await wait(`Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width-${saved})<2`, 'sidebar width after reload')
      await capture('sidebar-resized-black')
      await click('Open settings')
      await wait(`document.querySelector('h1')?.textContent==='Settings'`, 'sidebar reset settings')
      await click('Reset width')
      await waitDb(async () => (await db.call('getSettings')).sidebarWidth === 240, 'reset sidebar width')
      await click('Characters', '.navigation a')
      return { before, saved, library: 'shadcn Base UI Resizable / react-resizable-panels' }
    })
    await step('Integrated title bar uses native platform controls and the window still maximizes/restores', async () => {
      const state = await evaluate<{ platform: string; frame: string; controls: string }>(`window.companion.windowState()`)
      if (state.frame !== 'custom') throw new Error('Custom frame was not created')
      await wait(`document.documentElement.dataset.titleBar==='integrated'`, 'integrated application title bar')
      const titleBar = await evaluate<{ isToolbar: boolean; hasBreadcrumbs: boolean; hasImport: boolean; separateStrip: boolean; top: number; drag: string }>(`(()=>{const bar=document.querySelector('[aria-label="Application title bar"]');const style=bar&&getComputedStyle(bar);return {isToolbar:!!bar?.classList.contains('toolbar'),hasBreadcrumbs:!!bar?.querySelector('.breadcrumbs'),hasImport:[...(bar?.querySelectorAll('button')??[])].some(b=>b.textContent?.includes('Search items')),separateStrip:!!document.querySelector('.window-chrome'),top:bar?.getBoundingClientRect().top??-1,drag:style?.getPropertyValue('app-region')||style?.getPropertyValue('-webkit-app-region')||''}})()`)
      assert(titleBar.isToolbar && titleBar.hasBreadcrumbs && titleBar.hasImport, 'Breadcrumbs and item search are not inside the title bar')
      assert(!titleBar.separateStrip, 'A separate title bar strip is still rendered above the toolbar')
      assert(titleBar.top === 0 && titleBar.drag === 'drag', 'Title bar toolbar is not a top drag region')
      if (state.platform === 'darwin') {
        assert(await evaluate(`!document.querySelector('[aria-label="Window controls"]')`), 'macOS should retain native traffic lights')
        assert(state.controls === 'native-traffic-lights', 'macOS traffic lights were not configured')
        return { platform: state.platform, nativeTrafficLightsConfigured: true }
      }
      assert(state.controls === 'native-overlay', 'Native controls overlay was not configured')
      assert(await evaluate(`!document.querySelector('.window-chrome-controls button')`), 'Drawn Windows buttons remain')
      const overlay = await evaluate<{ visible: boolean; controlsClear: boolean } | null>(`(()=>{const o=navigator.windowControlsOverlay;if(!o)return null;const area=o.getTitlebarAreaRect();const button=[...document.querySelectorAll('[aria-label="Application title bar"] button')].find(b=>b.textContent?.includes('Search items'));const rect=button?.getBoundingClientRect();return {visible:o.visible,controlsClear:!!rect&&rect.right<=area.x+area.width}})()`)
      assert(!overlay?.visible || overlay.controlsClear, 'Item search sits under the native window controls')
      await evaluate(`window.companion.toggleMaximizeWindow()`)
      await wait(`window.companion.windowState().then(state=>state.maximized)`, 'maximized native window state')
      assert(window.isMaximized(), 'Electron window did not maximize')
      await evaluate(`window.companion.toggleMaximizeWindow()`)
      assert(!window.isMaximized(), 'Electron window did not restore')
      return { platform: state.platform, controls: state.controls, overlay, actualMaximizeRestore: true, nativeButtonClicksAutomated: false, macRuntimeTested: false }
    })
    const seeded = await step('Roster overview contains four isolated fictional characters', async () => {
      await db.call('seedDemo')
      await db.call('addCharacter', { id: 'acceptance-cinder', name: 'Cinder', region: 'us', realm: 'Acceptance Realm', className: 'Warlock', demo: true })
      await service.changed()
      await window.loadURL(contents.getURL().split('#')[0] + '#/characters')
      await wait(`document.querySelectorAll('tr[aria-label^="Select "]').length===4`, 'four roster rows')
      await capture('roster')
      return { count: (await db.call('listCharacters')).length }
    })
    if (seeded) {
      await step('Loaded avatars and unknown metrics remain inside their frames at supported desktop widths', async () => {
        const originalSize = window.getContentSize()
        try {
          await evaluate(`(async()=>{for(const avatar of document.querySelectorAll('.avatar')){const image=new Image();image.src=document.querySelector('.brand-logo').src;await image.decode();avatar.replaceChildren(image)}const values=document.querySelectorAll('.selected-pane .metric-strip strong');values.forEach((node,index)=>{node.textContent=index===0?'87.0':'Unknown';node.dataset.unknown=index===0?'false':'true'})})()`)
          const layouts = []
          for (const width of [1460, 1100, 820]) {
            window.setContentSize(width, 900)
            await wait(`innerWidth===${width}`, 'overflow regression viewport')
            await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            const geometry = await evaluate<{ imagesFit: boolean; metricsFit: boolean }>(`(()=>{const within=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;return {imagesFit:[...document.querySelectorAll('.avatar img')].every(image=>within(image.getBoundingClientRect(),image.parentElement.getBoundingClientRect())),metricsFit:[...document.querySelectorAll('.selected-pane .metric-strip strong')].every(node=>within(node.getBoundingClientRect(),node.parentElement.getBoundingClientRect()))}})()`)
            assert(geometry.imagesFit, `Avatar image overflows at ${width}px`)
            assert(geometry.metricsFit, `Selected metrics overflow at ${width}px`)
            layouts.push({ width, ...geometry })
            await capture(`roster-overflow-${width}`)
          }
          return layouts
        } finally { window.setContentSize(originalSize[0], originalSize[1]) }
      })
      await step('Roster selection updates the selected character pane', async () => {
        await click('Select Serath', 'tr')
        await wait(`document.querySelector('.selected-pane h2')?.textContent==='Serath'`, 'selected alt pane')
        await click('Open character', '.selected-pane a')
        await wait(`location.hash.includes('/demo-serath/overview')`, 'alt character route')
      })
      await step('Gear draft edits travel through the UI and persist in SQLite', async () => {
        await nav('Gear planner', 'Gear planner')
        await wait(`document.querySelector('.gear-inspector input')?.value==='Illustrative headpiece'`, 'gear hydration')
        await field('Plan name', 'Acceptance Serath plan')
        await field('Planned item name', 'Acceptance local headpiece')
        await field('Planned item level', '275')
        await field('Enchant', 'Acceptance enchant')
        await field('Gems', 'Acceptance gem')
        await click('Update draft slot')
        await click('Save changes')
        await waitDb(async () => (await db.call('getGearDraft', { characterId: 'demo-serath', specId: 66, activity: 'mythicPlus' }))?.items.some((item) => item.slot === 'head' && item.itemLevel === 275 && item.name === 'Acceptance local headpiece') ?? false, 'Serath gear draft')
        await capture('gear-planner')
        return await db.call('getGearDraft', { characterId: 'demo-serath', specId: 66, activity: 'mythicPlus' })
      })
      await step('Switching characters keeps gear drafts isolated', async () => {
        await switchCharacter('Vaelith')
        await wait(`location.hash.includes('/demo-vaelith/gear')`, 'main gear route')
        await wait(`document.querySelector('.gear-inspector input')?.value==='Illustrative headpiece'`, 'main gear hydration')
        const name = await evaluate<string>(`[...document.querySelectorAll('label.field')].find(node=>node.querySelector(':scope > span')?.textContent==='Plan name')?.querySelector('input')?.value`)
        assert(name !== 'Acceptance Serath plan', 'Alt draft leaked into main')
        assert((await db.call('getGearDraft', { characterId: 'demo-vaelith', specId: 64, activity: 'mythicPlus' })) === null, 'Main unexpectedly acquired alt plan')
        await switchCharacter('Serath')
        await wait(`document.body.innerText.includes('Acceptance local headpiece')`, 'alt saved plan restored')
      })
      await step('Favorite toggle persists through the real roster control', async () => {
        await nav('Characters', 'Your characters')
        await click('Favorite Mosswind')
        await waitDb(async () => (await db.call('getCharacter', 'demo-mosswind'))?.favorite === true, 'favorite Mosswind')
      })
      await step('Archive and restore preserve the character and its saved plan', async () => {
        await click('Manage roster')
        await wait(`document.querySelector('[role="dialog"]')`, 'manage sheet')
        await click('Archive Serath')
        await waitDb(async () => (await db.call('getCharacter', 'demo-serath'))?.archived === true, 'archived alt')
        await wait(`!!document.querySelector('[aria-label="Restore Serath"]')`, 'restore control')
        await click('Restore Serath')
        await waitDb(async () => (await db.call('getCharacter', 'demo-serath'))?.archived === false, 'restored alt')
        await click('Close panel')
        assert((await db.call('getGearDraft', { characterId: 'demo-serath', specId: 66, activity: 'mythicPlus' }))?.name === 'Acceptance Serath plan', 'Archive lost the saved plan')
      })
      await step('Pasted addon snapshot imports through the UI', async () => {
        await wait(`!!document.querySelector('button.sync-button')`, 'sync details control')
        await evaluate(`document.querySelector('button.sync-button').click()`)
        await click('Import from a file instead')
        await wait(`document.querySelector('textarea')`, 'import editor')
        const now = new Date().toISOString()
        const payload = { schemaVersion: 1, addonVersion: 'acceptance', sourceProfileId: 'acceptance-profile', exportedAt: now, characters: { 'Player-acceptance-import': { guid: 'Player-acceptance-import', region: 'us', realm: 'Acceptance Realm', name: 'Accepta', className: 'Mage', raceName: 'Human', level: 90, observedAt: now, sessionId: 'acceptance-session', sequence: 1, itemLevel: 250, gear: [], gameBuild: 'acceptance-fixture' } } }
        await field('Or paste an export', JSON.stringify(payload))
        await click('Import pasted export')
        await wait(`document.body.innerText.includes('Import complete')`, 'import result')
        const imported = (await db.call('listCharacters')).find((character) => character.name === 'Accepta')
        assert(imported?.sourceRefs.some((ref) => ref.provider === 'addon'), 'Addon character not persisted')
        await click('Close panel')
        return { importedCharacterId: imported?.id }
      })
      await step('Gear planner searches items by name for the selected slot', async () => {
        await switchCharacter('Serath')
        await nav('Gear planner', 'Gear planner')
        await click('Search items for this slot')
        await wait(`!!document.querySelector('.item-search-dialog')`, 'slot item search')
        await wait(`document.querySelector('[aria-label="Search items"]')`, 'search field')
        assert(await evaluate(`document.querySelector('.item-search-context')?.textContent.includes('For Serath')&&document.querySelector('.item-search-context')?.textContent.includes('Protection')&&document.querySelector('.item-search-context')?.textContent.includes('Paladin')&&!document.querySelector('[aria-label="Wearable by Serath"]')`), 'Slot search is not scoped to the selected character and spec')
        await capture('gear-item-search')
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await wait(`!document.querySelector('.item-search-dialog')`, 'slot search closed')
        await click('Search items')
        await wait(`!!document.querySelector('.item-search-dialog')`, 'global item search')
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await wait(`!document.querySelector('.item-search-dialog')`, 'global search closed')
        await switchCharacter('Vaelith')
        await click('Search items')
        await wait(`document.querySelector('.item-search-context')?.textContent.includes('For Vaelith')&&document.querySelector('.item-search-context')?.textContent.includes('Frost')&&document.querySelector('.item-search-context')?.textContent.includes('Mage')&&!document.querySelector('.item-search-context')?.textContent.includes('Serath')`, 'search context follows alt selection')
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await wait(`!document.querySelector('.item-search-dialog')`, 'alt search closed')
        await switchCharacter('Serath')
      })
      await step('External-HTTP-denied renderer reopen restores the saved gear plan', async () => {
        contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { const hostname = new URL(details.url).hostname; callback({ cancel: !['127.0.0.1', 'localhost', '[::1]'].includes(hostname) }) })
        await nav('Gear planner', 'Gear planner')
        const url = contents.getURL()
        await window.loadURL(url)
        await wait(`document.body.innerText.includes('Acceptance local headpiece')`, 'saved gear after offline reload')
        const draft = await db.call('getGearDraft', { characterId: 'demo-serath', specId: 66, activity: 'mythicPlus' })
        assert(draft?.name === 'Acceptance Serath plan', 'Reload lost saved draft')
        await capture('gear-after-reopen')
        return { externalHttpBlocked: true, localLoopbackPreserved: true, note: 'Renderer reload with external HTTP denied, not a full machine network outage or database process restart' }
      })
      await step('Light appearance and minimum desktop width preserve usable layout', async () => {
        const settings = await db.call('getSettings')
        const originalSize = window.getContentSize()
        try {
          await db.call('setSettings', { theme: 'light' })
          await service.changed()
          await wait(`document.documentElement.dataset.theme==='light'`, 'light appearance')
          await nav('Characters', 'Your characters')
          await capture('roster-light')
          window.setContentSize(820, 760)
          await wait(`innerWidth===820`, 'minimum supported desktop width')
          await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
          const layout = await evaluate<{ viewport: number; page: number; heading: string }>(`({viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent})`)
          assert(layout.page <= layout.viewport + 1, 'The page overflows the minimum desktop width')
          await capture('roster-minimum-light')
          window.setContentSize(originalSize[0], originalSize[1])
          await nav('Gear planner', 'Gear planner')
          await wait(`!!document.querySelector('[aria-label="Search items for this slot"]')`, 'light gear search')
          await capture('gear-search-light')
          return layout
        } finally {
          window.setContentSize(originalSize[0], originalSize[1])
          await db.call('setSettings', { theme: settings.theme })
          await service.changed()
        }
      })
    }
    await step('Unknown specialization IDs show a useful comparison state without submitting an invalid top-player request', async () => {
      const fixture = await db.call('addCharacter', {name:'Unknown spec fixture',region:'us',realm:'Acceptance Realm',className:'Death Knight',specName:'Blood',specId:0})
      await service.changed()
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${fixture.id}/top`)
      await wait(`document.body.innerText.includes('Refresh this character first so its class and specialization are known')`, 'unknown specialization comparison state')
      assert((await db.call('getCharacter',fixture.id))?.specId===null, 'Zero specialization was not normalized')
      assert(await evaluate(`!document.querySelector('[role="alert"]')&&!document.body.innerText.includes('Too small')&&!document.body.innerText.includes('Collecting the top')`), 'Unknown specialization submitted an invalid comparison query')
      await capture('top-players-unknown-spec')
      await db.call('deleteCharacter',fixture.id)
      await service.changed()
      return {unknownSpecNormalized:true,comparisonRequestBlocked:true,recoveryCopy:true}
    })
    await step('Item inspection opens on hover and keyboard focus without consuming the gear row action', async () => {
      // Dedicated fictional input in the acceptance database, never the user's roster
      const portraitPixels = await evaluate<string>(`(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#4488cc';ctx.fillRect(40,20,20,60);return canvas.toDataURL('image/png').split(',')[1]})()`)
      const rendersDir = path.join(path.dirname(outputDir), 'renders')
      await mkdir(rendersDir, { recursive: true })
      await writeFile(path.join(rendersDir, 'portrait-fixture.png'), Buffer.from(portraitPixels, 'base64'))
      const fixture = await db.call('addCharacter', { name: 'Tooltip fixture', region: 'us', realm: 'Acceptance Realm', className: 'Mage', demo: true, renders: { main: 'wow-asset://renders/portrait-fixture.png' }, gear: [{ slot: 'head', name: 'Recorded tooltip headpiece', itemLevel: 275, stats: [{ text: '+123 Intellect', secondary: false }, { text: '+80 Haste', secondary: true }], effects: ['Equip: Recorded fixture effect'], enchant: 'Recorded enchant', gems: ['Recorded gem'] }] })
      await service.changed()
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${fixture.id}/gear`)
      await wait(`document.querySelector('.gear-item')?.textContent.includes('Recorded tooltip headpiece')`, 'tooltip gear hydration')
      await wait(`document.querySelector('.switcher .avatar img')?.src.startsWith('data:image/png')`, 'transparent portrait from the local render protocol')
      assert(await evaluate(`(()=>{const avatar=document.querySelector('.switcher .avatar');const image=avatar.querySelector('img');const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,128,128);const pixels=ctx.getImageData(0,0,128,128).data;return getComputedStyle(avatar).backgroundColor==='rgba(0, 0, 0, 0)'&&pixels[3]===0&&pixels[(64*128+64)*4+3]>0})()`), 'Avatar lost its transparent background or visible subject')
      const point = await evaluate<{ x: number; y: number }>(`(()=>{const r=document.querySelector('.gear-item').getBoundingClientRect();return {x:Math.round(r.x+30),y:Math.round(r.y+r.height/2)}})()`)
      contents.sendInputEvent({ type: 'mouseMove', ...point })
      await wait(`document.querySelector('.item-hover-card')?.textContent.includes('+123 Intellect')`, 'hover stats')
      const copy = await evaluate<string>(`document.querySelector('.item-hover-card').textContent`)
      assert(copy.includes('Recorded equipped stats') && copy.includes('Item level 275') && copy.includes('Recorded gem') && copy.includes('Recorded enchant'), 'Recorded tooltip details missing')
      assert(!copy.includes('Base item stats'), 'Equipped stats incorrectly labelled as base stats')
      await capture('item-hover-recorded-dark')
      contents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
      await evaluate(`document.querySelector('.gear-item').focus()`)
      await wait(`!!document.querySelector('.item-hover-card')`, 'keyboard item inspection')
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await wait(`!document.querySelector('.item-hover-card')`, 'Escape dismisses item inspection')
      await evaluate(`document.querySelectorAll('.planner-table tbody tr')[1].click()`)
      await wait(`document.querySelector('.gear-inspector h3')?.textContent==='Neck'`, 'gear row click still selects slot')
      await click('Search items for this slot')
      await wait(`!!document.querySelector('.item-search-dialog')`, 'tooltip fixture item search')
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      return { hover: true, keyboard: true, escape: true, rowAction: true, observedStats: true, itemSearch: true }
    })
    await step('Gear planner compares current and planned items and dims only equipped targets while keeping them editable', async () => {
      await wait(`!document.querySelector('.item-search-dialog')`, 'item search closed before planner comparison')
      const fixture=await db.call('addCharacter',{name:'Planner comparison fixture',region:'us',realm:'Acceptance Realm',specId:64,gear:[{slot:'head',itemId:101,name:'Current helm',itemLevel:275},{slot:'neck',itemId:102,name:'Matched neck',itemLevel:275},{slot:'shoulder',itemId:103,name:'Manual shoulders',itemLevel:275}]})
      await db.call('saveGearDraft',{id:'comparison-draft',characterId:fixture.id,specId:64,activity:'mythicPlus',rulesetId:'unknown',name:'Comparison plan',items:[{slot:'head',itemId:201,name:'Planned helm',itemLevel:300,gems:[],enchant:null,gemsCoverage:'unknown',enchantCoverage:'unknown',appearanceId:null,itemLink:null,stats:[],effects:[]},{slot:'neck',itemId:102,name:'Matched neck',itemLevel:300,gems:[],enchant:null,gemsCoverage:'unknown',enchantCoverage:'unknown',appearanceId:null,itemLink:'item:102',stats:[],effects:[]},{slot:'shoulder',itemId:null,name:'Manual shoulders',itemLevel:300,gems:[],enchant:null,gemsCoverage:'unknown',enchantCoverage:'unknown',appearanceId:null,itemLink:null,stats:[],effects:[]}],updatedAt:new Date().toISOString()})
      await service.changed()
      await window.loadURL(contents.getURL().split('#')[0]+`#/characters/${fixture.id}/gear`)
      await wait(`document.querySelector('.planner-table')?.textContent.includes('Planned helm')`, 'saved comparison draft')
      contents.sendInputEvent({type:'mouseMove',x:1,y:1})
      assert(await evaluate(`(()=>{const table=document.querySelector('.planner-table');const rows=table.querySelectorAll('tbody tr');return table.querySelector('thead').textContent.includes('Current gear')&&table.querySelector('thead').textContent.includes('Planned gear')&&rows[0].cells[1].textContent.includes('Current helm')&&rows[0].cells[2].textContent.includes('Planned helm')&&!rows[0].dataset.targetEquipped&&rows[1].dataset.targetEquipped==='true'&&!rows[2].dataset.targetEquipped&&rows[1].cells[1].textContent.includes('275')&&rows[1].cells[2].textContent.includes('300')&&Number(getComputedStyle(rows[1].querySelector('.game-icon')).opacity)<1})()`), 'Current/planned columns or matched-item dimming are incorrect')
      await capture('planner-current-planned-dark')
      await evaluate(`document.querySelectorAll('.planner-table tbody tr')[1].focus()`)
      contents.sendInputEvent({type:'keyDown',keyCode:'Enter'})
      contents.sendInputEvent({type:'keyUp',keyCode:'Enter'})
      await wait(`document.querySelector('.gear-inspector h3')?.textContent==='Neck'&&document.querySelector('.gear-inspector input')?.value==='Matched neck'`, 'dimmed target keyboard selection')
      assert(await evaluate(`getComputedStyle(document.querySelectorAll('.planner-table tbody tr')[1].querySelector('.game-icon')).opacity==='1'`), 'Focused target remains dimmed')
      await field('Planned item name','Manual neck target')
      await click('Update draft slot')
      await wait(`!document.querySelectorAll('.planner-table tbody tr')[1].dataset.targetEquipped`, 'manual target clears stale item identity')
      await click('Save changes')
      await waitDb(async()=>{const draft=await db.call('getGearDraft',{characterId:fixture.id,specId:64,activity:'mythicPlus'});return draft?.items.some(item=>item.slot==='neck'&&item.name==='Manual neck target'&&item.itemId===null&&item.itemLink===null)??false}, 'manual target saved without old identity')
      const originalSize=window.getContentSize()
      const settings=await db.call('getSettings')
      try {
        await db.call('setSettings',{theme:'light'});await service.changed()
        window.setContentSize(820,760)
        await wait(`innerWidth===820&&document.documentElement.dataset.theme==='light'`, 'minimum-width light planner')
        assert(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`), 'Planner overflows the minimum desktop width')
        await capture('planner-current-planned-light-minimum')
      } finally {window.setContentSize(originalSize[0],originalSize[1]);await db.call('setSettings',{theme:settings.theme});await service.changed()}
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.planner-table')?.textContent.includes('Manual neck target')&&!document.querySelectorAll('.planner-table tbody tr')[1].dataset.targetEquipped`, 'comparison state persists after reload')
      await nav('Characters','Your characters')
      return {currentAndPlanned:true,matchedTargetDimmed:true,missingIdsNotMatched:true,levelsPreserved:true,keyboardEditable:true,manualIdentityCleared:true,minimumWidthLight:true,persisted:true}
    })
    let progressionId = ''
    let progressionAltId = ''
    const progressionViews = await step('Progression exposes five scoped views and explains unsupported seasonal ceilings without inventing a maximum', async () => {
      // Fictional records in the acceptance database only, never the player's roster
      const observedAt = new Date().toISOString()
      const fixture = await db.call('addCharacter', { name: 'Progression fixture', region: 'us', realm: 'Acceptance Realm', className: 'Mage', specName: 'Arcane', specId: 62, level: 90, itemLevel: 275, observedAt, gearObservedAt: observedAt, gameBuild: 'acceptance-unsupported', gear: [{ slot: 'head', itemId: 901, name: 'Recorded progression helm', itemLevel: 275 }] })
      const alt = await db.call('addCharacter', { name: 'Progression alt', region: 'us', realm: 'Acceptance Realm', className: 'Mage', specName: 'Frost', specId: 64, level: 90 })
      progressionId = fixture.id
      progressionAltId = alt.id
      await service.changed()
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${fixture.id}/overview`)
      await wait(`document.querySelector('h1')?.textContent==='Progression fixture'`, 'progression fixture overview')
      await nav('Progression', 'Gear progression')
      await wait(`document.querySelector('.progression-table')?.textContent.includes('Recorded progression helm')`, 'recorded per-slot gear')
      const labels = ['Equipped gear', 'Upgrade gear you own', 'Your content ceiling', 'Season legal maximum', 'Affordable now']
      for (const label of labels) {
        await choose('Progression view', label)
        await wait(`document.querySelector('.progression-result-heading h2')?.textContent===${JSON.stringify(label)}`, `progression view ${label}`)
      }
      await choose('Progression view', 'Season legal maximum')
      assert(await evaluate(`document.querySelector('.progression-result-value > strong')?.textContent==='Unknown'&&document.querySelector('.progression-result-value .badge')?.textContent==='Unavailable'&&!!document.querySelector('.progression-notice')`), 'Unsupported build displayed a verified numeric maximum')
      await click('Explain head progression')
      await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('Why this head result?')&&document.querySelector('[role="dialog"]')?.textContent.includes('Recorded progression helm')`, 'head progression evidence sheet')
      assert(await evaluate(`document.querySelector('[role="dialog"]')?.textContent.includes('No validated ruleset')`), 'Missing seasonal evidence is not explained')
      await capture('progression-head-explanation')
      await click('Close panel')
      await wait(`!document.querySelector('[role="dialog"]')`, 'progression explanation closed')
      await capture('progression-unsupported-dark')
      const originalSize = window.getContentSize()
      try {
        window.setContentSize(820, 760)
        await wait(`innerWidth===820`, 'minimum-width progression')
        assert(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`), 'Progression overflows the minimum desktop width')
        await capture('progression-minimum-width')
      } finally { window.setContentSize(originalSize[0], originalSize[1]) }
      return { characterId: fixture.id, scopedViews: labels, unsupportedMaximumUnknown: true, recordedGearVisible: true, headExplanation: true, minimumWidth: true }
    })
    await step('Progression content preferences persist by character and activity while personal goals preserve observed gear', async () => {
      assert(progressionViews, 'Progression view coverage must pass before editing preferences')
      const before = await db.call('getCharacter', progressionId)
      assert(before, 'Progression fixture was not saved')
      await wait(`!document.querySelector('.progression-settings button[aria-label="Allow crafted gear"]').disabled`, 'progression preferences loaded')
      await click('Allow crafted gear')
      await click('Include Raiding')
      await click('Include Heroic difficulty')
      await click('Exclude Vendors')
      await click('Save content preferences')
      await waitDb(async () => {
        const preferences = await db.call('getContentPreferences', progressionId, 'mythicPlus')
        return !preferences.allowCrafting && preferences.activities.includes('mythicPlus') && preferences.activities.includes('raiding') && preferences.difficulties.includes('heroic') && preferences.excludedMethods.includes('vendor')
      }, 'scoped progression content preferences')
      await field('Target item level', '301.5')
      await click('Save target')
      await waitDb(async () => (await db.call('getCharacter', progressionId))?.targetItemLevel === 301.5, 'personal progression target')
      const after = await db.call('getCharacter', progressionId)
      assert(JSON.stringify(after?.gear) === JSON.stringify(before!.gear) && after?.gearObservedAt === before!.gearObservedAt && after?.itemLevel === before!.itemLevel, 'Saving preferences or a personal target changed observed gear')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('[aria-label="Allow crafted gear"]')?.getAttribute('aria-pressed')==='false'&&document.querySelector('[aria-label="Include Heroic difficulty"]')?.getAttribute('aria-pressed')==='true'&&document.querySelector('[aria-label="Exclude Vendors"]')?.getAttribute('aria-pressed')==='true'`, 'saved progression preferences after reload')
      assert(await evaluate(`document.querySelector('input[placeholder="No target set"]')?.value==='301.5'`), 'Personal progression target did not survive reload')
      await choose('Progression activity', 'Raiding')
      await wait(`document.querySelector('[aria-label="Progression activity"]')?.getAttribute('data-value')==='raiding'&&document.querySelector('[aria-label="Allow crafted gear"]')?.getAttribute('aria-pressed')==='true'&&document.querySelector('[aria-label="Include Heroic difficulty"]')?.getAttribute('aria-pressed')==='false'`, 'independent raiding content preferences')
      const raidPreferences = await db.call('getContentPreferences', progressionId, 'raiding')
      assert(raidPreferences.allowCrafting && !raidPreferences.difficulties.length && !raidPreferences.excludedMethods.length, 'Mythic+ preferences leaked into raiding')
      await choose('Progression activity', 'Mythic+')
      await wait(`document.querySelector('[aria-label="Allow crafted gear"]')?.getAttribute('aria-pressed')==='false'`, 'return to Mythic+ preferences')
      await switchCharacter('Progression alt')
      await wait(`location.hash.includes(${JSON.stringify(`/${progressionAltId}/progression`)})&&document.querySelector('[aria-label="Allow crafted gear"]')?.getAttribute('aria-pressed')==='true'`, 'independent alt content preferences')
      const altPreferences = await db.call('getContentPreferences', progressionAltId, 'mythicPlus')
      assert(altPreferences.allowCrafting && !altPreferences.difficulties.length && !altPreferences.excludedMethods.length, 'Progression preferences leaked into an alt')
      await switchCharacter('Progression fixture')
      await wait(`document.querySelector('[aria-label="Allow crafted gear"]')?.getAttribute('aria-pressed')==='false'`, 'original progression preferences restored')
      await nav('Characters', 'Your characters')
      return { persisted: true, characterIsolation: true, activityIsolation: true, personalTarget: 301.5, observedGearPreserved: true }
    })
    // New roadmap flows use isolated fictional observations, with no live provider or game dependency
    let workflowId = ''
    let workflowAltId = ''
    const workflowSeeded = await step('Roadmap workflows have isolated exact inventory, plan, rating, and appearance fixtures', async () => {
      const observedAt = new Date().toISOString()
      const common = { region: 'us', realm: 'Acceptance Realm', className: 'Mage', raceName: 'Human', specName: 'Arcane', specId: 62, level: 90, gameBuild: 'acceptance-workflow-build', observedAt, gearObservedAt: observedAt }
      const fixture = await db.call('addCharacter', { ...common, name: 'Workflow fixture', itemLevel: 275,
        gear: [{ slot: 'head', itemId: 1001, name: 'Workflow current helm', itemLevel: 275, itemLink: 'item:1001:0:0:0:0:0:0:0:90:0:0:0:0', bonusIds: [], gemIds: [], enchantId: 0, gemsCoverage: 'complete', enchantCoverage: 'complete', variantCoverage: 'complete', stats: [{ text: '+42 Intellect', secondary: false }] }],
        inventoryObservations: [{ location: 'bags', observedAt, coverage: 'partial', items: [{ slot: 'chest', itemId: 1003, name: 'Workflow bag robes', itemLevel: 280, itemLink: 'item:1003', instanceId: 'bag-instance', stats: [{ text: '+71 Intellect', secondary: false }] }] }, { location: 'bank', observedAt: null, coverage: 'unknown', items: [] }, { location: 'vault', observedAt, coverage: 'partial', choiceGroup: 'acceptance-vault-week', items: [{ slot: 'head', itemId: 1004, name: 'Workflow Vault hood', itemLevel: 285, vaultChoiceGroup: 'acceptance-vault-week' }, { slot: 'chest', itemId: 1005, name: 'Workflow Vault vestment', itemLevel: 285, vaultChoiceGroup: 'acceptance-vault-week' }] }],
        ratings: { mythicPlus: { value: 2300, label: 'Mythic+ score', source: 'Raider.IO', seasonId: 'acceptance-season', observedAt, rank: 120, rankScope: 'US Arcane Mage', sourceUrl: 'https://raider.io/characters/us/acceptance-realm/workflow-fixture' } },
        collectionObservedAt: observedAt, collectionScopeId: 'acceptance-collection', collectionCoverage: 'partial', collectedAppearanceIds: [44],
        observedTransmog: { head: { itemId: 1001, modifiedAppearanceId: 300, name: 'Workflow observed hood' } }, observedTransmogAt: observedAt,
      })
      const alt = await db.call('addCharacter', { ...common, name: 'Workflow alt', ratings: { mythicPlus: { value: 2400, label: 'Mythic+ score', source: 'Raider.IO', seasonId: 'acceptance-season', observedAt, sourceUrl: 'https://raider.io/characters/us/acceptance-realm/workflow-alt' } } })
      workflowId = fixture.id; workflowAltId = alt.id
      await db.call('saveGearDraft', { id: 'acceptance-workflow-plan', characterId: fixture.id, specId: 62, activity: 'mythicPlus', rulesetId: 'unknown', name: 'Workflow acquisition goal', items: [{ ...fixture.gear[0]!, itemId: 1002, name: 'Workflow goal helm', itemLevel: 300, itemLink: null }], updatedAt: observedAt })
      await service.changed()
      return { characterId: workflowId, altId: workflowAltId, fictional: true, exactItemReference: 1001, mutuallyExclusiveVaultGroup: 'acceptance-vault-week' }
    })
    await step('Tonight schedules a saved goal only after a duration estimate and persists pin, dismiss, undo, and alt isolation', async () => {
      assert(workflowSeeded, 'Workflow fixtures must be available')
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${workflowId}/overview`)
      await wait(`document.querySelector('h1')?.textContent==='Workflow fixture'`, 'workflow anchor selected')
      await waitDb(async () => (await db.call('getSettings')).lastCharacterId === workflowId, 'workflow session anchor')
      await nav('Tonight', 'Tonight')
      await wait(`document.querySelector('[aria-label="Unscheduled opportunities"]')?.textContent.includes('Work toward Workflow goal helm')`, 'unknown-duration goal is unscheduled')
      assert(await evaluate(`!document.querySelector('.tonight-recommended')&&document.body.innerText.includes('Duration unknown')`), 'Unknown duration was represented as fitting the strict time budget')
      await field('Duration in minutes', '20')
      await click('Save estimate')
      await wait(`document.querySelector('.tonight-recommended h2')?.textContent==='Work toward Workflow goal helm'&&document.querySelector('.tonight-recommended')?.textContent.includes('20 min')`, 'manual estimate schedules the action')
      await click('Pin', '.tonight-recommended button')
      await waitDb(async () => JSON.stringify(await db.call('getFeatureState', workflowId, 'session')).includes('"kind":"pin"'), 'session pin')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.tonight-recommended')?.textContent.includes('Pinned')`, 'pinned action restored after reload')
      await click('Dismiss', '.tonight-recommended button')
      await wait(`!document.querySelector('.tonight-recommended')&&document.querySelector('.tonight-history')?.textContent.includes('Dismissed')`, 'dismissed action removed from recommendation')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.tonight-history')?.textContent.includes('Dismissed')&&!document.querySelector('.tonight-recommended')`, 'dismissal persisted after reload')
      await click('Undo', '.tonight-history button')
      await wait(`document.querySelector('.tonight-recommended h2')?.textContent==='Work toward Workflow goal helm'`, 'undo restores the action and duration')
      await capture('tonight-scheduled-dark')
      await switchCharacter('Workflow alt')
      await waitDb(async () => (await db.call('getSettings')).lastCharacterId === workflowAltId, 'alt session anchor')
      await nav('Tonight', 'Tonight')
      await wait(`document.body.innerText.includes('No supported next step yet')`, 'alt has its own empty plan')
      assert(await evaluate(`!document.querySelector('.tonight-recommended')&&!document.querySelector('.tonight-history')&&!document.body.innerText.includes('Workflow goal helm')`), 'Session plan or dispositions leaked into the alt')
      assert(await db.call('getFeatureState', workflowAltId, 'session') === null, 'Reading an alt plan copied another character state')
      return { unknownDurationUnscheduled: true, manualDuration: 20, pinReload: true, dismissReload: true, undo: true, characterIsolation: true }
    })
    await step('Inventory distinguishes observed bags, unknown bank access, and mutually exclusive Vault choices', async () => {
      assert(workflowSeeded, 'Workflow fixtures must be available')
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${workflowId}/inventory`)
      await wait(`document.querySelector('h1')?.textContent==='Inventory'&&document.body.innerText.includes('Workflow current helm')`, 'observed equipped inventory page')
      await click('Bags')
      await wait(`document.querySelector('.inventory-list')?.textContent.includes('Workflow bag robes')`, 'observed bag equipment')
      contents.focus()
      contents.sendInputEvent({type:'mouseMove',x:1,y:1})
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.querySelector('.inventory-item-trigger').focus();resolve(true)})))`)
      const inventoryPoint=await evaluate<{x:number;y:number}>(`(()=>{const r=document.querySelector('.inventory-item').getBoundingClientRect();return {x:Math.round(r.x+30),y:Math.round(r.y+r.height/2)}})()`)
      contents.sendInputEvent({type:'mouseMove',...inventoryPoint})
      await wait(`document.querySelector('.item-hover-card')?.textContent.includes('+71 Intellect')`, 'recorded bag item stats on keyboard focus').catch(async error=>{await writeFile(path.join(outputDir,'inventory-hover-diagnostic.json'),JSON.stringify(await evaluate(`({active:document.activeElement?.outerHTML,trigger:document.querySelector('.inventory-item-trigger')?.parentElement?.outerHTML,cards:[...document.querySelectorAll('.item-hover-card')].map(n=>n.outerHTML)})`),null,2));throw error})
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await wait(`!document.querySelector('.item-hover-card')`, 'inventory tooltip dismissed')
      await click('Inspect Workflow bag robes, Chest, item level 280')
      await wait(`document.querySelector('[role="dialog"] [aria-label="Original item link"]')?.value==='item:1003'&&document.querySelector('.inventory-detail')?.textContent.includes('bag-instance')`, 'exact raw item link and instance remain inspectable')
      await click('Close panel')
      await wait(`!document.querySelector('[role="dialog"]')`, 'inventory item details closed')
      await click('Observed bank')
      await wait(`document.querySelector('.inventory-unavailable')?.textContent.includes('Bank equipment is unknown')`, 'bank access remains unknown')
      assert(await evaluate(`!document.querySelector('.inventory-section .inventory-list')&&document.querySelector('.inventory-section-heading .badge')?.textContent==='Coverage unknown'`), 'Unavailable bank access was represented as a complete empty bank')
      await click('Vault choices')
      await wait(`document.querySelector('.inventory-list')?.textContent.includes('Workflow Vault hood')`, 'Vault alternatives selected')
      assert(await evaluate(`document.body.innerText.includes('Workflow Vault hood')&&document.body.innerText.includes('Workflow Vault vestment')`), 'Observed Vault alternatives are missing')
      assert(await evaluate(`/mutually exclusive|one reward|one choice|alternatives/i.test(document.body.innerText)`), 'Vault items were not explained as mutually exclusive choices')
      await capture('inventory-observations-dark')
      const originalSize = window.getContentSize()
      try { window.setContentSize(820, 760); await wait(`innerWidth===820`, 'minimum inventory width'); assert(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`), 'Inventory overflows the minimum desktop width'); await capture('inventory-minimum-width') } finally { window.setContentSize(originalSize[0], originalSize[1]) }
      return { bagsObserved: true, rawItemLink: true, instancePreserved: true, keyboardStats: true, bankUnknown: true, vaultAlternativesVisible: true, minimumWidth: true }
    })
    await step('Simulations export a partial baseline, reject executable profile directives, and persist external report bookmarks by character', async () => {
      assert(workflowSeeded, 'Workflow fixtures must be available')
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${workflowId}/simulations`)
      await wait(`document.querySelector('[aria-label="SimulationCraft profile"]')?.value.includes('head=,id=1001')`, 'generated SimulationCraft profile')
      const original = await evaluate<string>(`document.querySelector('[aria-label="SimulationCraft profile"]').value`)
      assert(original.includes('mage=companion_baseline') && original.includes('spec=arcane') && original.includes('# Character baseline'), 'Profile lacks its character/spec provenance')
      assert(await evaluate(`document.querySelector('[aria-label="Simulation profile"]')?.textContent.includes('Partial profile')&&[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Run simulation')?.disabled`), 'An incomplete baseline can start a verified local simulation')
      await field('SimulationCraft profile', 'mage=companion_baseline\nspec=arcane\ninput=outside.simc\n')
      await click('Save imported profile')
      await wait(`document.body.innerText.includes('Unsupported profile directive: input')`, 'unsafe profile directive rejected')
      assert(!JSON.stringify(await db.call('getFeatureState', workflowId, 'simulation')).includes('outside.simc'), 'Rejected profile was saved')
      await field('SimulationCraft profile', original)
      await click('Save imported profile')
      await waitDb(async () => (await db.call('getFeatureState', workflowId, 'simulation') as {profile?:{matchesCurrent?:boolean}} | null)?.profile?.matchesCurrent === true, 'matching imported profile')
      await field('Report URL', 'https://www.raidbots.com/simbot/report/AcceptanceFixture')
      await field('Notes', 'Acceptance report bookmark — no imported DPS')
      await click('Save report')
      await wait(`document.querySelector('.simulation-report')?.textContent.includes('Acceptance report bookmark')`, 'external report bookmark')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.simulation-report')?.textContent.includes('Acceptance report bookmark')&&document.body.innerText.includes('Saved import: matches the recorded baseline')`, 'report/profile persistence after reload')
      await capture('simulations-baseline-dark')
      await switchCharacter('Workflow alt')
      await wait(`location.hash.includes(${JSON.stringify(`/${workflowAltId}/simulations`)})&&document.querySelector('[aria-label="SimulationCraft profile"]')?.value.includes('spec=arcane')`, 'alt simulation baseline')
      assert(await evaluate(`!document.querySelector('.simulation-report')&&!document.body.innerText.includes('Saved import:')&&!document.body.innerText.includes('Acceptance report bookmark')`), 'Simulation profile or bookmark leaked into another character')
      return { profileExport: true, baselineHashPresent: true, incompleteExecutionDisabled: true, directiveRejected: true, profileReload: true, reportReload: true, characterIsolation: true }
    })
    await step('Wardrobe saves appearance intent and hidden slots, round-trips an outfit code, isolates alts, and confirms deletion', async () => {
      assert(workflowSeeded, 'Workflow fixtures must be available')
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${workflowId}/wardrobe`)
      await wait(`document.querySelector('.wardrobe-page')&&document.body.innerText.includes('Start an outfit')`, 'empty wardrobe')
      await click('New outfit')
      await wait(`!!document.querySelector('.wardrobe-editor')`, 'new outfit editor')
      await field('Outfit name', 'Workflow silver outfit')
      await click('Use observed look')
      await click('Hidden slots and weapon illusions', 'summary')
      await click('Hide Head')
      await click('Save outfit')
      await waitDb(async () => (await db.call('listOutfits', workflowId)).some(outfit => outfit.name === 'Workflow silver outfit' && outfit.hiddenSlots.includes('head') && outfit.slots.head?.modifiedAppearanceId === 300), 'outfit appearance and hidden intent')
      await wait(`!document.querySelector('.wardrobe-editor')?.disabled&&![...document.querySelectorAll('.wardrobe-editor .badge')].some(badge=>badge.textContent==='Unsaved')`, 'outfit save settled')
      await click('Preview this outfit in WoW', 'summary')
      const outfitCode = await evaluate<string>(`[...document.querySelectorAll('label.field')].find(label=>label.querySelector(':scope > span')?.textContent==='Outfit code').querySelector('textarea').value`)
      assert(/^WCO1\.[A-Za-z0-9_-]+\.[a-f0-9]{8}$/.test(outfitCode), 'No bounded outfit transport code was displayed')
      assert(await evaluate(`document.body.innerText.includes('/wowoutfit')&&document.body.innerText.includes('does not rebuild that model')`), 'Addon instructions or honest desktop assembly boundary are missing')
      await click('Import an outfit code', 'summary')
      await field('Paste a WOW Companion outfit code', outfitCode)
      await click('Apply to this draft')
      await field('Outfit name', 'Workflow outfit round trip')
      await click('Save outfit')
      await waitDb(async () => (await db.call('listOutfits', workflowId)).some(outfit => outfit.name === 'Workflow outfit round trip' && outfit.hiddenSlots.includes('head') && outfit.slots.head?.modifiedAppearanceId === 300), 'outfit code round trip')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.wardrobe-editor input')?.value==='Workflow outfit round trip'`, 'saved outfit after reload')
      await capture('wardrobe-outfit-dark')
      const originalSize = window.getContentSize()
      try { window.setContentSize(820, 760); await wait(`innerWidth===820`, 'minimum wardrobe width'); assert(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`), 'Wardrobe overflows the minimum desktop width'); await capture('wardrobe-minimum-width') } finally { window.setContentSize(originalSize[0], originalSize[1]) }
      await switchCharacter('Workflow alt')
      await wait(`location.hash.includes(${JSON.stringify(`/${workflowAltId}/wardrobe`)})&&document.body.innerText.includes('Start an outfit')`, 'isolated alt wardrobe')
      assert((await db.call('listOutfits', workflowAltId)).length === 0, 'The outfit was copied to another character')
      await switchCharacter('Workflow fixture')
      await wait(`document.querySelector('.wardrobe-editor input')?.value==='Workflow outfit round trip'`, 'original wardrobe restored')
      await click('Delete outfit')
      await click('Keep outfit', '.wardrobe-delete-confirm button')
      assert((await db.call('listOutfits', workflowId)).length === 1, 'Keeping an outfit deleted it')
      await click('Delete outfit')
      await click('Delete outfit', '.wardrobe-delete-confirm button')
      await waitDb(async () => (await db.call('listOutfits', workflowId)).length === 0, 'confirmed outfit deletion')
      await wait(`document.body.innerText.includes('Start an outfit')&&!document.querySelector('.wardrobe-editor')`, 'deleted outfit leaves a usable empty wardrobe')
      return { createSave: true, hiddenSlotPersisted: true, appearanceSourceRetained: true, outfitCodeRoundTrip: true, reload: true, minimumWidth: true, characterIsolation: true, keepThenDelete: true }
    })
    await step('Local 3D inspection loads an embedded GLB and detaches it without changing the outfit', async () => {
      const positions=new Float32Array([-1,0,0,1,0,0,0,2,0]);const binary=Buffer.from(positions.buffer)
      const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:binary.length}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}]}))
      const length=Math.ceil(json.length/4)*4,bytes=Buffer.alloc(28+length+binary.length,32);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(binary.length,20+length);bytes.writeUInt32LE(0x004e4942,24+length);binary.copy(bytes,28+length)
      const assetId='12345678-1234-1234-1234-123456789abc',directory=path.join(outputDir,'../models');await mkdir(directory,{recursive:true});await writeFile(path.join(directory,assetId+'.glb'),bytes)
      await db.call('saveFeatureState',workflowId,'model',{assetId,url:`wow-asset://models/${assetId}.glb`,name:'Acceptance triangle.glb',bytes:bytes.length,sha256:'fixture',clips:[],sourceGameBuild:null,available:true})
      await service.changed(workflowId)
      await window.loadURL(contents.getURL().split('#')[0]+`#/characters/${workflowId}/wardrobe`)
      await click('Inspect a 3D model','summary')
      await wait(`document.querySelector('[aria-label="Local 3D inspection"] canvas')&&document.body.innerText.includes('Acceptance triangle.glb')`,'R3F embedded model canvas')
      await capture('wardrobe-model-inspection')
      await click('Reset viewer');await wait(`!!document.querySelector('[aria-label="Local 3D inspection"] canvas')`,'model viewer reset')
      await click('Detach model');await waitDb(async()=>await db.call('getFeatureState',workflowId,'model')===null,'model detached')
      assert((await db.call('listOutfits',workflowId)).length===0,'Model inspection changed outfit intent')
      return {embeddedGlb:true,rendererCanvas:true,reset:true,detach:true}
    })
    await step('Contextual comparisons disclose their peer sample, retain history, and withhold unsupported content-filter results', async () => {
      assert(workflowSeeded, 'Workflow fixtures must be available')
      await window.loadURL(contents.getURL().split('#')[0] + `#/characters/${workflowId}/standings`)
      await wait(`document.querySelector('.comparison-table tbody')?.textContent.includes('Workflow alt')`, 'same-spec same-season peer observation')
      assert(await evaluate(`document.querySelector('.comparison-table')?.textContent.includes('Raider.IO')&&document.querySelector('.comparison-source-meta')?.textContent.includes('acceptance-season')`), 'Peer comparison omitted source or season')
      await click('Applied filters and interpretation', 'summary')
      assert(await evaluate(`document.querySelector('.comparison-evidence')?.textContent.includes('no overall percentile is calculated')`), 'A sampled population did not disclose the missing overall denominator')
      await choose('Comparison population', 'Your history')
      await wait(`document.querySelector('.comparison-population h3')?.textContent==='Your recorded rating history'&&document.querySelector('.comparison-table tbody tr')`, 'recorded history population')
      assert(await evaluate(`!document.querySelector('.comparison-table tbody')?.textContent.includes('Workflow alt')`), 'Another character appeared in personal rating history')
      await click('Content filters and availability', 'summary')
      await field('Key level', '12')
      await click('Apply filters')
      await wait(`document.querySelector('.comparison-notice')?.textContent.includes('Key-level +12 filtering is unavailable')&&!document.querySelector('.comparison-table tbody tr')`, 'unsupported filters withhold the sample instead of broadening it')
      await field('Public report URL', 'https://www.warcraftlogs.com/reports/ABCDEF1234567890')
      await field('Your notes', 'Acceptance public report bookmark')
      await click('Save report', '.comparison-reports button')
      await wait(`document.querySelector('.comparison-report-list')?.textContent.includes('Acceptance public report bookmark')&&document.querySelector('.comparison-report-list')?.textContent.includes('Report contents have not been imported')`, 'report link remains a bookmark without fabricated event review')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.comparison-report-list')?.textContent.includes('Acceptance public report bookmark')`, 'comparison report persistence')
      await capture('comparisons-peers-dark')
      await switchCharacter('Workflow alt')
      await wait(`location.hash.includes(${JSON.stringify(`/${workflowAltId}/standings`)})&&document.querySelector('.comparison-page')`, 'alt comparison context')
      await wait(`!document.querySelector('.comparison-report-list article')`, 'alt report list loaded')
      assert(await evaluate(`!document.body.innerText.includes('Acceptance public report bookmark')`), 'A saved report leaked into another character')
      return { sourceAndSeason: true, noInventedPercentile: true, historyIsolation: true, unsupportedFiltersWithheld: true, publicReportBookmark: true, reportReload: true, characterIsolation: true }
    })
    // This fixture belongs only to the dedicated acceptance database and has no later consumers
    const deletionGuid = 'Player-acceptance-deletion'
    const deletionTime = new Date().toISOString()
    const deletionRecord = { guid: deletionGuid, region: 'us', realm: 'Acceptance Realm', name: 'Deletion fixture', className: 'Mage', raceName: 'Human', level: 90, specId: 64, observedAt: deletionTime, sessionId: 'acceptance-deletion-session', sequence: 1, gear: [], gameBuild: 'acceptance-fixture' }
    const deletionPayload = { schemaVersion: 1, addonVersion: 'acceptance', sourceProfileId: 'acceptance-deletion-profile', exportedAt: deletionTime, characters: { [deletionGuid]: deletionRecord } }
    const confirmationButtons = '[role="dialog"] .archive-row:has(.archive-confirm) button'
    let deletionId = ''
    await step('Every polished screen fits dark desktop and light minimum-width layouts',async()=>{
      const unknown=await db.call('addCharacter',{name:'Polish unknown spec',region:'us',realm:'Acceptance Realm',className:'Mage',specId:null})
      const screens=[['characters',`/characters?selected=${workflowId}`,'Your characters'],['week','/week','This week'],['tonight','/tonight','Tonight'],['character',`/characters/${workflowId}/overview`,'Workflow fixture'],['progression',`/characters/${workflowId}/progression`,'Gear progression'],['gear',`/characters/${workflowId}/gear`,'Gear planner'],['inventory',`/characters/${workflowId}/inventory`,'Inventory'],['simulations',`/characters/${workflowId}/simulations`,'Simulations'],['wardrobe',`/characters/${workflowId}/wardrobe`,'Wardrobe'],['standings',`/characters/${workflowId}/standings`,'Standings'],['top',`/characters/${unknown.id}/top`,'Top players'],['settings','/settings','Settings']]
      const size=window.getContentSize()
      try{for(const variant of [{theme:'dark' as const,width:1460},{theme:'light' as const,width:820}]){
        await db.call('setSettings',{theme:variant.theme});await service.changed();window.setContentSize(variant.width,900)
        for(const [name,route,heading]of screens){
          await window.loadURL(contents.getURL().split('#')[0]+'#'+route)
          await wait(`document.querySelector('h1')?.textContent===${JSON.stringify(heading)}&&document.documentElement.dataset.theme===${JSON.stringify(variant.theme)}`,'polish '+name+' '+variant.theme)
          contents.sendInputEvent({type:'mouseMove',x:1,y:1})
          contents.sendInputEvent({type:'keyDown',keyCode:'Escape'});contents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
          await wait(`!document.querySelector('.character-popover')`,'character switcher fully unmounted before screen capture')
          assert(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),'Polished '+name+' overflows at '+variant.width)
          await capture(`polish-${name}-${variant.theme}-${variant.width}`)
        }
      }}finally{window.setContentSize(size[0],size[1]);await db.call('setSettings',{theme:'dark'});await service.changed()}
      return {screens:screens.length,themes:['dark','light'],widths:[1460,820],overflow:false}
    })
    const deletionKept = await step('Keeping a character cancels inline deletion and preserves its saved plans and selection', async () => {
      await wait(`!document.querySelector('.item-search-dialog')`, 'tooltip search closed before deletion coverage')
      const imported = await db.call('importSnapshot', deletionPayload)
      assert(imported.errors.length === 0 && imported.imported.length === 1, 'Fictional addon deletion fixture was not imported')
      deletionId = imported.imported[0]!
      for (const activity of ['mythicPlus', 'raiding'] as const) {
        await db.call('saveGearDraft', { id: `acceptance-deletion-${activity}`, characterId: deletionId, specId: 64, activity, rulesetId: activity === 'raiding' ? 'acceptance-rules' : 'unknown', name: `Deletion ${activity} plan`, items: [], updatedAt: deletionTime })
      }
      for (const suffix of ['one', 'two']) {
        await db.call('saveOutfit', { id: `acceptance-deletion-outfit-${suffix}`, characterId: deletionId, name: `Deletion outfit ${suffix}`, slots: {}, hiddenSlots: ['back'], illusionIds: {}, templateId: null, updatedAt: deletionTime })
      }
      const settings = await db.call('getSettings')
      await db.call('setSettings', { characterActivities: { ...settings.characterActivities, [deletionId]: 'mythicPlus' } })
      await service.changed()
      await nav('Characters', 'Your characters')
      await wait(`!!document.querySelector('tr[aria-label="Select Deletion fixture"]')`, 'fictional deletion roster row')
      await click('Select Deletion fixture', 'tr')
      await wait(`document.querySelector('.selected-pane h2')?.textContent==='Deletion fixture'&&document.querySelector('.switcher strong')?.textContent==='Deletion fixture'`, 'selected deletion fixture')
      await waitDb(async () => (await db.call('getSettings')).lastCharacterId === deletionId, 'deletion fixture persisted selection')
      const { exportedAt: _beforeTime, ...before } = await db.call('exportBackup')
      assert(before.drafts.filter((draft) => draft.characterId === deletionId).length === 2 && before.outfits.filter((outfit) => outfit.characterId === deletionId).length === 2, 'Deletion coverage requires persisted drafts and outfits')
      const revision = await db.call('getRevision')
      await click('Manage roster')
      await wait(`!!document.querySelector('[role="dialog"] [aria-label="Delete Deletion fixture"]')`, 'fixture delete control')
      await click('Delete Deletion fixture', '[role="dialog"] button')
      await wait(`document.querySelector('[role="dialog"] .archive-confirm')?.textContent.includes('Delete Deletion fixture?')`, 'named inline deletion warning')
      await capture('character-delete-confirmation')
      await click('Keep', confirmationButtons)
      await wait(`!document.querySelector('[role="dialog"] .archive-confirm')&&!!document.querySelector('[role="dialog"] [aria-label="Delete Deletion fixture"]')`, 'Keep restores the delete control')
      const { exportedAt: _afterTime, ...after } = await db.call('exportBackup')
      assert(JSON.stringify(after) === JSON.stringify(before), 'Keep changed characters, drafts, outfits, or saved settings')
      assert((await db.call('getRevision')) === revision, 'Keep unexpectedly mutated the database revision')
      await click('Close panel')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('.selected-pane h2')?.textContent==='Deletion fixture'`, 'kept character remains selected after reload')
      return { characterId: deletionId, retainedDrafts: 2, retainedOutfits: 2, selectionRetained: true, revisionUnchanged: true }
    })
    const deletionConfirmed = await step('Confirming deletion removes the selected character, all plans, outfits, and saved selection through Manage roster', async () => {
      assert(deletionKept, 'Deletion cancel coverage must pass before confirming deletion')
      const before = await db.call('exportBackup')
      assert(before.settings.lastCharacterId === deletionId && before.settings.characterActivities[deletionId] === 'mythicPlus', 'Deletion fixture must be selected with a saved activity')
      await click('Manage roster')
      await wait(`!!document.querySelector('[role="dialog"] [aria-label="Delete Deletion fixture"]')`, 'fixture delete control after reload')
      await click('Delete Deletion fixture', '[role="dialog"] button')
      await wait(`document.querySelector('[role="dialog"] .archive-confirm')?.textContent.includes('Delete Deletion fixture?')`, 'fixture inline confirmation')
      await click('Delete', confirmationButtons)
      await waitDb(async () => (await db.call('getCharacter', deletionId)) === null, 'confirmed character deletion')
      await wait(`![...document.querySelectorAll('[role="dialog"] .archive-row')].some(row=>row.textContent.includes('Deletion fixture'))`, 'deleted character removed from Manage roster')
      const after = await db.call('exportBackup')
      assert(!after.characters.some((character) => character.id === deletionId), 'Deleted character remains in the archived or active roster')
      assert(!after.drafts.some((draft) => draft.characterId === deletionId), 'Deletion left a draft in another activity or ruleset')
      assert((await db.call('listOutfits', deletionId)).length === 0 && !after.outfits.some((outfit) => outfit.characterId === deletionId), 'Deletion left saved outfits')
      assert(after.settings.lastCharacterId === null && !(deletionId in after.settings.characterActivities), 'Deletion retained saved selection or activity')
      const { [deletionId]: _removedActivity, ...remainingActivities } = before.settings.characterActivities
      assert(JSON.stringify(after.settings) === JSON.stringify({ ...before.settings, lastCharacterId: null, characterActivities: remainingActivities }), 'Deletion changed unrelated settings')
      for (const key of ['characters', 'drafts', 'outfits'] as const) {
        const remaining = before[key].filter((entry) => ('characterId' in entry ? entry.characterId : entry.id) !== deletionId)
        assert(JSON.stringify(after[key]) === JSON.stringify(remaining), `Deletion changed another character's ${key}`)
      }
      await click('Close panel')
      await wait(`location.hash.split('?')[0]==='#/characters'&&document.querySelector('h1')?.textContent==='Your characters'&&!document.querySelector('tr[aria-label="Select Deletion fixture"]')&&document.querySelector('.selected-pane h2')?.textContent!=='Deletion fixture'&&document.querySelector('.switcher strong')?.textContent!=='Deletion fixture'`, 'usable roster and surviving selection after deletion')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('h1')?.textContent==='Your characters'&&!!document.querySelector('.selected-pane h2')&&!document.querySelector('tr[aria-label="Select Deletion fixture"]')&&document.querySelector('.selected-pane h2')?.textContent!=='Deletion fixture'`, 'deleted character stays absent after reload')
      await capture('character-deleted-roster')
      return { characterId: deletionId, removedDrafts: 2, removedOutfits: 2, savedSelectionCleared: true, savedActivityCleared: true, unrelatedDataPreserved: true, rosterAfterReload: true }
    })
    await step('A newer addon export cannot reimport the deleted character while a valid sibling still imports', async () => {
      assert(deletionConfirmed, 'UI deletion must pass before checking addon suppression')
      const before = await db.call('exportBackup')
      const exportedAt = new Date(Date.parse(deletionTime) + 60_000).toISOString()
      const controlGuid = 'Player-acceptance-deletion-control'
      const newerRecord = { ...deletionRecord, observedAt: exportedAt, sequence: 2, itemLevel: 260 }
      const payload = { ...deletionPayload, exportedAt, characters: { [deletionGuid]: newerRecord, [controlGuid]: { ...newerRecord, guid: controlGuid, name: 'Deletion import control' } } }
      const syncLabel = await evaluate<string>(`document.querySelector('button[aria-label$=". Open sync details"]').getAttribute('aria-label')`)
      await click(syncLabel)
      await click('Import from a file instead')
      await wait(`!!document.querySelector('textarea')`, 'deletion reimport editor')
      await field('Or paste an export', JSON.stringify(payload))
      await click('Import pasted export')
      await wait(`(()=>{const report=document.querySelector('.import-report');return report?.textContent.includes('Import complete')&&report.textContent.includes('1 imported')&&report.textContent.includes('0 unchanged')&&report.textContent.includes('0 problems')})()`, 'newer export imports only the control character without errors')
      const after = await db.call('exportBackup')
      const control = after.characters.find((character) => character.sourceRefs.some((ref) => ref.provider === 'addon' && ref.characterKey === controlGuid))
      assert(control?.name === 'Deletion import control', 'Valid addon sibling did not import')
      assert(!after.characters.some((character) => character.id === deletionId || character.sourceRefs.some((ref) => ref.provider === 'addon' && ref.characterKey === deletionGuid)), 'Addon reimport resurrected the deleted identity')
      assert(JSON.stringify(after.characters.filter((character) => character.id !== control?.id)) === JSON.stringify(before.characters), 'Reimport changed unrelated characters')
      assert(JSON.stringify(after.drafts) === JSON.stringify(before.drafts) && JSON.stringify(after.outfits) === JSON.stringify(before.outfits), 'Reimport changed or restored saved plans')
      assert(after.settings.lastCharacterId === null && !(deletionId in after.settings.characterActivities), 'Reimport restored the deleted selection or activity')
      await click('Close panel')
      await window.loadURL(contents.getURL())
      await wait(`document.querySelector('h1')?.textContent==='Your characters'&&!!document.querySelector('tr[aria-label="Select Deletion import control"]')&&!document.querySelector('tr[aria-label="Select Deletion fixture"]')`, 'reimport suppression survives renderer reload')
      return { suppressedAddonGuid: deletionGuid, newerSequence: 2, importedControlId: control?.id, deletedIdentityAbsent: true, plansRemainRemoved: true }
    })
    report.gpu = await app.getGPUInfo('complete').catch((cause) => ({ error: String(cause) }))
  } finally {
    if (debugRequested && contents.debugger.isAttached()) {
      contents.debugger.removeListener('message', onDebugMessage)
      contents.debugger.detach()
    }
    contents.session.webRequest.onBeforeRequest(null)
    contents.removeListener('console-message', onConsole)
    report.finishedAt = new Date().toISOString()
    report.passed = report.steps.length > 0 && report.steps.every((entry) => entry.status === 'pass') && (report.debugger?.exceptions.length ?? 0) === 0 && report.consoleErrors.length === 0
    await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  }
  return report
}
