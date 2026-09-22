import { useCallback, useEffect, useRef } from 'react'
import { measure } from './trace'

type Draw = (context: CanvasRenderingContext2D, width: number, height: number) => void

// `signature` is a cheap summary of everything the draw depends on. Without it
// a canvas repaints on every render of the app, which during a drag is every
// canvas on screen, sixty times a second, for one that actually changed.
// The plain form: the canvas repaints when its signature changes, or every
// frame while animating.
export function useCanvas(draw: Draw, animate = false, signature?: string | number) {
  return useCanvasControl(draw, animate, signature).canvasRef
}

// The form that also hands back a repaint, for a draw that reads something
// kept in a ref rather than in state: the pointer, say. Asking for a repaint
// costs a frame; changing state to get one costs a render of the component
// and everything under it first.
export function useCanvasControl(draw: Draw, animate = false, signature?: string | number) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  const frameRef = useRef(0)
  const paintedRef = useRef<string | number | undefined>(undefined)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    // a hidden canvas measures zero, and drawing into it throws: one throw
    // inside the animation loop stops every canvas on the page
    if (width === 0 || height === 0) return
    const backingWidth = Math.round(width * ratio)
    const backingHeight = Math.round(height * ratio)

    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth
      canvas.height = backingHeight
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    // named after the canvas's data-trace, so the trace panel can tell the
    // waveform's draw from the overview's
    measure(`${canvas.dataset.trace ?? 'canvas'} draw`, () => drawRef.current(context, width, height))
  }, [])

  const signatureRef = useRef(signature)

  const schedule = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(render)
  }, [render])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      paintedRef.current = undefined
      schedule()
    })
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frameRef.current)
      observer.disconnect()
    }
  }, [schedule])

  useEffect(() => {
    drawRef.current = draw
    signatureRef.current = signature
  })

  useEffect(() => {
    if (animate) return
    if (signature !== undefined && signature === paintedRef.current) return
    paintedRef.current = signature
    schedule()
  })

  useEffect(() => {
    if (!animate) return

    let frame = requestAnimationFrame(function tick() {
      try {
        render()
        paintedRef.current = signatureRef.current
      } catch {
        // a failed frame must not take the loop down with it
      }
      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [animate, render])

  return { canvasRef, repaint: schedule }
}
