import { useCallback, useEffect, useRef, useState } from 'react'

const DRIFT = 0.25
const CORRECTION = 0.03

export function useAudio(file: File | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const positionRef = useRef(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (!file) {
      audioRef.current = null
      return
    }

    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audioRef.current = audio

    const onPlay = () => setPlaying(true)
    const onStop = () => setPlaying(false)
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onTime = () => {
      const next = audio.duration > 0 ? audio.currentTime / audio.duration : 0
      if (audio.paused) positionRef.current = next
      setPosition(next)
    }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onStop)
    audio.addEventListener('ended', onStop)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('seeked', onTime)

    return () => {
      audio.pause()
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onStop)
      audio.removeEventListener('ended', onStop)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('seeked', onTime)
      URL.revokeObjectURL(url)
      setPlaying(false)
      positionRef.current = 0
      setPosition(0)
      setDuration(0)
    }
  }, [file])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
    audio.playbackRate = rate
  }, [file, volume, muted, rate])

  useEffect(() => {
    if (!playing) return

    const audio = audioRef.current
    if (!audio) return

    let anchor = audio.currentTime
    let stamp = performance.now()
    let lastClock = audio.currentTime
    let previous = anchor

    let frame = requestAnimationFrame(function tick() {
      if (audio.duration > 0) {
        const now = performance.now()
        const rate = audio.playbackRate || 1
        let estimate = anchor + ((now - stamp) / 1000) * rate

        const clock = audio.currentTime
        if (clock !== lastClock) {
          lastClock = clock
          const error = clock - estimate

          if (Math.abs(error) > DRIFT) {
            anchor = clock
            stamp = now
            estimate = clock
            previous = clock
          } else {
            anchor += error * CORRECTION
          }
        }

        estimate = Math.max(previous, Math.min(audio.duration, estimate))
        previous = estimate
        positionRef.current = estimate / audio.duration
      }

      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [playing])

  const seek = useCallback((next: number) => {
    const audio = audioRef.current
    if (!audio || !(audio.duration > 0)) return
    const clamped = Math.min(1, Math.max(0, next))
    audio.currentTime = clamped * audio.duration
    positionRef.current = clamped
    setPosition(clamped)
  }, [])

  const reset = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    positionRef.current = 0
    setPosition(0)
  }, [])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [])

  return {
    playing,
    position,
    positionRef,
    duration,
    volume,
    muted,
    rate,
    toggle,
    seek,
    reset,
    setVolume,
    setMuted,
    setRate,
  }
}
