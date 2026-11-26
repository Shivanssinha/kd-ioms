'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { useLogin } from '@/features/auth/hooks';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api/api-error';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl');
  const { user, isLoading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorDetails, setErrorDetails] = useState<{ message: string; requestId?: string } | null>(null);

  const loginMutation = useLogin();

  // If already authenticated, redirect directly into the designated portal
  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'ADMIN') {
        router.replace('/dashboard');
      } else if (user.role === 'RETAILER') {
        router.replace('/catalog');
      } else if (user.role === 'DELIVERY') {
        router.replace('/delivery/orders');
      }
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetails(null);

    try {
      const data = await loginMutation.mutateAsync({ username, password });

      if (data.user.mustChangePassword) {
        router.push('/change-password');
        return;
      }

      // Check for safe relative callback URL
      const isSafeCallback = callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//');

      switch (data.user.role) {
        case 'ADMIN': {
          router.push('/dashboard');
          break;
        }
        case 'RETAILER': {
          if (
            isSafeCallback &&
            (callbackUrl.startsWith('/catalog') ||
              callbackUrl.startsWith('/cart') ||
              callbackUrl.startsWith('/orders') ||
              callbackUrl.startsWith('/profile'))
          ) {
            router.push(callbackUrl);
          } else {
            router.push('/catalog');
          }
          break;
        }
        case 'DELIVERY': {
          if (
            isSafeCallback &&
            (callbackUrl.startsWith('/delivery') ||
              callbackUrl.startsWith('/pool') ||
              callbackUrl.startsWith('/orders'))
          ) {
            router.push(callbackUrl);
          } else {
            router.push('/delivery/orders');
          }
          break;
        }
        default:
          router.push('/login');
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorDetails({
          message: err.message,
          requestId: err.requestId,
        });
      } else {
        setErrorDetails({
          message: 'An unexpected error occurred while signing in. Please try again.',
        });
      }
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-800 rounded-xl mb-3 font-bold text-xl">
          KD
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Kandarp Drugs</h2>
        <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
          Inventory & Order Management System
        </p>
      </div>

      {errorDetails && (
        <ErrorBanner
          className="mb-5"
          message={errorDetails.message}
          requestId={errorDetails.requestId}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="login-username"
          label="Username"
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          autoComplete="username"
        />

        <Input
          id="login-password"
          label="Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={loginMutation.isPending}
        >
          Sign In
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
      {/* Back button to Home */}
      <div className="w-full max-w-md mb-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors py-1 px-2 rounded-lg hover:bg-slate-200/60 w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
      </div>

      <Suspense fallback={<div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 h-80 animate-pulse" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
