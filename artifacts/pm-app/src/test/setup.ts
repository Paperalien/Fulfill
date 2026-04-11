import '@testing-library/jest-dom';

// Set env vars needed by modules that read import.meta.env at module evaluation time
(import.meta as unknown as Record<string, unknown>).env = {
  VITE_API_BASE_URL: 'http://localhost:3000',
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
};
