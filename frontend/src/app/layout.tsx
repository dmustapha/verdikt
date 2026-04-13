import type { Metadata } from 'next';
import { Cormorant_Garamond, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { WebSocketProvider } from './providers/WebSocketProvider';
import { Sidebar } from './components/Sidebar';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-data',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Verdikt — Fair Payments Between AI Agents',
  description: 'Dispute resolution for AI agent payments on Stellar',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Verdikt — Fair Payments Between AI Agents',
    description: 'Automated dispute resolution for AI agent payments on Stellar Testnet',
    images: [{ url: '/logo-512.png', width: 512, height: 512 }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${spaceGrotesk.variable} ${jetbrains.variable}`}>
      <body className="antialiased">
        <WebSocketProvider>
          <Sidebar />
          <div className="vk-main-content">
            {children}
          </div>
        </WebSocketProvider>
      </body>
    </html>
  );
}
