import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Focus, Pause, Play, RotateCw, Shirt, Sparkles } from 'lucide-react'
import type { OutfitModelPiece } from '../../../shared/model'
import type { Character } from '../../../shared/domain'
import { api } from '../../lib/client'
import { iconUrl } from '../../lib/assets'
import { errorMessage } from '../../lib/notify'
import { AppSelect } from '../../components/AppSelect'
import { Badge, Button } from '../../components/ui/primitives'
import { Toggle } from '../../components/ui/toggle'
import { useGameData } from '../items/items'
import { animationChoices, bodyAnimationChoices } from './animate'
import { ItemModelScene, type ViewSubject } from './scene'
import './model-viewer.css'

/** Whether wearable items open on the stand-in, remembered between items and visits */
const onCharacterKey = (held: boolean) => held ? 'wowc:model-on-character' : 'wowc:model-armor-on-character'
/** Start on the stand-in where animation is available, while remembering the player's own choice */
function readOnCharacter(held: boolean) { try { return localStorage.getItem(onCharacterKey(held)) !== '0' } catch { return true } }

/** What to show: an item on its own or worn by a stand-in, or a creature such as a mount or pet */
export type ModelTarget =
  | { kind: 'item'; itemId: number; wearable: boolean; ownModel: boolean; held: boolean }
  | { kind: 'creature'; displayId: number }
  | { kind: 'outfit'; pieces: OutfitModelPiece[] }

/**
 * A model from the player's game files: drag to turn it, scroll to zoom, and play the animations it has. Items that
 * have models of their own show them; any wearable item can also be shown on a stand-in character
 */
