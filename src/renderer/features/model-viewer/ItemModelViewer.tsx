import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Focus, Pause, Play, RotateCw, Shirt, Sparkles } from 'lucide-react'
import { api } from '../../lib/client'
import { iconUrl } from '../../lib/assets'
import { errorMessage } from '../../lib/notify'
import { AppSelect } from '../../components/AppSelect'
import { Badge, Button } from '../../components/ui/primitives'
import { Toggle } from '../../components/ui/toggle'
import { useGameData } from '../items/items'
import { animationChoices } from './animate'
import { ItemModelScene, type ViewSubject } from './scene'
import './model-viewer.css'

/** What to show: an item on its own or worn by a stand-in, or a creature such as a mount or pet */
export type ModelTarget = { kind: 'item'; itemId: number; wearable: boolean; ownModel: boolean } | { kind: 'creature'; displayId: number }

/**
 * A model from the player's game files: drag to turn it, scroll to zoom, and play the animations it has. Items that
 * have models of their own show them; any wearable item can also be shown on a stand-in character
 */
export function ItemModelViewer({ target, name }: { target: ModelTarget; name: string }) {
  const ready = useGameData().data?.state === 'ready'
  // Armor drawn on the body has no model of its own, so it starts on the stand-in
  const [worn, setWorn] = useState(target.kind === 'item' && !target.ownModel)
  const key = target.kind === 'creature' ? ['creature-model', target.displayId] : [worn ? 'worn-model' : 'item-model', target.itemId]
  const model = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ViewSubject | null> => {
      if (target.kind === 'creature') { const found = await api.creatureModel(target.displayId); return found ? { kind: 'creature', model: found } : null }
      if (worn) { const found = await api.wornModel(target.itemId); return found ? { kind: 'worn', model: found } : null }
      const found = await api.itemModel(target.itemId)
      return found ? { kind: 'item', model: found } : null
    },
    enabled: ready,
    staleTime: Infinity,
  })
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<ItemModelScene | null>(null)
  const parts = useMemo(() => !model.data ? [] : model.data.kind === 'worn' ? [model.data.model.body] : model.data.model.parts, [model.data])
  const animations = useMemo(() => animationChoices(parts), [parts])
  const [animation, setAnimation] = useState<number | null>(null)
  const [playing, setPlaying] = useState(true)
  const [turning, setTurning] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const shown = animation != null && animations.some(entry => entry.id === animation) ? animation : animations[0]?.id ?? null

  useEffect(() => {
    const element = canvas.current
    if (!model.data || !element) return
    let built: ItemModelScene
    try { built = new ItemModelScene(element, model.data, iconUrl) } catch (error) { setFailed(errorMessage(error)); return }
    scene.current = built
    const lost = (event: Event) => { event.preventDefault(); setFailed('The 3D view stopped · open the item again') }
    element.addEventListener('webglcontextlost', lost)
    const observer = new ResizeObserver(() => built.resize())
    observer.observe(element)
    return () => { observer.disconnect(); element.removeEventListener('webglcontextlost', lost); built.dispose(); scene.current = null }
  }, [model.data])
  useEffect(() => { scene.current?.setAnimation(shown) }, [shown, model.data])
  useEffect(() => { if (scene.current) scene.current.playing = playing }, [playing, model.data])
  useEffect(() => { scene.current?.setTurning(turning) }, [turning, model.data])

  const particles = parts.some(part => part.particles > 0)
  const message = !ready ? 'Prepare local game data in Settings to see models'
    : model.isPending ? 'Reading the model from your game files…'
      : model.isError ? errorMessage(model.error)
        : !model.data ? (target.kind === 'creature' ? 'This creature has no model in your game files' : "This item has no model of its own · try it on the character")
          : failed
  return (
    <div className="model-viewer">
      <div className="model-viewer-stage" data-empty={message ? true : undefined}>
        {model.data && !failed && <canvas ref={canvas} aria-label={`${name} 3D model · drag to turn, scroll to zoom`} />}
        {message && <p role={model.isError || failed ? 'alert' : 'status'}><Box size={18} aria-hidden="true" />{message}</p>}
      </div>
      <div className="model-viewer-controls">
        {target.kind === 'item' && target.wearable && (
          <Toggle variant="outline" pressed={worn} onPressedChange={value => { setWorn(value); setAnimation(null) }} aria-label="Show it on a character"><Shirt size={14} aria-hidden="true" />On character</Toggle>
        )}
        {model.data && !failed && (
          <>
            {animations.length > 1 && <AppSelect label="Animation" value={String(shown)} options={animations.map(entry => ({ value: String(entry.id), label: entry.name }))} onValueChange={value => setAnimation(Number(value))} />}
            <Button onClick={() => setPlaying(value => !value)} aria-pressed={!playing}>{playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{playing ? 'Pause' : 'Play'}</Button>
            <Toggle variant="outline" pressed={turning} onPressedChange={setTurning} aria-label="Turn the model"><RotateCw size={14} aria-hidden="true" />Turn</Toggle>
            <Button onClick={() => scene.current?.fit()}><Focus size={14} aria-hidden="true" />Reset view</Button>
            <span className="model-viewer-chips">
              {animations.length === 1 && <Badge>{animations[0]!.name}</Badge>}
              {model.data.kind === 'item' && model.data.model.parts.length > 1 && <Badge>{model.data.model.parts.length} pieces</Badge>}
              {model.data.kind === 'worn' && <Badge><Shirt size={12} aria-hidden="true" />Stand-in human</Badge>}
              {particles && <Badge tone="neutral"><Sparkles size={12} aria-hidden="true" />Particle effects not shown</Badge>}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
