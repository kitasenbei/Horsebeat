import { useCallback, useEffect, useRef, useState } from 'react'

export function useAudio(file: File | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
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
      setPosition(audio.duration > 0 ? audio.currentTime / audio.duration : 0)
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
      setPosition(0)
      setDuration(0)
    }
  }, [file])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [file, volume, muted])

  useEffect(() => {
    if (!playing) return

    let frame = requestAnimationFrame(function tick() {
      const audio = audioRef.current
      if (audio && audio.duration > 0) setPosition(audio.currentTime / audio.duration)
      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [playing])

  const seek = useCallback((next: number) => {
    const audio = audioRef.current
    if (!audio || !(audio.duration > 0)) return
    const clamped = Math.min(1, Math.max(0, next))
    audio.currentTime = clamped * audio.duration
    setPosition(clamped)
  }, [])

  const reset = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
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
    duration,
    volume,
    muted,
    toggle,
    seek,
    reset,
    setVolume,
    setMuted,
  }
}
