import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export const metadata = {
  title: 'Kothon',
  description: 'Private chat for two',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Kothon', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
