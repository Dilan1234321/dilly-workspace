import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dilly — Career Readiness, Measured',
  description: 'The most powerful internship matching engine for college students.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var saved = localStorage.getItem('dilly_theme');
            var dark = saved ? saved === 'dark' : true;
            if (dark) document.documentElement.classList.add('dark');
          })();
        `}} />
      </head>
      <body className="min-h-screen bg-surface-0 text-txt-1 antialiased">
        {children}
      </body>
    </html>
  );
}
