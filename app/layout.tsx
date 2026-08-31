import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000'),
  title: 'Turno Reale — Conteggio produzione',
  description: 'Confronta fusti e bag prodotti dai due turni, al netto di ore, pause e personale.',
  applicationName: 'Turno Reale',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Turno Reale',
  },
  openGraph: {
    title: 'Turno Reale',
    description: 'I numeri, senza supposizioni.',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Turno Reale — I numeri, senza supposizioni.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Turno Reale',
    description: 'I numeri, senza supposizioni.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a2d67',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
