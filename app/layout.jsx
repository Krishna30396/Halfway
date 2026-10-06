import './globals.css';
import { Bricolage_Grotesque, Public_Sans, JetBrains_Mono } from 'next/font/google';
import AuthProvider from '@/components/AuthProvider';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import InstallPrompt from '@/components/InstallPrompt';
import MeetupInbox from '@/components/MeetupInbox';
import FriendsWidget from '@/components/FriendsWidget';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Public_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Halfway — a fair meeting point',
  description:
    'Two locations in. One fair meeting point out. Find the halfway point between two people along real roads, snapped to a real town, with places to meet.',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1E2A24',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AuthProvider>
          {children}
          <MeetupInbox />
          <FriendsWidget />
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
