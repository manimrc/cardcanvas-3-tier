'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';

export interface User {
  id: string;
  username: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // On mount: verify session with backend via /api/auth/me (httpOnly cookie)
  useEffect(() => {
    api.auth.me()
      .then(u => setUser({ id: u.id, username: u.username, displayName: u.displayName }))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/reset-password';
    if (!user && !isAuthPage) {
      router.push('/login');
    } else if (user && isAuthPage) {
      router.push('/');
    }
  }, [user, isLoading, pathname, router]);

  const login = useCallback((newUser: User) => {
    setUser(newUser);
    router.push('/');
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore logout errors
    }
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
