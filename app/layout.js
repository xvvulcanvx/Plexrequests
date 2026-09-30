import './globals.css';

export const metadata = {
  title: 'Plex Requests',
  description: 'Request movies and TV shows for Plex',
};

export const viewport = {
  themeColor: '#f59e0b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
