import './globals.css';

export const metadata = { title: 'STRIDE', description: 'Кроссовки STRIDE' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
