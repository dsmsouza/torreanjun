import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// No login required - allow all routes directly
export default function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
