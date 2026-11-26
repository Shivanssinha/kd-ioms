import { NextResponse, type NextRequest } from 'next/server';

// Route categories
const ADMIN_PATHS = [
  '/dashboard',
  '/users',
  '/retailers',
  '/salts',
  '/medicines',
  '/batches',
  '/stock',
  '/invoices',
  '/alerts',
  '/settings',
];

const RETAILER_ONLY_PATHS = [
  '/profile',
];

const ORDER_CATALOG_PATHS = [
  '/catalog',
  '/cart',
];

const DELIVERY_PATHS = [
  '/delivery',
  '/pool',
  '/deliveries',
  '/history',
  '/place-order',
];

const SHARED_PROTECTED_PATHS = [
  '/orders',
  '/change-password',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Retrieve auth token and role from cookies
  const token =
    request.cookies.get('accessToken')?.value ||
    request.cookies.get('refreshToken')?.value ||
    request.cookies.get('token')?.value;

  const role = request.cookies.get('userRole')?.value;

  const isAdminPath = ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isRetailerOnlyPath = RETAILER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isOrderCatalogPath = ORDER_CATALOG_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isDeliveryPath = DELIVERY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isSharedPath = SHARED_PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isProtectedPath = isAdminPath || isRetailerOnlyPath || isOrderCatalogPath || isDeliveryPath || isSharedPath;

  // 1. Unauthorized access: if neither access nor refresh token is present, redirect to /login
  if (isProtectedPath && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. If authenticated user visits /login, redirect to their designated portal
  if (pathname === '/login' && token) {
    if (role === 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    if (role === 'RETAILER') {
      return NextResponse.redirect(new URL('/catalog', request.url));
    }
    if (role === 'DELIVERY') {
      return NextResponse.redirect(new URL('/delivery/orders', request.url));
    }
  }

  // 3. Role-based isolation for authenticated users
  if (token && role) {
    // Delivery partner trying to access admin or retailer-only profile
    if (role === 'DELIVERY') {
      if (isAdminPath || isRetailerOnlyPath) {
        return NextResponse.redirect(new URL('/delivery/orders', request.url));
      }
    }

    // Retailer trying to access admin or delivery routes
    if (role === 'RETAILER') {
      if (isAdminPath || isDeliveryPath) {
        return NextResponse.redirect(new URL('/catalog', request.url));
      }
    }

    // Admin has comprehensive access across administrative, catalog/cart, on-behalf, and delivery operations
    if (role === 'ADMIN') {
      if (isRetailerOnlyPath) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/ (API proxy routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
