import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proteção OPCIONAL da tela de revisão.
 *
 * `PWA_ADMIN_PASSWORD` fica vazia por padrão: a decisão foi deixar o protótipo
 * aberto, e o que segura o risco é o aviso na entrada pedindo para ninguém
 * informar dado pessoal. Preencher a variável no .env liga a exigência sem
 * mexer em código — útil se o link circular mais do que o previsto.
 */
export function middleware(requisicao: NextRequest) {
  const senha = process.env.PWA_ADMIN_PASSWORD;
  if (!senha) return NextResponse.next();

  const cabecalho = requisicao.headers.get('authorization') ?? '';
  const [tipo, credencial] = cabecalho.split(' ');

  if (tipo === 'Basic' && credencial) {
    const informada = atob(credencial).split(':')[1];
    if (informada === senha) return NextResponse.next();
  }

  return new NextResponse('Acesso restrito', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Revisao"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
