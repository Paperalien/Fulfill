import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LoadingBoard } from './Layout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LoadingBoard', () => {
  it('shows a spinner initially (no timeout escape hatch yet)', () => {
    render(<LoadingBoard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('swaps the spinner for a Reload escape hatch after the timeout', () => {
    render(<LoadingBoard />);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    // Spinner is gone; an explicit, actionable fallback is shown instead so the
    // user is never stuck on an infinite spinner.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });
});