export function ItemModelViewer({ target, name, character }: { target: ModelTarget; name: string; character?: Character | null }) {
  const { data: gameData } = useGameData()
  const ready = gameData?.state === 'ready'
  // Armor drawn on the body has no model of its own, so it starts on the stand-in; others follow the saved choice
  const [onCharacter, setOnCharacter] = useState(() => readOnCharacter(target.kind === 'item' && target.held))
  const worn = target.kind === 'item' && target.wearable && (!target.ownModel || onCharacter)
  const setWorn = (value: boolean) => { setOnCharacter(value); try { localStorage.setItem(onCharacterKey(target.kind === 'item' && target.held), value ? '1' : '0') } catch { /* storage unavailable */ } }
  const characterKey = [character?.id, character?.raceId, character?.sex, character?.customization]
  const key = target.kind === 'creature' ? ['creature-model', target.displayId]
    : target.kind === 'outfit' ? ['outfit-model', gameData?.indexedVersion, target.pieces, characterKey]
      : worn ? ['worn-model', target.itemId, characterKey] : ['item-model', target.itemId]
  const model = useQuery({
    queryKey: key,
    queryFn: async (): Promise<(ViewSubject & { unavailable?: number }) | null> => {
      if (target.kind === 'creature') { const found = await api.creatureModel(target.displayId); return found ? { kind: 'creature', model: found } : null }
      if (target.kind === 'outfit') {
        const found = await api.outfitModel(target.pieces, character?.id)
        return found ? { kind: 'worn', model: found, unavailable: new Set(found.unavailable).size } : null
      }
      if (worn) { const found = await api.wornModel(target.itemId, character?.id); return found ? { kind: 'worn', model: found } : null }
      const found = await api.itemModel(target.itemId)
      return found ? { kind: 'item', model: found } : null
    },
    enabled: ready,
    staleTime: Infinity,
    gcTime: target.kind === 'outfit' ? 30_000 : undefined,
  })
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<ItemModelScene | null>(null)
  const parts = useMemo(() => !model.data ? [] : model.data.kind === 'worn' ? [model.data.model.body, ...model.data.model.attached.map(entry => entry.part)] : model.data.model.parts, [model.data])
  const animations = useMemo(() => model.data?.kind === 'worn' ? bodyAnimationChoices(model.data.model.body) : animationChoices(parts), [model.data, parts])
  const [animation, setAnimation] = useState<number | null>(null)
  const [playing, setPlaying] = useState(() => document.documentElement.dataset.reducedMotion !== 'true' && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [turning, setTurning] = useState(false)
  const [sceneError, setSceneError] = useState<{ subject: ViewSubject; message: string } | null>(null)
  const failed = sceneError?.subject === model.data ? sceneError?.message : null
  const shown = animation != null && animations.some(entry => entry.id === animation) ? animation : animations[0]?.id ?? null

  useEffect(() => {
    const element = canvas.current
    const subject = model.data
    if (!subject || !element) return
    let built: ItemModelScene
    try { built = new ItemModelScene(element, subject, iconUrl) } catch (error) { setSceneError({ subject, message: errorMessage(error) }); return }
    scene.current = built
    const lost = (event: Event) => { event.preventDefault(); setSceneError({ subject, message: 'The 3D view stopped' }) }
    element.addEventListener('webglcontextlost', lost)
    const observer = new ResizeObserver(() => built.resize())
    observer.observe(element)
    return () => { observer.disconnect(); element.removeEventListener('webglcontextlost', lost); built.dispose(); scene.current = null }
  }, [model.data, failed])
  useEffect(() => { scene.current?.setAnimation(shown) }, [shown, model.data, failed])
  useEffect(() => { if (scene.current) scene.current.playing = playing }, [playing, model.data, failed])
  useEffect(() => { scene.current?.setTurning(turning) }, [turning, model.data, failed])

  const particles = parts.some(part => part.particles > 0)
  const message = !ready ? 'Prepare local game data in Settings to see models'
    : model.isPending ? 'Reading the model from your game files…'
      : model.isError ? errorMessage(model.error)
        : !model.data ? (target.kind === 'creature' ? 'This creature has no model in your game files'
          : target.kind === 'outfit' || worn ? 'The character model could not be loaded from your game files'
            : 'This item has no model of its own · try it on the character')
          : failed
  return (
    <div className="model-viewer">
      <div className="model-viewer-controls">
        {target.kind === 'item' && target.wearable && (
          <Toggle variant="outline" pressed={worn} disabled={!target.ownModel} onPressedChange={value => { setWorn(value); setAnimation(null) }} aria-label="Show it on a character"><Shirt size={14} aria-hidden="true" />On character</Toggle>
        )}
        {model.isError && <Button onClick={() => void model.refetch()}>Retry model</Button>}
        {failed && <Button onClick={() => setSceneError(null)}>Restart 3D preview</Button>}
        {model.data && !failed && (
          <>
            {animations.length > 1 && <AppSelect label="Animation" value={String(shown)} options={animations.map(entry => ({ value: String(entry.id), label: entry.name }))} onValueChange={value => { setAnimation(Number(value)); setPlaying(true) }} />}
            <Button onClick={() => setPlaying(value => !value)} aria-pressed={!playing}>{playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{playing ? 'Pause' : 'Play'}</Button>
            <Toggle variant="outline" pressed={turning} onPressedChange={setTurning} aria-label="Turn the model"><RotateCw size={14} aria-hidden="true" />Turn</Toggle>
            <Button onClick={() => scene.current?.fit()}><Focus size={14} aria-hidden="true" />Reset view</Button>
            <span className="model-viewer-chips">
              {animations.length === 1 && <Badge>{animations[0]!.name}</Badge>}
              {model.data.kind === 'item' && model.data.model.parts.length > 1 && <Badge>{model.data.model.parts.length} pieces</Badge>}
              {model.data.kind === 'worn' && <Badge><Shirt size={12} aria-hidden="true" />{
                model.data.model.appearance === 'synced' ? character?.name ?? 'Synced appearance'
                  : model.data.model.appearance === 'default' ? 'Default customization' : 'Stand-in human'
              }</Badge>}
              {particles && <Badge><Sparkles size={12} aria-hidden="true" />Particle effects</Badge>}
            </span>
          </>
        )}
      </div>
      <div className="model-viewer-stage" data-empty={message ? true : undefined}>
        {model.data && !failed && <canvas ref={canvas} aria-label={`${name} 3D model · drag to turn, scroll to zoom`} />}
        {message && <p role={model.isError || failed ? 'alert' : 'status'}><Box size={18} aria-hidden="true" />{message}</p>}
      </div>
      {!!model.data?.unavailable && <p className="muted small" role="status">Some outfit pieces could only be shown in part or were unavailable in 3D · use the WoW preview to check the full look</p>}
    </div>
  )
}
