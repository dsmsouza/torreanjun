import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir arquivos estáticos, favicon e api
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Verifica se o usuário tem a sessão Master autenticada via cookie
  const isMaster = request.cookies.get('anjun_master_session')?.value === 'true';

  // Se for Master, tem acesso livre a todas as páginas da Torre
  if (isMaster) {
    return NextResponse.next();
  }

  // Se NÃO for Master (perfil Operador padrão na rede e anônimo):
  // Rotas estritamente permitidas para operadores: /vtag e /mapa
  const isAllowedForOperador =
    pathname === '/vtag' ||
    pathname.startsWith('/vtag/') ||
    pathname === '/mapa' ||
    pathname.startsWith('/mapa/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/');

  if (!isAllowedForOperador) {
    // Redireciona automaticamente qualquer tentativa de acessar /, /sla, /config, etc.
    const url = request.nextUrl.clone();
    url.pathname = '/vtag';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
