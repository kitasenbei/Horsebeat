import { useCallback, useEffect, useRef } from 'react'

type Draw = (context: CanvasRenderingContext2D, width: number, height: number) => void

export function useCanvas(draw: Draw, animate = false) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  const frameRef = useRef(0)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const backingWidth = Math.round(width * ratio)
    const backingHeight = Math.round(height * ratio)

    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth
      canvas.height = backingHeight
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    drawRef.current(context, width, height)
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(render)
  }, [render])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(schedule)
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frameRef.current)
      observer.disconnect()
    }
  }, [schedule])

  useEffect(() => {
    drawRef.current = draw
  })

  useEffect(() => {
    if (animate) return
    schedule()
  })

  useEffect(() => {
    if (!animate) return

    let frame = requestAnimationFrame(function tick() {
      render()
      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [animate, render])

  return canvasRef
}
