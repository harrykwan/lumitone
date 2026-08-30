import type { Metadata } from 'next'
import './globals.css'
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google'

const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-serif' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'lumitone — image → sound',
  description: 'Sonify images: a scan line turns brightness into notes, color tone picks the scale.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
