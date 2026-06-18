import './design-system.css';
import type { ReactNode } from 'react';
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--mono', display: 'swap' });

export const metadata = { title: 'Caspilot', description: 'autonomy you can audit' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
