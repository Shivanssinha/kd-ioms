import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginPage from '../../../app/(auth)/login/page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../providers/AuthProvider';
import { ToastProvider } from '../../../providers/ToastProvider';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('../api', () => ({
  login: vi.fn(),
}));

describe('LoginPage Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  it('renders login form with username, password, and sign in button', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByLabelText(/^username/i)).toBeDefined();
    expect(screen.getByLabelText(/^password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('allows user input in username and password fields', () => {
    renderWithProviders(<LoginPage />);

    const usernameInput = screen.getByLabelText(/^username/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i) as HTMLInputElement;

    fireEvent.change(usernameInput, { target: { value: 'admin' } });
    fireEvent.change(passwordInput, { target: { value: 'Secret123!' } });

    expect(usernameInput.value).toBe('admin');
    expect(passwordInput.value).toBe('Secret123!');
  });

  it('renders standard login form with back button and without demo credentials', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('link', { name: /back to home/i })).toBeDefined();
    expect(screen.queryByText(/demo credentials/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /copy and fill/i })).toBeNull();
  });
});
