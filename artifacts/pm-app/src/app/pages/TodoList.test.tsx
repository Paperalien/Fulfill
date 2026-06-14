import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const { mockUpdateTask, mockAddTask, mockDeleteTask, mockArchiveDoneTasks } = vi.hoisted(() => ({
  mockUpdateTask: vi.fn(),
  mockAddTask: vi.fn(),
  mockDeleteTask: vi.fn(),
  mockArchiveDoneTasks: vi.fn(),
}));

// ── Context mock ──────────────────────────────────────────────────────────────

vi.mock('../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    tasks: [
      {
        id: 'task-1',
        title: 'Task One',
        notes: '',
        columnId: 'col-todo',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        order: 0,
        tags: [],
      },
      {
        id: 'task-2',
        title: 'Task Two',
        notes: 'Some notes',
        columnId: 'col-ip',
        inProgressAt: '2025-01-02T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        order: 1,
        tags: [],
      },
    ],
    columns: [
      { id: 'col-todo', name: 'To Do', order: 0, semanticStatus: 'not-started' },
      { id: 'col-ip', name: 'In Progress', order: 1, semanticStatus: 'in-progress' },
      { id: 'col-done', name: 'Done', order: 2, semanticStatus: 'done' },
    ],
    loading: false,
    addTask: mockAddTask,
    updateTask: mockUpdateTask,
    deleteTask: mockDeleteTask,
    archiveDoneTasks: mockArchiveDoneTasks,
    doneColumnIds: () => ['col-done'],
  }),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import TodoList from './TodoList';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAddTask.mockReturnValue({
    id: 'new-task',
    title: '',
    notes: '',
    columnId: 'col-todo',
    createdAt: '',
    updatedAt: '',
    order: 0,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TodoList', () => {
  it('renders tasks', () => {
    render(<TodoList />);
    expect(screen.getByText('Task One')).toBeInTheDocument();
    expect(screen.getByText('Task Two')).toBeInTheDocument();
  });

  it('clicking a task title opens the accordion with edit fields', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('task-title-task-1'));

    expect(screen.getByTestId('edit-title-input')).toBeInTheDocument();
    expect(screen.getByTestId('edit-description-input')).toBeInTheDocument();
  });

  it('accordion contains a Steps section with an add-step input', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('task-title-task-1'));

    expect(screen.getByText(/steps/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add a step/i)).toBeInTheDocument();
  });

  it('pressing Enter in the step input calls addTask with the parent id', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('task-title-task-1'));
    await user.type(screen.getByPlaceholderText(/add a step/i), 'My step{Enter}');

    expect(mockAddTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My step', parentId: 'task-1' }),
    );
  });

  it('clicking Save calls updateTask and closes the accordion', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('task-title-task-1'));
    await user.click(screen.getByTestId('edit-save-btn'));

    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', expect.any(Object));
    expect(screen.queryByTestId('edit-title-input')).not.toBeInTheDocument();
  });

  it('clicking Cancel closes the accordion without calling updateTask', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('task-title-task-1'));
    await user.click(screen.getByTestId('edit-cancel-btn'));

    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(screen.queryByTestId('edit-title-input')).not.toBeInTheDocument();
  });

  it('clicking the status pill on a not-started task calls updateTask with the in-progress column id', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    const row1 = screen.getByTestId('task-row-task-1');
    await user.click(within(row1).getByRole('button', { name: /not started/i }));

    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { columnId: 'col-ip' });
  });

  it('clicking the status button on an in-progress task calls updateTask with the not-started column id', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    const row2 = screen.getByTestId('task-row-task-2');
    await user.click(within(row2).getByTitle(/click to revert/i));

    expect(mockUpdateTask).toHaveBeenCalledWith('task-2', { columnId: 'col-todo' });
  });

  it('"+ Add a task…" button opens the inline add form', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('add-task-btn'));

    expect(screen.getByTestId('new-task-title')).toBeInTheDocument();
  });

  it('typing a title and pressing Enter in the inline add form calls addTask', async () => {
    const user = userEvent.setup();
    render(<TodoList />);

    await user.click(screen.getByTestId('add-task-btn'));
    await user.type(screen.getByTestId('new-task-title'), 'New task{Enter}');

    expect(mockAddTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New task', columnId: 'col-todo' }),
    );
  });
});
