import { describe,it,expect } from 'vite-plus/test'
import { rendererOrigin } from './renderer-origin'
import { matchesToken } from './local-service'
describe('Renderer connection boundaries',()=>{
 it('recognizes the packaged scheme without accepting null origins',()=>{expect(rendererOrigin('app://companion/index.html#/characters')).toBe('app://companion');expect(rendererOrigin('app://other/index.html')).toBeNull();expect(rendererOrigin('file:///C:/app/index.html')).toBeNull();expect(rendererOrigin('https://127.0.0.1.evil.test/')).toBeNull()})
 it('keeps development origins exact and rejects credentials',()=>{expect(rendererOrigin('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173');expect(rendererOrigin('http://user:password@localhost:5173/')).toBeNull()})
 it('requires the exact per-launch connection token',()=>{expect(matchesToken('abc','abc')).toBe(true);expect(matchesToken('ab','abc')).toBe(false);expect(matchesToken(undefined,'abc')).toBe(false);expect(matchesToken('abd','abc')).toBe(false)})
})
