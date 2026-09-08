import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Assistente de Saúde',
  description: 'Protótipo de validação do chatbot de saúde do PET-SAÚDE',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icone.svg',
    apple: '/icons/icone-180.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Assistente',
    // `black-translucent` deixa o conteúdo subir até o topo da tela; as
    // safe-area do CSS é que reservam o espaço do notch.
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sem `viewport-fit=cover` a barra de digitação fica atrás do indicador de
  // gestos no iPhone.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#008069' },
    { media: '(prefers-color-scheme: dark)', color: '#202c33' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
