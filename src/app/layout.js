import './globals.css';

export const metadata = {
  title: 'MIA 2026 · WIA Competitor Tracker',
  description: 'Tracker repo GitHub kompetisi Web In Action (MIA 2026).',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
