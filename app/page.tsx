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

/* ═══════════════ Component ═══════════════ */

export default function Home() {
  const imgCanvasRef = useRef<HTMLCanvasElement>(null)   // image rendered
  const glowCanvasRef = useRef<HTMLCanvasElement>(null)  // scan line overlay
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<{
    ctx: AudioContext; master: GainNode; voices: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode }[]
    reverbWet: GainNode
  } | null>(null)
  const scanRef = useRef(0)          // 0..1 along axis
  const playingRef = useRef(false)
  const holdRef = useRef(false)      // scrub-hold mode
  const rafRef = useRef(0)
  const imgDataRef = useRef<ImageData | null>(null)
  const dimsRef = useRef({ w: 0, h: 0 })
  const settingsRef = useRef({ speed: 0.12, dir: 'lr' as 'lr'|'rl'|'tb', scaleKey: 'auto', rootNote: 'auto', threshold: 0.14, reverb: 0.4, octave: 2 })

  const [playing, setPlaying] = useState(false)
  const [hasImage, setHasImage] = useState(false)
  const [analysis, setAnalysis] = useState<{ scaleKey: string; rootNote: number; colors: string[]; reason: string; ranked: {key:string; score:number}[] } | null>(null)
  const [scaleKey, setScaleKey] = useState('auto')
  const [rootNote, setRootNote] = useState('auto')
  const [speed, setSpeed] = useState(0.12)
  const [dir, setDir] = useState<'lr'|'rl'|'tb'>('lr')
  const [reverb, setReverb] = useState(0.4)
  const [threshold, setThreshold] = useState(0.14)
  const [hint, setHint] = useState('')

  useEffect(() => { settingsRef.current = { speed, dir, scaleKey, rootNote, threshold, reverb, octave: 2 } })

  /* ── Color analysis → scale/mode detection ── */
  const analyzeImage = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const data = ctx.getImageData(0, 0, w, h).data
    let hx = 0, hy = 0, sat = 0, light = 0, n = 0
    const colorCounts = new Map<string, { count: number; r: number; g: number; b: number }>()
    for (let i = 0; i < data.length; i += 16) { // sample every 4th px
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

    // dominant colors (top 5 quantized)
    const colors = [...colorCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5)
      .map(c => `rgb(${c.r},${c.g},${c.b})`)

    // ── Scale scoring heuristics ──
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
    if (hue >= 75 && hue < 150) { scores.dorian += 1.6; scores.mixolydian += 1.0 } // greens
    if (hue >= 270 && hue < 320) { scores.lydian += 1.6; scores.meloMinor += 1.0 } // purples
    scores.chromatic = 0.05

    const ranked = Object.entries(scores).map(([key, score]) => ({ key, score }))
      .sort((a, b) => b.score - a.score)

    // root from hue → circle of fifths wheel (C at 0°/360°)
    const rootNoteNum = Math.round((1 - hue / 360) * 12) % 12

    const top = SCALES[ranked[0].key]
    const reason = `${warm ? 'warm' : cool ? 'cool' : 'neutral'} ${dark ? 'dark' : bright ? 'bright' : 'mid'} tones (H${Math.round(hue)}° · S${Math.round(sat * 100)}% · L${Math.round(light * 100)}%) → ${top.mood}`
    setAnalysis({ scaleKey: ranked[0].key, rootNote: rootNoteNum, colors, reason, ranked })
    return { ranked, rootNoteNum }
  }, [])

  /* ── Load image ── */
  const loadImage = useCallback((src: string) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = imgCanvasRef.current!
      const maxW = 900
      const scale = Math.min(1, maxW / img.width)
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      imgDataRef.current = ctx.getImageData(0, 0, w, h)
      dimsRef.current = { w, h }
      const glow = glowCanvasRef.current!
      glow.width = w; glow.height = h
      setHasImage(true)
      scanRef.current = 0
      analyzeImage(ctx, w, h)
    }
    img.src = src
  }, [analyzeImage])

  /* ── Demo images (generated gradients) ── */
  const loadDemo = useCallback((kind: 'sunset' | 'ocean' | 'forest' | 'noir') => {
    const c = document.createElement('canvas')
    c.width = 800; c.height = 500
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const g = ctx.createLinearGradient(0, 0, 0, 500)
    const presets = {
      sunset: ['#2b1055', '#7597de', '#ff9e5e', '#ffd39b'],
      ocean: ['#020d1f', '#0a3d62', '#1c8fb0', '#9be3e8'],
      forest: ['#0a1a0d', '#1d4d2b', '#3f8b4f', '#b8d99a'],
      noir: ['#0a0a0c', '#1f1f26', '#4a4a55', '#c9c9d4'],
    } as const
    const stops = presets[kind]
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 800, 500)
    // scatter some blobs for texture
    for (let i = 0; i < 120; i++) {
      const rg = ctx.createRadialGradient(Math.random() * 800, Math.random() * 500, 0, Math.random() * 800, Math.random() * 500, 40 + Math.random() * 90)
      const col = stops[Math.floor(Math.random() * stops.length)]
      rg.addColorStop(0, col + 'cc')
      rg.addColorStop(1, col + '00')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, 800, 500)
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

    const voices = Array.from({ length: VOICES }, (_, i) => {
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
    const rootMidi = 36 + (((rootPc % 12) + 12) % 12) // low octave base

    const vertical = st.dir === 'tb'
    const axisLen = vertical ? h : w
    const crossLen = vertical ? w : h
    const px = vertical ? 0 : Math.round(pos * (w - 1))
    const py = vertical ? Math.round(pos * (h - 1)) : 0

    interface Bin { freq: number; amp: number; t: number }
    const bins: Bin[] = []
    for (let i = 0; i < BINS; i++) {
      const t = i / (BINS - 1)
      const along = Math.round(t * (crossLen - 1))
      const x = vertical ? along : px
      const y = vertical ? py : along
      const idx = (y * w + x) * 4
      const r = imgData.data[idx] / 255, g = imgData.data[idx + 1] / 255, b = imgData.data[idx + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      // saturation adds shimmer to amplitude
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx - mn
      const amp = clamp(lum * 0.85 + sat * 0.3)
      if (amp <= st.threshold) continue
      // t=0 at top/left → high freq; t=1 bottom/right → low freq  (lower = lower freq)
      const cont = F_MAX * Math.pow(F_MIN / F_MAX, vertical ? t : t)
      bins.push({ freq: quantize(cont, rootMidi, scaleDef.intervals), amp, t })
    }
    bins.sort((A, B) => B.amp - A.amp)

    const now = audio.ctx.currentTime
    audio.reverbWet.gain.setTargetAtTime(st.reverb, now, 0.1)
    audio.voices.forEach((v, i) => {
      const bin = bins[i]
      if (bin) {
        v.osc.frequency.setTargetAtTime(bin.freq, now, 0.04)
        v.gain.gain.setTargetAtTime(Math.pow(bin.amp, 1.6) * 0.24, now, 0.06)
        v.pan.pan.setTargetAtTime((bin.t - 0.5) * 1.4, now, 0.1)
      } else {
        v.gain.gain.setTargetAtTime(0, now, 0.09)
      }
    })
  }, [analysis, quantize])

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

      // trail
      const grad = vertical
        ? gctx.createLinearGradient(0, y - (st.dir === 'tb' ? 60 : 0), 0, y)
        : gctx.createLinearGradient(x - (st.dir === 'lr' ? 60 : 0), 0, x, 0)
      if (st.dir === 'rl') {
        grad.addColorStop(0, 'rgba(63,210,215,0)')
        grad.addColorStop(1, 'rgba(63,210,215,0.25)')
      } else {
        grad.addColorStop(0, 'rgba(63,210,215,0.25)')
        grad.addColorStop(1, 'rgba(63,210,215,0)')
      }
      gctx.fillStyle = vertical
        ? (st.dir === 'tb' ? grad : grad)
        : grad
      if (vertical) gctx.fillRect(0, Math.max(0, y - 60), w, 60)
      else gctx.fillRect(Math.max(0, x - 60), 0, 60, h)

      // scan line
      gctx.shadowColor = '#3fd2d7'
      gctx.shadowBlur = 14
      gctx.strokeStyle = 'rgba(150,240,244,0.95)'
      gctx.lineWidth = 2
      gctx.beginPath()
      if (vertical) { gctx.moveTo(0, y); gctx.lineTo(w, y) }
      else { gctx.moveTo(x, 0); gctx.lineTo(x, h) }
      gctx.stroke()
      gctx.shadowBlur = 0

      if (playingRef.current && !holdRef.current) {
        const dt = 1 / 60
        const step = st.speed * dt
        let next = pos + step
        if (next > 1) next = 0
        scanRef.current = next
      }
      if (playingRef.current) sonify(scanRef.current)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [hasImage, sonify])

  /* ── Scrub/hold interactions ── */
  const scrubTo = useCallback((clientX: number, clientY: number) => {
    const glow = glowCanvasRef.current
    if (!glow) return
    const rect = glow.getBoundingClientRect()
    const st = settingsRef.current
    const vertical = st.dir === 'tb'
    const frac = vertical
      ? clamp((clientY - rect.top) / rect.height)
      : clamp((clientX - rect.left) / rect.width)
    scanRef.current = st.dir === 'rl' ? 1 - frac : frac
    sonify(scanRef.current)
  }, [sonify])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!playingRef.current) return
    holdRef.current = true
    scrubTo(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!holdRef.current) return
    scrubTo(e.clientX, e.clientY)
  }
  const onPointerUp = () => { holdRef.current = false }

  /* ── Controls ── */
  const togglePlay = () => {
    ensureAudio()
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
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

  return (
    <main className="min-h-screen bg-[#0e0e13] text-[#e8e4da]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* header */}
        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-3xl font-bold italic tracking-tight">lumitone</h1>
          <span className="font-mono text-[10px] tracking-[0.25em] text-[#4a4652] uppercase">image → sound · sonification</span>
        </div>
        <p className="text-[#8a8492] text-sm mb-8 max-w-xl">
          Drop an image. A scan line sweeps through it — bright pixels sing, dark pixels stay silent, low pixels are low notes.
          The color tone of the photo picks the scale. Hold/drag the line to sustain a moment.
        </p>

        {/* dropzone */}
        {!hasImage && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const r = new FileReader(); r.onload = () => loadImage(r.result as string); r.readAsDataURL(f) } }}
            className="border-2 border-dashed border-[#26262e] rounded-2xl p-14 text-center cursor-pointer hover:border-[#3fd2d7]/50 transition-colors"
          >
            <div className="text-5xl mb-4">🖼️</div>
            <div className="font-mono text-xs tracking-widest text-[#6f6a76] uppercase">drop an image / click to browse</div>
            <div className="mt-6 flex gap-2 justify-center flex-wrap">
              {(['sunset', 'ocean', 'forest', 'noir'] as const).map(k => (
                <button key={k} onClick={(e) => { e.stopPropagation(); loadDemo(k) }}
                  className="font-mono text-[10px] px-3 py-1.5 rounded-full border border-[#26262e] text-[#6f6a76] hover:text-[#e8e4da] hover:border-[#3fd2d7]/40">
                  try {k}
                </button>
              ))}
            </div>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

        {/* canvas */}
        <div className={`relative rounded-2xl overflow-hidden border border-[#26262e] select-none touch-none ${hasImage ? '' : 'hidden'}`}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            <canvas ref={imgCanvasRef} className="w-full block" />
            <canvas ref={glowCanvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />
        </div>

        {/* analysis */}
        {a && (
          <div className="mt-5 rounded-xl border border-[#26262e] bg-[#17171d] p-4 flex flex-wrap items-center gap-4">
            <div className="flex gap-1.5">
              {a.colors.map((c, i) => <div key={i} className="w-7 h-7 rounded-md border border-white/10" style={{ background: c }} />)}
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="font-mono text-[10px] tracking-[0.2em] text-[#3fd2d7] uppercase">scale match</div>
              <div className="text-sm mt-0.5">
                <b>{NOTE_NAMES[a.rootNote]} {SCALES[a.scaleKey].name}</b>
                <span className="text-[#6f6a76] text-xs ml-2">— {a.reason}</span>
              </div>
              <div className="font-mono text-[10px] text-[#4a4652] mt-1">
                alternates: {a.ranked.slice(1, 4).map(r => NOTE_NAMES[a.rootNote] + ' ' + SCALES[r.key].name).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {/* controls */}
        {hasImage && (
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button onClick={togglePlay}
              className={`rounded-xl font-semibold text-sm py-3.5 transition-colors ${playing ? 'bg-[#e8e4da] text-[#0e0e13]' : 'bg-[#3fd2d7]/10 text-[#3fd2d7] border border-[#3fd2d7]/40'}`}>
              {playing ? '⏸ pause' : '▶ play'}
            </button>

            <label className="rounded-xl border border-[#26262e] bg-[#17171d] px-4 py-2.5">
              <div className="font-mono text-[9px] tracking-[0.2em] text-[#6f6a76] uppercase">direction</div>
              <select value={dir} onChange={(e) => setDir(e.target.value as 'lr'|'rl'|'tb')}
                className="bg-transparent w-full outline-none text-sm mt-0.5">
                <option className="bg-[#17171d]" value="lr">left → right</option>
                <option className="bg-[#17171d]" value="rl">right → left</option>
                <option className="bg-[#17171d]" value="tb">top ↓ bottom</option>
              </select>
            </label>

            <label className="rounded-xl border border-[#26262e] bg-[#17171d] px-4 py-2.5">
              <div className="font-mono text-[9px] tracking-[0.2em] text-[#6f6a76] uppercase">scale / mode</div>
              <select value={scaleKey} onChange={(e) => setScaleKey(e.target.value)}
                className="bg-transparent w-full outline-none text-sm mt-0.5">
                <option className="bg-[#17171d]" value="auto">auto {a ? `(${SCALES[a.scaleKey].name})` : ''}</option>
                {Object.entries(SCALES).map(([k, s]) => (
                  <option className="bg-[#17171d]" key={k} value={k}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="rounded-xl border border-[#26262e] bg-[#17171d] px-4 py-2.5">
              <div className="font-mono text-[9px] tracking-[0.2em] text-[#6f6a76] uppercase">root</div>
              <select value={rootNote} onChange={(e) => setRootNote(e.target.value)}
                className="bg-transparent w-full outline-none text-sm mt-0.5">
                <option className="bg-[#17171d]" value="auto">auto {a ? `(${NOTE_NAMES[a.rootNote]})` : ''}</option>
                {NOTE_NAMES.map(n => <option className="bg-[#17171d]" key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label className="rounded-xl border border-[#26262e] bg-[#17171d] px-4 py-2.5">
              <div className="font-mono text-[9px] tracking-[0.2em] text-[#6f6a76] uppercase">scan speed — {Math.round(speed * 100)}</div>
              <input type="range" min="0.02" max="0.5" step="0.01" value={speed}
                onChange={(e) => setSpeed(+e.target.value)} className="w-full accent-[#3fd2d7] mt-2" />
            </label>

            <label className="rounded-xl border border-[#26262e] bg-[#17171d] px-4 py-2.5">
              <div className="font-mono text-[9px] tracking-[0.2em] text-[#6f6a76] uppercase">reverb — {Math.round(reverb * 100)}</div>
              <input type="range" min="0" max="1" step="0.01" value={reverb}
                onChange={(e) => setReverb(+e.target.value)} className="w-full accent-[#3fd2d7] mt-2" />
            </label>

            <label className="rounded-xl border border-[#26262e] bg-[#17171d] px-4 py-2.5">
              <div className="font-mono text-[9px] tracking-[0.2em] text-[#6f6a76] uppercase">brightness gate — {Math.round(threshold * 100)}</div>
              <input type="range" min="0" max="0.6" step="0.01" value={threshold}
                onChange={(e) => setThreshold(+e.target.value)} className="w-full accent-[#3fd2d7] mt-2" />
            </label>

            <button onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-[#26262e] bg-[#17171d] font-semibold text-sm py-3.5 text-[#6f6a76] hover:text-[#e8e4da]">
              ↺ new image
            </button>
          </div>
        )}

        {playing && (
          <div className="mt-4 font-mono text-[10px] text-[#4a4652] tracking-wider text-center">
            hold & drag on the image to sustain a moment · {activeScaleName} · {activeRoot}
          </div>
        )}
        {hint && <div className="mt-3 text-center font-mono text-xs text-[#c2263e]">{hint}</div>}
      </div>
    </main>
  )
}
