import './globals.css';
import { Bricolage_Grotesque, Public_Sans, JetBrains_Mono } from 'next/font/google';
import AuthProvider from '@/components/AuthProvider';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import InstallPrompt from '@/components/InstallPrompt';
import MeetupInbox from '@/components/MeetupInbox';
import FriendsWidget from '@/components/FriendsWidget';
import NotificationPrompt from '@/components/NotificationPrompt';
import PermissionsSetup from '@/components/PermissionsSetup';
import { Analytics } from '@vercel/analytics/next';
import Script from 'next/script';

// Optional Google Analytics 4: set NEXT_PUBLIC_GA_ID (G-XXXXXXX) in Vercel to turn it on.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

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
  // iPhone "Add to Home Screen": a real icon (iOS ignores the manifest icons)
  // and a full-screen app without Safari's bars.
  icons: { apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Halfway', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1E2A24',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint so there's no light/dark flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('halfway-theme');if(m==='dark'||m==='light')document.documentElement.setAttribute('data-mode',m)}catch(e){}",
          }}
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          <MeetupInbox />
          <FriendsWidget />
          <NotificationPrompt />
          <PermissionsSetup />
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </AuthProvider>
        {/* Page views, no cookies; shows up once Analytics is enabled in the Vercel project. */}
        <Analytics />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
