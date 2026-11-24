import Fuse from 'fuse.js'
import { lookVocabulary, type LookTerm } from '../../../shared/looks'

const fuse = new Fuse(lookVocabulary, { keys: ['word'], includeScore: true, threshold: 0.34, ignoreLocation: true })

/** What a search box entry asks for: name words, plus the colours, themes, and effect it names */
export type ParsedQuery = { text: string; colors: string[]; themes: string[]; effect: 'any' | 'with' | 'without'; terms: Array<{ word: string; term: LookTerm }> }

/**
 * Splits what the player typed into look terms and name words. Each word is matched loosely against the look
 * vocabulary, so typos such as "purpel" or "efeect" still find their tag; "no effect" asks for items without one.
 * Words that match nothing search names
 */
export function parseQuery(input: string): ParsedQuery {
  const out: ParsedQuery = { text: '', colors: [], themes: [], effect: 'any', terms: [] }
  const words = input.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const rest: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const match = word.length >= 3 ? fuse.search(word)[0] : undefined
    const term = match && (match.score ?? 1) <= 0.34 ? match.item : undefined
    if (!term) { rest.push(word); continue }
    // "no effect", "without effects"
    const negated = (term.kind === 'effect') && (rest[rest.length - 1] === 'no' || rest[rest.length - 1] === 'without')
    if (negated) rest.pop()
    out.terms.push({ word: negated ? `${words[i - 1]} ${word}` : word, term: negated ? { word: 'plain', kind: 'plain', value: 'without' } : term })
    if (term.kind === 'color') out.colors.push(term.value)
    else if (term.kind === 'theme') out.themes.push(term.value)
    else out.effect = negated || term.kind === 'plain' ? 'without' : 'with'
  }
  out.text = rest.join(' ')
  out.colors = [...new Set(out.colors)]
  out.themes = [...new Set(out.themes)]
  return out
}
