import { config } from 'zod'

// The renderer's CSP forbids eval. Zod otherwise probes with `new Function` to decide whether to compile
// validators, and the blocked probe shows up as a CSP violation in the console even though Zod recovers
config({ jitless: true })
