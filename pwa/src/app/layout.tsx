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

/**
 * Resolve o tema e a escala ANTES da primeira pintura.
 *
 * LÓGICA DO LUCIANO: precisa ser um script embutido e síncrono no <head>. Feito
 * dentro do React, ele só rodaria depois da hidratação, e quem escolheu o tema
 * escuro veria a tela clara piscar em cada abertura. O trecho é o mínimo
 * possível: lê a preferência, resolve "automático" pelo sistema e carimba o
 * atributo que a folha de estilo usa.
 *
 * Se o localStorage estiver bloqueado (navegação privada), o `catch` ainda
 * carimba um tema: sem atributo nenhum a paleta escura nunca se aplicaria,
 * porque ela deixou de depender da media query.
 */
const SCRIPT_DE_TEMA = `(function(){try{
var d=document.documentElement,t=localStorage.getItem('pwa:tema'),e=localStorage.getItem('pwa:escala'),c=localStorage.getItem('pwa:contraste');
var escuro=t==='escuro'||(t!=='claro'&&matchMedia('(prefers-color-scheme: dark)').matches);
d.dataset.tema=escuro?'escuro':'claro';
var alto=c==='alto'||(c!=='normal'&&matchMedia('(prefers-contrast: more)').matches);
d.dataset.contraste=alto?'alto':'normal';
var m={sm:0.875,md:1,lg:1.15,xl:1.3}[e];if(m)d.style.setProperty('--escala',m);
}catch(_){document.documentElement.dataset.tema='claro';document.documentElement.dataset.contraste='normal';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` porque o script abaixo carimba tema, contraste
    // e escala no <html> antes de o React chegar, de propósito: sem isso, o
    // React acusa em todo carregamento que os atributos não batem com o HTML
    // do servidor.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
