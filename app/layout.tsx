import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lumitone — image → sound',
  description: 'Sonify images: a scan line turns brightness into notes, color tone picks the scale.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
