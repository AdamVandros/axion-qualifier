import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Axion ICP Qualifier',
  description: 'Automated agency lead qualification',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
