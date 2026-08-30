'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

/* ═══════════════ Scales & Modes ═══════════════ */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

interface ScaleDef { name: string; intervals: number[]; mood: string }

const SCALES: Record<string, ScaleDef> = {
  ionian:     { name: 'Major (Ionian)',      intervals: [0,2,4,5,7,9,11],  mood: 'bright, resolved' },
  dorian:     { name: 'Dorian',              intervals: [0,2,3,5,7,9,10],  mood: 'wistful, modal' },
  phrygian:   { name: 'Phrygian',            intervals: [0,1,3,5,7,8,10],  mood: 'dark, tension' },
  lydian:     { name: 'Lydian',              intervals: [0,2,4,6,7,9,11],  mood: 'dreamy, floating' },
  mixolydian: { name: 'Mixolydian',          intervals: [0,2,4,5,7,9,10],  mood: 'open, groovy' },
  aeolian:    { name: 'Natural Minor (Aeolian)', intervals: [0,2,3,5,7,8,10], mood: 'melancholy' },
  locrian:    { name: 'Locrian',             intervals: [0,1,3,5,6,8,10],  mood: 'unstable, alien' },
  harmMinor:  { name: 'Harmonic Minor',      intervals: [0,2,3,5,7,8,11],  mood: 'dramatic, exotic' },
  meloMinor:  { name: 'Melodic Minor',       intervals: [0,2,3,5,7,9,11],  mood: 'complex, cinematic' },
  majPent:    { name: 'Major Pentatonic',    intervals: [0,2,4,7,9],       mood: 'open, sunny' },
  minPent:    { name: 'Minor Pentatonic',    intervals: [0,3,5,7,10],      mood: 'spacious, raw' },
  blues:      { name: 'Blues',               intervals: [0,3,5,6,7,10],    mood: 'gritty, soulful' },
  wholeTone:  { name: 'Whole Tone',          intervals: [0,2,4,6,8,10],    mood: 'elusive, glassy' },
  phrygDom:   { name: 'Phrygian Dominant',   intervals: [0,1,4,5,7,8,10],  mood: 'flamenco, fierce' },
  lydianDom:  { name: 'Lydian Dominant',     intervals: [0,2,4,6,7,9,10],  mood: 'slick, jazzy' },
  chromatic:  { name: 'Chromatic (free)',    intervals: [0,1,2,3,4,5,6,7,8,9,10,11], mood: 'all pitches' },
}

const F_MIN = 70, F_MAX = 2200
const BINS = 56
const VOICES = 22

function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)) }

/* minimal stroke icons — no emoji */
const IcPlay = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>
)
const IcPause = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>
)
const IcTune = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h16"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
)
const IcChevron = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
)
const IcUpload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 16V5m0 0l-4 4m4-4l4 4"/><path d="M4 19h16"/></svg>
)

/* ═══════════════ Component ═══════════════ */

