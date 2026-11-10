import { appIconCursor, type AppIconVariant } from '../shared/app-icons'

/** Each app icon gets its own edition line, named after the matching in-game holiday where there is one */
export const splashEditions: Record<AppIconVariant, string> = {
  classic: 'For World of Warcraft', nightly: 'Nightly build', newyear: 'New Year edition', valentine: 'Love is in the Air edition',
  stpatrick: "St. Patrick's Day edition", easter: 'Noblegarden edition', independence: 'Fireworks Spectacular edition',
  halloween: "Hallow's End edition", thanksgiving: "Pilgrim's Bounty edition", christmas: 'Feast of Winter Veil edition',
}

/** The splash's base tone: near black, leaning toward the icon's color so each edition reads at a glance */
export function splashBackground(color: string) {
  const channel = (index: number) => parseInt(color.slice(1 + index * 2, 3 + index * 2), 16)
  const base = [5, 7, 11]
  return '#' + base.map((value, index) => Math.round(value * .9 + channel(index) * .1).toString(16).padStart(2, '0')).join('')
}

export type SplashOptions = {
  /** The chosen app icon's logo, embedded so the splash needs no file or network access */
  logo: Buffer
  variant: AppIconVariant
  version: string
  reducedMotion: boolean
}

const escape = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)
const hex = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : '#30adf9'

/** A boot screen in the spirit of creative suites: a lit stage for the logo, the product name, and a live loading line */
export function splashHtml({ logo, variant, version, reducedMotion }: SplashOptions) {
  const { color, target: accent } = appIconCursor[variant] ?? appIconCursor.classic
  const nightly = version.includes('-nightly.')
  const shown = nightly ? `Nightly ${version.split('-nightly.')[1]!.split('.')[0]!.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}` : `Version ${version}`
  const tint = hex(color), glow = hex(accent), base = splashBackground(tint)
  // Motes of light in the edition's colors, placed by a fixed pattern so every launch looks the same
  const motes = Array.from({ length: 16 }, (_, index) => {
    const x = 38 + ((index * 37) % 60), y = 20 + ((index * 53) % 75), size = 2 + (index % 3), delay = (index * .7) % 6, length = 6 + (index % 5)
    return `<i style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation-delay:-${delay.toFixed(1)}s;animation-duration:${length}s;background:${index % 3 ? glow : tint}"></i>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>WOW Companion</title>
<style>
:root { --tint: ${tint}; --glow: ${glow}; color-scheme: dark; }
* { box-sizing: border-box; margin: 0; }
html, body { height: 100%; overflow: hidden; background: ${base}; color: #f5f7fa; font: 13px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; user-select: none; cursor: default; }
.stage { position: relative; height: 100%; display: grid; grid-template-columns: 1fr 300px; isolation: isolate; }
/* Light pools behind the mark, tinted by the chosen icon */
.stage::before { content: ""; position: absolute; inset: -20%; z-index: -2;
  background: radial-gradient(42% 55% at 72% 46%, color-mix(in srgb, var(--tint) 46%, transparent), transparent 70%),
              radial-gradient(30% 40% at 88% 18%, color-mix(in srgb, var(--glow) 30%, transparent), transparent 70%),
              radial-gradient(60% 60% at 10% 110%, color-mix(in srgb, var(--tint) 18%, transparent), transparent 70%); }
/* A fine diagonal weave, the way suite splash art carries texture */
.stage::after { content: ""; position: absolute; inset: 0; z-index: -1; opacity: .035;
  background: repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 14px); mask: linear-gradient(90deg, transparent, #000 55%); }
.copy { display: flex; flex-direction: column; justify-content: space-between; padding: 34px 0 30px 36px; min-width: 0; }
.brand small { display: block; font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--glow); }
.brand h1 { margin-top: 10px; font: 600 40px/1.02 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -.035em; }
.brand p { margin-top: 10px; max-width: 30ch; color: #aab4c2; }
.status { display: grid; gap: 10px; max-width: 300px; }
.status-line { display: flex; justify-content: space-between; gap: 12px; color: #c8d0db; font-size: 12px; }
.status-line span:last-child { color: #7d8794; white-space: nowrap; }
.bar { position: relative; height: 2px; border-radius: 2px; overflow: hidden; background: rgba(255,255,255,.1); }
.bar i { position: absolute; inset: 0 auto 0 0; width: 8%; border-radius: inherit; background: linear-gradient(90deg, var(--tint), var(--glow)); box-shadow: 0 0 12px var(--glow); transition: width .45s cubic-bezier(.2,.8,.2,1); }
.legal { color: #5e6874; font-size: 10.5px; }
.motes { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.motes i { position: absolute; border-radius: 50%; opacity: .35; box-shadow: 0 0 8px currentColor; }
@keyframes float { 0% { transform: translateY(14px); opacity: 0; } 30% { opacity: .55; } 100% { transform: translateY(-40px); opacity: 0; } }
.animated .motes i { animation: float linear infinite; }
.mark { position: relative; display: grid; place-items: center; }
.mark img { width: 250px; height: 250px; object-fit: contain; filter: drop-shadow(0 0 28px color-mix(in srgb, var(--glow) 55%, transparent)); }
.mark::before { content: ""; position: absolute; width: 230px; height: 230px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--glow) 35%, transparent); }
body.leaving .stage { opacity: 0; transform: scale(.985); transition: opacity .22s ease, transform .22s ease; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes bloom { from { opacity: 0; transform: scale(.86) rotate(-8deg); } }
@keyframes orbit { to { transform: rotate(360deg); } }
@keyframes drift { 50% { transform: translate(-2%, 2%); } }
.animated .brand > * { animation: rise .6s cubic-bezier(.2,.8,.2,1) both; }
.animated .brand h1 { animation-delay: .06s; } .animated .brand p { animation-delay: .12s; }
.animated .mark img { animation: bloom .8s cubic-bezier(.2,.8,.2,1) both; }
.animated .mark::before { border-style: dashed; animation: orbit 24s linear infinite; }
.animated .stage::before { animation: drift 9s ease-in-out infinite; }
</style></head>
<body class="${reducedMotion ? '' : 'animated'}">
<main class="stage">
  <div class="motes" aria-hidden="true">${motes}</div>
  <section class="copy">
    <div class="brand"><small>${escape(splashEditions[variant] ?? splashEditions.classic)}</small><h1>WOW<br>Companion</h1><p>Your characters, gear plans, and simulations in one place</p></div>
    <div class="status" role="status" aria-live="polite">
      <div class="status-line"><span id="step">Starting</span><span>${escape(shown)}</span></div>
      <div class="bar"><i id="bar"></i></div>
      <p class="legal">Not affiliated with or endorsed by Blizzard Entertainment</p>
    </div>
  </section>
  <div class="mark"><img alt="" src="data:image/png;base64,${logo.toString('base64')}"></div>
</main>
<script>
window.setStep = (text, share) => { document.getElementById('step').textContent = text; document.getElementById('bar').style.width = Math.round(Math.max(.08, Math.min(1, share)) * 100) + '%' }
window.leave = () => document.body.classList.add('leaving')
</script>
</body></html>`
}

