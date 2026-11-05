import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir arquivos estáticos, favicon, imagens, snapshots e rotas de API
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/snapshot') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|json)$/)
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('anjun_session')?.value;
  const isMaster = request.cookies.get('anjun_master_session')?.value === 'true';
  const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');

  // 1. USUÁRIO NÃO AUTENTICADO:
  // Se não possui cookie de sessão, redireciona compulsoriamente para /login
  if (!sessionCookie) {
    if (!isLoginPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 2. USUÁRIO JÁ AUTENTICADO TENTANDO ACESSAR /login:
  if (isLoginPage) {
    const dest = request.nextUrl.clone();
    dest.pathname = isMaster ? '/' : '/vtag';
    return NextResponse.redirect(dest);
  }

  // 3. DIRETORIA MASTER (Diego):
  // Acesso irrestrito a todos os módulos
  if (isMaster) {
    return NextResponse.next();
  }

  // 4. EQUIPE OPERACIONAL / TORRE DE CONTROLE (Ellen, Danilo, Gabriele, Ketley, Janaina, Nicolas):
  // Acesso estritamente restrito a /vtag e /mapa
  const isAllowedForOperador =
    pathname === '/vtag' ||
    pathname.startsWith('/vtag/') ||
    pathname === '/mapa' ||
    pathname.startsWith('/mapa/');

  if (!isAllowedForOperador) {
    const vtagUrl = request.nextUrl.clone();
    vtagUrl.pathname = '/vtag';
    return NextResponse.redirect(vtagUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