export default function Home() {
  const imgCanvasRef = useRef<HTMLCanvasElement>(null)
  const glowCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sourceImgRef = useRef<HTMLImageElement | null>(null)
  const audioRef = useRef<{
    ctx: AudioContext; master: GainNode; voices: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode }[]
    reverbWet: GainNode
  } | null>(null)
  const scanRef = useRef(0)
  const prevAmpRef = useRef<Float32Array | null>(null)
  const lastFireRef = useRef<Float32Array | null>(null)
  const lastColRef = useRef({ x: -1, t: 0 })
  const hueWaveRef = useRef<OscillatorType>('sine')
  const playingRef = useRef(false)
  const holdRef = useRef(false)
  const rafRef = useRef(0)
  const imgDataRef = useRef<ImageData | null>(null)
  const dimsRef = useRef({ w: 0, h: 0 })
  const settingsRef = useRef({ speed: 0.12, dir: 'lr' as 'lr'|'rl'|'tb', scaleKey: 'auto', rootNote: 'auto', threshold: 0.14, reverb: 0.4 })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [hasImage, setHasImage] = useState(false)
  const [analysis, setAnalysis] = useState<{ scaleKey: string; rootNote: number; colors: string[]; reason: string; ranked: {key:string; score:number}[] } | null>(null)
  const [scaleKey, setScaleKey] = useState('auto')
  const [rootNote, setRootNote] = useState('auto')
  const [speed, setSpeed] = useState(0.12)
  const [dir, setDir] = useState<'lr'|'rl'|'tb'>('lr')
  const [reverb, setReverb] = useState(0.4)
  const [threshold, setThreshold] = useState(0.14)
  const [showUI, setShowUI] = useState(true)
  const [showTitle, setShowTitle] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)

  useEffect(() => { settingsRef.current = { speed, dir, scaleKey, rootNote, threshold, reverb } })

  /* ── Auto-hide UI (cinema style) ── */
  const pokeUI = useCallback(() => {
    setShowUI(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (playingRef.current && !showSettings && !demoOpen) setShowUI(false)
    }, 2600)
  }, [showSettings, demoOpen])
  useEffect(() => { pokeUI() }, [pokeUI])

  /* ── Color analysis → scale/mode detection ── */
  const analyzeImage = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const data = ctx.getImageData(0, 0, w, h).data
    let hx = 0, hy = 0, sat = 0, light = 0, n = 0
    const colorCounts = new Map<string, { count: number; r: number; g: number; b: number }>()
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const l = (max + min) / 2
      const d = max - min
      let hue = 0
      if (d > 0.001) {
        const s = d / (1 - Math.abs(2 * l - 1))
        if (max === r) hue = 60 * (((g - b) / d) % 6)
        else if (max === g) hue = 60 * ((b - r) / d + 2)
        else hue = 60 * ((r - g) / d + 4)
        if (hue < 0) hue += 360
        hx += Math.cos(hue * Math.PI / 180); hy += Math.sin(hue * Math.PI / 180)
        sat += s
      }
      light += l
      n++
      const key = `${Math.round(r * 5)}-${Math.round(g * 5)}-${Math.round(b * 5)}`
      const c = colorCounts.get(key) ?? { count: 0, r: data[i], g: data[i + 1], b: data[i + 2] }
      c.count++
      colorCounts.set(key, c)
    }
    let hue = (Math.atan2(hy, hx) * 180 / Math.PI + 360) % 360
    sat /= n; light /= n

    const colors = [...colorCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5)
      .map(c => `rgb(${c.r},${c.g},${c.b})`)

    const warm = hue < 75 || hue > 320
    const cool = hue >= 150 && hue <= 270
    const bright = light > 0.55, dark = light < 0.35
    const vivid = sat > 0.45, muted = sat < 0.22

    const scores: Record<string, number> = {}
    for (const k of Object.keys(SCALES)) scores[k] = 0.1

    if (warm && bright) { scores.ionian += 2.6; scores.majPent += 2.2; scores.lydian += 1.8 }
    if (warm && vivid) { scores.phrygDom += 2.2; scores.mixolydian += 1.6; scores.majPent += 1.2 }
    if (warm && dark) { scores.phrygian += 2.4; scores.harmMinor += 1.8; scores.minPent += 1.4 }
    if (cool && muted) { scores.dorian += 2.4; scores.aeolian += 1.6 }
    if (cool && vivid) { scores.lydian += 2.2; scores.mixolydian += 1.5 }
    if (cool && dark) { scores.aeolian += 2.4; scores.locrian += 1.2; scores.minPent += 1.6 }
    if (muted) { scores.minPent += 1.4; scores.majPent += 1.0; scores.dorian += 0.8 }
    if (dark && sat < 0.15) { scores.blues += 1.6; scores.minPent += 1.0 }
    if (light > 0.7 && sat < 0.2) { scores.lydian += 1.5; scores.wholeTone += 1.2 }
    if (sat > 0.6) { scores.harmMinor += 1.2; scores.phrygDom += 1.0; scores.lydianDom += 0.9 }
    if (hue >= 75 && hue < 150) { scores.dorian += 1.6; scores.mixolydian += 1.0 }
    if (hue >= 270 && hue < 320) { scores.lydian += 1.6; scores.meloMinor += 1.0 }
    scores.chromatic = 0.05

    const ranked = Object.entries(scores).map(([key, score]) => ({ key, score }))
      .sort((a, b) => b.score - a.score)

    const rootNoteNum = Math.round((1 - hue / 360) * 12) % 12

    const top = SCALES[ranked[0].key]
    const reason = `${warm ? 'warm' : cool ? 'cool' : 'neutral'} ${dark ? 'dark' : bright ? 'bright' : 'mid'} tones (H${Math.round(hue)}° · S${Math.round(sat * 100)}% · L${Math.round(light * 100)}%) → ${top.mood}`
    // hue → timbre: warm=saw, cool=sine bell, green=triangle, purple=soft square, mono=FM-ish
    let waveform: OscillatorType = 'sine'
    if (muted) waveform = 'triangle'
    else if (warm) waveform = 'sawtooth'
    else if (hue >= 75 && hue < 150) waveform = 'triangle'
    else if (hue >= 270 && hue < 320) waveform = 'square'
    else if (cool) waveform = 'sine'
    hueWaveRef.current = waveform
    setAnalysis({ scaleKey: ranked[0].key, rootNote: rootNoteNum, colors, reason, ranked })
    return { ranked, rootNoteNum }
  }, [])

  /* ── Draw image cover-fit to screen ── */
  const renderCover = useCallback(() => {
    const img = sourceImgRef.current
    const canvas = imgCanvasRef.current
    if (!img || !canvas) return
    const w = window.innerWidth, h = window.innerHeight
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    const scale = Math.max(w / img.width, h / img.height)
    const dw = img.width * scale, dh = img.height * scale
    const dx = (w - dw) / 2, dy = (h - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
    imgDataRef.current = ctx.getImageData(0, 0, w, h)
    dimsRef.current = { w, h }
    const glow = glowCanvasRef.current
    if (glow) { glow.width = w; glow.height = h }
  }, [])

  useEffect(() => {
    if (!hasImage) return
    const onResize = () => renderCover()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [hasImage, renderCover])

  /* ── Load image ── */
  const loadImage = useCallback((src: string) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      sourceImgRef.current = img
      setHasImage(true)
      requestAnimationFrame(() => {
        renderCover()
        const canvas = imgCanvasRef.current!
        analyzeImage(canvas.getContext('2d', { willReadFrequently: true })!, canvas.width, canvas.height)
        // title card moment
        setShowTitle(true)
        setTimeout(() => setShowTitle(false), 3600)
        playingRef.current = false
        setPlaying(false)
        scanRef.current = 0
      })
    }
    img.src = src
  }, [analyzeImage, renderCover])

  const loadDemo = useCallback((kind: 'sunset' | 'ocean' | 'forest' | 'noir') => {
    const c = document.createElement('canvas')
    c.width = 1600; c.height = 1000
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const g = ctx.createLinearGradient(0, 0, 0, 1000)
    const presets = {
      sunset: ['#2b1055', '#7597de', '#ff9e5e', '#ffd39b'],
      ocean: ['#020d1f', '#0a3d62', '#1c8fb0', '#9be3e8'],
      forest: ['#0a1a0d', '#1d4d2b', '#3f8b4f', '#b8d99a'],
      noir: ['#0a0a0c', '#1f1f26', '#4a4a55', '#c9c9d4'],
    } as const
    const stops = presets[kind]
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1600, 1000)
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * 1600, y = Math.random() * 1000
      const rg = ctx.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 120)
      const col = stops[Math.floor(Math.random() * stops.length)]
      rg.addColorStop(0, col + 'cc')
      rg.addColorStop(1, col + '00')
      ctx.fillStyle = rg
      ctx.fillRect(x - 160, y - 160, 320, 320)
    }
    loadImage(c.toDataURL())
  }, [loadImage])

  /* ── Audio engine ── */
  const ensureAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.ctx.resume(); return audioRef.current }
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    const reverb = ctx.createDelay(2)
    reverb.delayTime.value = 0.31
    const fb = ctx.createGain(); fb.gain.value = 0.5
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2800
    const reverbWet = ctx.createGain(); reverbWet.gain.value = 0.4
    reverb.connect(fb).connect(damp).connect(reverb)
    reverb.connect(reverbWet).connect(master)

    const voices = Array.from({ length: VOICES }, () => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 220
      const gain = ctx.createGain()
      gain.gain.value = 0
      const pan = ctx.createStereoPanner()
      osc.connect(gain).connect(pan)
      pan.connect(master)
      pan.connect(reverb)
      osc.start()
      return { osc, gain, pan }
    })
    audioRef.current = { ctx, master, voices, reverbWet }
    return audioRef.current
  }, [])

  const quantize = useCallback((freq: number, rootMidi: number, intervals: number[]) => {
    const targetMidi = 69 + 12 * Math.log2(freq / 440)
    const rel = targetMidi - rootMidi
    const rounded = Math.round(rel)
    let best = rounded, bestDist = Math.abs(rounded - rel) + 1
    for (let s = rounded - 7; s <= rounded + 7; s++) {
      const pc = ((s % 12) + 12) % 12
      if (intervals.includes(pc)) {
        const d = Math.abs(s - rel)
        if (d < bestDist) { bestDist = d; best = s }
      }
    }
    const finalMidi = rootMidi + best
    return 440 * Math.pow(2, (finalMidi - 69) / 12)
  }, [])


  /* discrete plucked note — timbre from image hue */
  const pluckNote = useCallback((freq: number, velocity: number, pan: number, wave: OscillatorType) => {
    const audio = audioRef.current
    if (!audio) return
    const { ctx, master, reverbWet } = audio
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = wave
    osc.frequency.value = freq
    // low notes get a sub-octave sine for weight
    const g = ctx.createGain()
    const bright = clamp(velocity)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16 * (0.3 + bright * 0.7), t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 + bright * 1.3) // brighter pixel = longer ring
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1200 + bright * 5200
    osc.connect(g).connect(lp).connect(p)
    p.connect(master)
    p.connect(reverbWet) // wet path: p -> reverbWet already includes mix? keep simple: also to delay line input
    osc.start(t)
    osc.stop(t + 2.2)
  }, [])

  /* ── Sonify one scan position ── */
  const sonify = useCallback((pos: number) => {
    const audio = audioRef.current
    const imgData = imgDataRef.current
    if (!audio || !imgData) return
    const { w, h } = dimsRef.current
    const st = settingsRef.current
    const a = analysis ?? { scaleKey: 'minPent', rootNote: 9 }
    const scaleDef = SCALES[st.scaleKey === 'auto' ? a.scaleKey : st.scaleKey] ?? SCALES.minPent
    const rootPc = st.rootNote === 'auto' ? a.rootNote : NOTE_NAMES.indexOf(st.rootNote)
    const rootMidi = 36 + (((rootPc % 12) + 12) % 12)

    const vertical = st.dir === 'tb'
    const crossLen = vertical ? w : h
    const px = vertical ? 0 : Math.round(pos * (w - 1))
    const py = vertical ? Math.round(pos * (h - 1)) : 0
    const colKey = vertical ? py : px

    interface Bin { freq: number; amp: number; t: number }
    const bins: Bin[] = []
    if (!prevAmpRef.current || prevAmpRef.current.length !== BINS) prevAmpRef.current = new Float32Array(BINS)
    const prevAmp = prevAmpRef.current

    for (let i = 0; i < BINS; i++) {
      const t = i / (BINS - 1)
      const along = Math.round(t * (crossLen - 1))
      const x = vertical ? along : px
      const y = vertical ? py : along
      const idx = (y * w + x) * 4
      const r = imgData.data[idx] / 255, g = imgData.data[idx + 1] / 255, b = imgData.data[idx + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const amp = clamp(lum * 0.85 + (mx - mn) * 0.3)
      if (amp > st.threshold * 0.5) {
        const cont = F_MAX * Math.pow(F_MIN / F_MAX, t)
        bins.push({ freq: quantize(cont, rootMidi, scaleDef.intervals), amp, t })
      }
    }
    bins.sort((A, B) => B.amp - A.amp)

    /* pad: quiet sustained bed from top bins */
    const now = audio.ctx.currentTime
    audio.reverbWet.gain.setTargetAtTime(st.reverb, now, 0.1)
    audio.voices.forEach((v, i) => {
      const bin = bins[i]
      if (bin && bin.amp > st.threshold) {
        v.osc.frequency.setTargetAtTime(bin.freq, now, 0.05)
        v.gain.gain.setTargetAtTime(Math.pow(bin.amp, 2) * 0.045, now, 0.12) // quiet bed
        v.pan.pan.setTargetAtTime((bin.t - 0.5) * 1.4, now, 0.15)
      } else {
        v.gain.gain.setTargetAtTime(0, now, 0.15)
      }
    })

    /* plucks: edge-triggered accents + level-triggered keep-alive */
    const nowMs = performance.now()
    const dwell = nowMs - lastColRef.current.t
    const prevX = lastColRef.current.x
    const newCol = colKey !== prevX && dwell > 36
    if (!lastFireRef.current) lastFireRef.current = new Float32Array(BINS)
    const lastFire = lastFireRef.current

    // loop wraparound: reset prev amps to avoid false mega-edge burst
    if (newCol && prevX > 0 && colKey < prevX - ((vertical ? h : w) * 0.5)) {
      for (let i = 0; i < BINS; i++) prevAmp[i] = 0
      lastColRef.current = { x: colKey, t: nowMs }
    } else if (newCol) {
      lastColRef.current = { x: colKey, t: nowMs }
      const events: { i: number; delta: number; pri: number }[] = []
      const seen = new Set<number>()
      for (const bin of bins) {
        const bi = Math.round(bin.t * (BINS - 1))
        if (seen.has(bi)) continue
        seen.add(bi)
        const delta = bin.amp - prevAmp[bi]
        // rising edge → accent note (high priority)
        if (delta > 0.05 && bin.amp > st.threshold) {
          events.push({ i: bi, delta, pri: delta + 1 })
        }
        // bright row that hasn't fired recently → keep-alive note
        else if (bin.amp > st.threshold + 0.2 && nowMs - lastFire[bi] > 280) {
          events.push({ i: bi, delta: 0.02, pri: bin.amp })
        }
      }
      events.sort((A, B) => B.pri - A.pri)
      const wave = hueWaveRef.current
      events.slice(0, 5).forEach((ev, k) => {
        const t = ev.i / (BINS - 1)
        const amp = Math.max(prevAmp[ev.i] + ev.delta, st.threshold + 0.05)
        lastFire[ev.i] = nowMs + k * 55
        const cont = F_MAX * Math.pow(F_MIN / F_MAX, t)
        const freq = quantize(cont, rootMidi, scaleDef.intervals)
        window.setTimeout(() => pluckNote(freq, amp, (t - 0.5) * 1.6, wave), k * 55)
      })
    }

    // update prev amps for next column
    for (let i = 0; i < BINS; i++) {
      const t = i / (BINS - 1)
      const along = Math.round(t * (crossLen - 1))
      const x = vertical ? along : px
      const y = vertical ? py : along
      const idx = (y * w + x) * 4
      prevAmp[i] = clamp(0.2126 * imgData.data[idx] / 255 + 0.7152 * imgData.data[idx + 1] / 255 + 0.0722 * imgData.data[idx + 2] / 255)
    }
  }, [analysis, quantize, pluckNote])

  /* ── Render loop ── */
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const glow = glowCanvasRef.current
      if (!glow || !hasImage) return
      const gctx = glow.getContext('2d')!
      const { w, h } = dimsRef.current
      gctx.clearRect(0, 0, w, h)

      const st = settingsRef.current
      const vertical = st.dir === 'tb'
      const pos = scanRef.current
      const x = vertical ? 0 : pos * w
      const y = vertical ? pos * h : 0

      const from = st.dir === 'rl' ? x : x - 70
      const grad = vertical
        ? gctx.createLinearGradient(0, y - 70, 0, y)
        : gctx.createLinearGradient(from, 0, from + 70, 0)
      grad.addColorStop(0, 'rgba(63,210,215,0)')
      grad.addColorStop(1, 'rgba(63,210,215,0.22)')
      gctx.fillStyle = grad
      if (vertical) gctx.fillRect(0, Math.max(0, y - 70), w, 70)
      else gctx.fillRect(Math.max(0, x - (st.dir === 'rl' ? 0 : 70)), 0, 70, h)

      gctx.shadowColor = '#3fd2d7'
      gctx.shadowBlur = 18
      gctx.strokeStyle = 'rgba(160,242,246,0.95)'
      gctx.lineWidth = 2
      gctx.beginPath()
      if (vertical) { gctx.moveTo(0, y); gctx.lineTo(w, y) }
      else { gctx.moveTo(x, 0); gctx.lineTo(x, h) }
      gctx.stroke()
      gctx.shadowBlur = 0

      if (playingRef.current && !holdRef.current) {
        const step = st.speed / 60
        let next = pos + step
        if (next > 1) next = 0
        scanRef.current = next
      }
      if (playingRef.current) sonify(scanRef.current)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [hasImage, sonify])

  /* ── Scrub/hold ── */
  const scrubTo = useCallback((clientX: number, clientY: number) => {
    const st = settingsRef.current
    const vertical = st.dir === 'tb'
    const frac = vertical
      ? clamp(clientY / window.innerHeight)
      : clamp(clientX / window.innerWidth)
    scanRef.current = st.dir === 'rl' ? 1 - frac : frac
    sonify(scanRef.current)
  }, [sonify])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!playingRef.current) return
    if ((e.target as HTMLElement).closest('[ data-ui]')) return
    holdRef.current = true
    scrubTo(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    pokeUI()
    if (!holdRef.current) return
    scrubTo(e.clientX, e.clientY)
  }
  const onPointerUp = () => { holdRef.current = false }

  const togglePlay = () => {
    ensureAudio()
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
    pokeUI()
    if (!playingRef.current) {
      audioRef.current?.voices.forEach(v => v.gain.gain.setTargetAtTime(0, audioRef.current!.ctx.currentTime, 0.1))
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => loadImage(reader.result as string)
    reader.readAsDataURL(f)
  }

  const a = analysis
  const activeScaleName = scaleKey === 'auto' && a ? SCALES[a.scaleKey].name : SCALES[scaleKey]?.name
  const activeRoot = rootNote === 'auto' && a ? NOTE_NAMES[a.rootNote] : rootNote

  const chip = 'px-4 py-2 rounded-full font-mono-ui text-[11px] tracking-wider border border-white/15 bg-black/50 text-white/70 hover:text-white hover:border-[#3fd2d7]/50 backdrop-blur-md transition-colors cursor-pointer'

  return (
    <main
      className="fixed inset-0 bg-black overflow-hidden select-none"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const r = new FileReader(); r.onload = () => loadImage(r.result as string); r.readAsDataURL(f) } }}
    >
      {/* canvases — always mounted */}
      <canvas ref={imgCanvasRef} className="absolute inset-0" />
      <canvas ref={glowCanvasRef} className="absolute inset-0" style={{ cursor: playing ? 'crosshair' : 'default' }} />

      {/* cinematic vignette + grain */}
      {hasImage && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.55) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
        </>
      )}

      {/* ── empty state: banner backdrop + full-screen drop ── */}
      {!hasImage && (
        <>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <img src="/banner.jpg" alt="" aria-hidden
            className="w-full h-full object-cover"
            style={{ filter: 'grayscale(0.92) brightness(0.48) contrast(1.05) blur(10px)', opacity: 0.85, transform: 'scale(1.06)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,14,19,0.55), rgba(14,14,19,0.82))' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)' }} />
          <div className="absolute inset-0 mix-blend-screen opacity-[0.06]" style={{ background: '#3fd2d7' }} />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 cursor-pointer" onClick={() => fileRef.current?.click()}>
          <div className="font-mono-ui font-bold tracking-[0.28em] text-5xl text-white lowercase">lumitone</div>
          <div className="font-mono-ui text-[10px] tracking-[0.35em] text-white/40 uppercase">image → sound · sonification</div>
          <div className="mt-8 border border-dashed border-white/20 rounded-2xl px-16 py-10 text-center hover:border-[#3fd2d7]/50 transition-colors">
            <div className="text-white/40 mb-4 flex justify-center"><IcUpload /></div>
            <div className="font-mono-ui text-xs tracking-widest text-white/50 uppercase">drop an image anywhere · or click</div>
          </div>
          <div className="flex gap-2 mt-2" data-ui>
            {(['sunset', 'ocean', 'forest', 'noir'] as const).map(k => (
              <button key={k} className={chip} onClick={(e) => { e.stopPropagation(); loadDemo(k) }}>try {k}</button>
            ))}
          </div>
        </div>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      {/* ── title card (movie style, on image load) ── */}
      {showTitle && a && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ animation: 'titleFade 3.6s ease forwards' }}>
          <div className="text-center">
            <div className="font-mono-ui text-[10px] tracking-[0.4em] text-[#3fd2d7] uppercase mb-3">scale match</div>
            <div className="font-mono-ui font-bold tracking-[0.12em] uppercase text-4xl sm:text-5xl text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]">
              {NOTE_NAMES[a.rootNote]} {SCALES[a.scaleKey].name}
            </div>
            <div className="mt-3 font-mono-ui text-[11px] text-white/60">{a.reason}</div>
            <div className="mt-5 flex gap-1.5 justify-center">
              {a.colors.map((c, i) => <div key={i} className="w-6 h-6 rounded-md border border-white/20" style={{ background: c }} />)}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes titleFade { 0%{opacity:0} 12%{opacity:1} 78%{opacity:1} 100%{opacity:0} }`}</style>

      {/* ── persistent corner badge ── */}
      {hasImage && (
        <div className={`absolute top-5 left-6 pointer-events-none transition-opacity duration-500 ${showUI || !playing ? 'opacity-100' : 'opacity-30'}`}>
          <div className="font-mono-ui font-bold tracking-[0.22em] text-white/90 text-base lowercase drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">lumitone</div>
          {a && <div className="font-mono-ui text-[10px] text-[#3fd2d7] tracking-wider mt-0.5">{NOTE_NAMES[a.rootNote]} {activeScaleName}</div>}
        </div>
      )}

      {/* ── cinema control bar ── */}
      {hasImage && (
        <div
          data-ui
          className={`absolute bottom-0 inset-x-0 pb-6 pt-16 px-6 flex justify-center transition-all duration-500 ${showUI || !playing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
          style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.65))' }}
        >
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button onClick={togglePlay}
              className={`w-12 h-12 rounded-full font-bold flex items-center justify-center transition-colors ${playing ? 'bg-white text-black' : 'bg-[#3fd2d7]/15 text-[#3fd2d7] border border-[#3fd2d7]/50'}`}>
              {playing ? <IcPause /> : <IcPlay />}
            </button>

            <select value={dir} onChange={(e) => setDir(e.target.value as 'lr'|'rl'|'tb')} className={chip + ' appearance-none'}>
              <option className="bg-[#111]" value="lr">left → right</option>
              <option className="bg-[#111]" value="rl">right → left</option>
              <option className="bg-[#111]" value="tb">top ↓ bottom</option>
            </select>

            <select value={scaleKey} onChange={(e) => setScaleKey(e.target.value)} className={chip + ' appearance-none'}>
              <option className="bg-[#111]" value="auto">auto{a ? ` — ${SCALES[a.scaleKey].name}` : ''}</option>
              {Object.entries(SCALES).map(([k, s]) => <option className="bg-[#111]" key={k} value={k}>{s.name}</option>)}
            </select>

            <select value={rootNote} onChange={(e) => setRootNote(e.target.value)} className={chip + ' appearance-none'}>
              <option className="bg-[#111]" value="auto">auto{a ? ` — ${NOTE_NAMES[a.rootNote]}` : ''}</option>
              {NOTE_NAMES.map(n => <option className="bg-[#111]" key={n} value={n}>{n}</option>)}
            </select>

            <button className={chip + ' flex items-center gap-1.5'} onClick={() => setDemoOpen(v => !v)}>demos <IcChevron /></button>
            <button className={chip + ' flex items-center gap-1.5'} onClick={() => setShowSettings(v => !v)}><IcTune /> tune</button>
            <button className={chip} onClick={() => fileRef.current?.click()}>new image</button>
          </div>

          {/* demo row */}
          {demoOpen && (
            <div className="absolute bottom-20 inset-x-0 flex justify-center gap-2" data-ui>
              {(['sunset', 'ocean', 'forest', 'noir'] as const).map(k => (
                <button key={k} className={chip} onClick={() => { loadDemo(k); setDemoOpen(false) }}>{k}</button>
              ))}
            </div>
          )}

          {/* settings popover */}
          {showSettings && (
            <div className="absolute bottom-20 inset-x-0 flex justify-center" data-ui>
              <div className="rounded-2xl border border-white/15 bg-black/70 backdrop-blur-xl p-5 grid grid-cols-3 gap-x-8 gap-y-4 w-[560px] max-w-[92vw]">
                {([
                  ['speed', speed, 0.02, 0.5, 0.01, setSpeed],
                  ['reverb', reverb, 0, 1, 0.01, setReverb],
                  ['brightness gate', threshold, 0, 0.6, 0.01, setThreshold],
                ] as const).map(([label, val, min, max, step, setter]) => (
                  <label key={label}>
                    <div className="font-mono-ui text-[9px] tracking-[0.2em] text-white/40 uppercase mb-1.5">{label} — {Math.round((val as number) * 100)}</div>
                    <input type="range" min={min} max={max} step={step} value={val}
                      onChange={(e) => (setter as (v: number) => void)(+e.target.value)}
                      className="w-full accent-[#3fd2d7]" />
                  </label>
                ))}
                <div className="col-span-3 font-mono-ui text-[10px] text-white/35 text-center">
                  hold &amp; drag the image to sustain a moment
                  {a && ` · alternates: ${a.ranked.slice(1, 3).map(r => SCALES[r.key].name).join(', ')}`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
