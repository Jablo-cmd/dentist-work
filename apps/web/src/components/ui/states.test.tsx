import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { EmptyState, ErrorState } from './states';

describe('state components', () => {
  it('renders an accessible error with the support reference', () => {
    render(
      <ErrorState error={new ApiRequestError('Access denied.', 403, 'FORBIDDEN', 'req-1234567')} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied.');
    expect(screen.getByText(/req-1234567/)).toBeInTheDocument();
  });
  it('does not leak unknown error details', () => {
    render(<ErrorState error={new Error('SQL exploded: secret')} />);
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });
  it('renders an empty state', () => {
    render(<EmptyState title="Nothing here" description="Add something." />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
