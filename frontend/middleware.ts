import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const adminToken = request.cookies.get('admin_token')?.value

  // If trying to access /config and doesn't have token
  if (request.nextUrl.pathname.startsWith('/config')) {
    if (!adminToken) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Also protect the root / if they want, but they said only upload needs login
  // So other pages remain public

  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/config/:path*'],
}
