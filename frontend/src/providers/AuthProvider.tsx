'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, setAccessToken, getAccessToken, refreshAccessToken } from '../lib/api/client';

export interface AuthUser {
  id: string;
  username: string;
  role: 'ADMIN' | 'RETAILER' | 'DELIVERY';
  phone?: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: (skipServerCall?: boolean) => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback((token: string, userData: AuthUser) => {
    setAccessToken(token);
    setUser(userData);
    if (typeof document !== 'undefined') {
      document.cookie = `userRole=${encodeURIComponent(userData.role)}; path=/; max-age=604800; SameSite=Lax`;
    }
  }, []);

  const logout = useCallback(async (skipServerCall = false) => {
    if (!skipServerCall) {
      try {
        await apiFetch('/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {
        // Ignore logout errors — server-side logout is best-effort
      }
    }
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
    if (typeof document !== 'undefined') {
      document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax';
      document.cookie = 'userRole=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax';
      document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax';
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax';
    }
    router.replace('/login');
  }, [queryClient, router]);

  // On initial mount, restore or refresh session
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const currentToken = getAccessToken();

        // 1. If an access token is already available, verify and load current user directly
        if (currentToken) {
          try {
            const meRes = await apiFetch<AuthUser>('/auth/me');
            if (isMounted && meRes.success && meRes.data) {
              setUser(meRes.data);
              if (typeof document !== 'undefined') {
                document.cookie = `userRole=${encodeURIComponent(meRes.data.role)}; path=/; max-age=604800; SameSite=Lax`;
              }
              return;
            }
          } catch {
            // Token may have expired or is invalid, proceed to refresh
          }
        }

        // 2. If no valid access token or /auth/me failed, use centralized refresh mutex
        const newToken = await refreshAccessToken();
        if (newToken) {
          const meRes = await apiFetch<AuthUser>('/auth/me');
          if (isMounted && meRes.success && meRes.data) {
            setUser(meRes.data);
            if (typeof document !== 'undefined') {
              document.cookie = `userRole=${encodeURIComponent(meRes.data.role)}; path=/; max-age=604800; SameSite=Lax`;
            }
            return;
          }
        }

        // 3. If refresh failed, reset auth state
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
          if (typeof document !== 'undefined') {
            document.cookie = 'accessToken=; path=/; max-age=0; SameSite=Lax';
            document.cookie = 'userRole=; path=/; max-age=0; SameSite=Lax';
          }
        }
      } catch {
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
          if (typeof document !== 'undefined') {
            document.cookie = 'accessToken=; path=/; max-age=0; SameSite=Lax';
            document.cookie = 'userRole=; path=/; max-age=0; SameSite=Lax';
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      isLoading: false,
      login: () => {},
      logout: async () => {},
      setUser: () => {},
    };
  }
  return context;
}
