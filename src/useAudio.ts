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
  // a drag on the playhead: the audio and the ref move with every frame of
  // it, the app's position once at its end. While it lasts the views animate
  // as they do in playback, reading the ref
  const [scrubbing, setScrubbing] = useState(false)
  const scrubbingRef = useRef(false)

  useEffect(() => {
    if (!file) {
      audioRef.current = null
      return
    }

    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audioRef.current = audio

    // the app's position only moves when the song is not playing: a seek, or
    // the moment it stops. While it plays the frame loop below keeps the ref,
    // and everything that shows the playhead reads that; setting state a few
    // times a second rendered the whole app for a number nothing needed
    const land = () => {
      const next = audio.duration > 0 ? audio.currentTime / audio.duration : 0
      positionRef.current = next
      setPosition(next)
    }
    const onPlay = () => setPlaying(true)
    const onStop = () => {
      setPlaying(false)
      land()
    }
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onTime = () => {
      if (audio.paused && !scrubbingRef.current) land()
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

  // the level while it is being dragged: straight onto the element, with no
  // state and so no render of the app for every frame of the drag. The drag
  // commits once through setVolume when it ends
  const previewVolume = useCallback((next: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.min(1, Math.max(0, next))
    audio.muted = false
  }, [])

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

  const beginScrub = useCallback(() => {
    if (scrubbingRef.current) return
    scrubbingRef.current = true
    setScrubbing(true)
  }, [])

  const scrub = useCallback((next: number) => {
    const audio = audioRef.current
    if (!audio || !(audio.duration > 0)) return
    const clamped = Math.min(1, Math.max(0, next))
    audio.currentTime = clamped * audio.duration
    positionRef.current = clamped
  }, [])

  const endScrub = useCallback(() => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    setScrubbing(false)
    setPosition(positionRef.current)
  }, [])

  const playFrom = useCallback((next: number) => {
    const audio = audioRef.current
    if (!audio || !(audio.duration > 0)) return
    const clamped = Math.min(1, Math.max(0, next))
    audio.currentTime = clamped * audio.duration
    positionRef.current = clamped
    setPosition(clamped)
    void audio.play()
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
    playFrom,
    reset,
    setVolume,
    setMuted,
    setRate,
    previewVolume,
    scrubbing,
    beginScrub,
    scrub,
    endScrub,
  }
}
