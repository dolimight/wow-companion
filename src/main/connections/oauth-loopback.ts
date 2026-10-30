import { createServer, type Server } from 'node:http'
import { timingSafeEqual } from 'node:crypto'

/** Fixed so users can register it once on the Blizzard developer site */
export const OAUTH_PORT = 47615
export const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/callback`

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>body{font:15px -apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f7f8fa;color:#1c2430}@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f5}}main{text-align:center;max-width:420px}h1{font-size:22px;margin:0 0 8px}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`

const sameState = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

/** Single-use loopback listener for the Battle.net sign-in redirect, bound to 127.0.0.1 only */
export function waitForAuthorizationCode(state: string, timeoutMs = 5 * 60_000): { code: Promise<string>; cancel(): void } {
  let server: Server | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let settle: { resolve(code: string): void; reject(error: Error): void } | undefined
  const code = new Promise<string>((resolve, reject) => { settle = { resolve, reject } })
  const finish = (error: Error | null, value?: string) => {
    if (timer) clearTimeout(timer)
    server?.close()
    server = undefined
    if (error) settle?.reject(error); else settle?.resolve(value!)
    settle = undefined
  }
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', REDIRECT_URI)
    if (url.pathname !== '/callback') { response.writeHead(404).end(); return }
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }
    const returned = url.searchParams.get('state') ?? ''
    if (!sameState(returned, state)) { response.writeHead(400, headers).end(page('Sign-in link expired', 'Start Battle.net sign-in again from WOW Companion')); return }
    const error = url.searchParams.get('error')
    const value = url.searchParams.get('code')
    if (error || !value) {
      response.writeHead(200, headers).end(page('Sign-in was cancelled', 'You can close this tab and return to WOW Companion'))
      finish(new Error(error === 'access_denied' ? 'Battle.net sign-in was cancelled' : 'Battle.net did not complete sign-in'))
      return
    }
    response.writeHead(200, headers).end(page('You are signed in', 'You can close this tab and return to WOW Companion'))
    finish(null, value)
  })
  server.once('error', (error: NodeJS.ErrnoException) => finish(new Error(error.code === 'EADDRINUSE' ? `Another app is using port ${OAUTH_PORT}, close it and try again` : 'Sign-in could not start on this computer')))
  server.listen(OAUTH_PORT, '127.0.0.1')
  timer = setTimeout(() => finish(new Error('Battle.net sign-in timed out, start it again when you are ready')), timeoutMs)
  timer.unref?.()
  return { code, cancel: () => finish(new Error('Battle.net sign-in was cancelled')) }
}
