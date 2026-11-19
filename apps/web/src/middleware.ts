import { NextResponse, type NextRequest } from 'next/server';

const COOKIES = ['dpms_session', '__Host-dpms_session'];

/**
 * UX-only redirect: sends visitors without a session cookie to /login before any page renders.
 * This is NOT a security boundary — the API validates the session on every data request.
 */
export function middleware(req: NextRequest) {
  const hasCookie = COOKIES.some((c) => req.cookies.has(c));
  const isLogin = req.nextUrl.pathname === '/login';
  if (!hasCookie && !isLogin) return NextResponse.redirect(new URL('/login', req.url));
  if (hasCookie && isLogin) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
