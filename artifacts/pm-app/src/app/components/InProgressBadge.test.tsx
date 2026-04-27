import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InProgressBadge } from './InProgressBadge';
import { Task, KanbanColumn } from '../types/task';

const COLUMNS: KanbanColumn[] = [
  { id: 'col-todo', name: 'To Do', order: 0, semanticStatus: 'not-started' },
  { id: 'col-ip', name: 'In Progress', order: 1, semanticStatus: 'in-progress' },
  { id: 'col-done', name: 'Done', order: 2, semanticStatus: 'done' },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    notes: '',
    columnId: 'col-todo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    ...overrides,
  };
}

describe('InProgressBadge — read-only mode (no onClick)', () => {
  it('renders nothing for a not-started task', () => {
    const { container } = render(
      <InProgressBadge task={makeTask({ columnId: 'col-todo' })} columns={COLUMNS} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a done task', () => {
    const { container } = render(
      <InProgressBadge task={makeTask({ columnId: 'col-done' })} columns={COLUMNS} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a blue badge (no button) for an in-progress task', () => {
    render(
      <InProgressBadge
        task={makeTask({ columnId: 'col-ip', inProgressAt: new Date().toISOString() })}
        columns={COLUMNS}
      />,
    );
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('InProgressBadge — interactive mode (onClick provided)', () => {
  it('renders a "not started" pill for a not-started task', () => {
    render(
      <InProgressBadge
        task={makeTask({ columnId: 'col-todo' })}
        columns={COLUMNS}
        onClick={vi.fn()}
      />,
    );
    const pill = screen.getByRole('button', { name: /not started/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('title', 'Mark in progress');
  });

  it('renders a clickable blue button for an in-progress task', () => {
    render(
      <InProgressBadge
        task={makeTask({ columnId: 'col-ip', inProgressAt: new Date().toISOString() })}
        columns={COLUMNS}
        onClick={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('In Progress');
  });

  it('click on not-started pill calls onClick and stops propagation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const parentClick = vi.fn();

    const { container } = render(
      <div onClick={parentClick}>
        <InProgressBadge
          task={makeTask({ columnId: 'col-todo' })}
          columns={COLUMNS}
          onClick={onClick}
        />
      </div>,
    );

    await user.click(within(container).getByRole('button', { name: /not started/i }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('click on in-progress button calls onClick and stops propagation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const parentClick = vi.fn();

    const { container } = render(
      <div onClick={parentClick}>
        <InProgressBadge
          task={makeTask({ columnId: 'col-ip', inProgressAt: new Date().toISOString() })}
          columns={COLUMNS}
          onClick={onClick}
        />
      </div>,
    );

    await user.click(within(container).getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
