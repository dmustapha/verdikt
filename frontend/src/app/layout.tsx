import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verdikt — Automated Justice for Agent Payments',
  description: 'Dispute resolution for AI agent payments on Stellar',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
