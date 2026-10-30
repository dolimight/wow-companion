import { parseSnapshot } from './parse-snapshot'
import type { ImportReport } from '../../shared/domain'
export { parseSnapshot } from './parse-snapshot'
export { watchRoster } from './watch-roster'
export async function importRoster(text: string, commit: (snapshot: unknown) => Promise<ImportReport>): Promise<ImportReport> { return commit(parseSnapshot(text)) }
