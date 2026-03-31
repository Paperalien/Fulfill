# Fulfill - Architecture & Implementation Plan

## Core Concept

A cross-platform work-item management application where a canonical "WorkItem" model supports multiple projections/views (Todo List, Trello-like Board, Scrum/Jira-like, Gantt chart).

**Key Principle**: Trello / to-do / Jira / Gantt are different lenses on the same underlying units of work, not different kinds of data.

## Tech Stack

- **React Native + Expo** (TypeScript) - Mobile (iOS/Android) + Web
- **React Native for Windows/macOS** - Desktop (added later)
- **Redux Toolkit** - State management (resume-friendly choice)
- **React Navigation** - Navigation
- **SQLite** (via expo-sqlite) - Local persistence (start with AsyncStorage, upgrade later)
- **React Hook Form** - Forms (when needed)

## Architecture Overview

### Domain Model

#### WorkItem (Canonical Unit of Work)

```typescript
{
  id: string (UUID/ULID)
  title: string
  notes?: string
  status: 'todo' | 'doing' | 'done'
  itemType: 'task' | 'bug' | 'story' (default 'task')
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueAt?: string (ISO date)
  completedAt?: string (ISO date)
  createdAt: string
  updatedAt: string
  estimate?: number (story points or hours)
  tags: string[]
  assignees: string[] (later)
  
  // Relationships
  parentId?: string (subtasks)
  dependsOnIds: string[] (for Gantt later)
  blocksIds: string[]
  linkedIds: string[]
}
```

#### Containers (View Projections)

View-specific layout is NOT stored on the work item. Containers define how items are organized:

- **TodoList** - Simple ordered list with sections/filters
- **Board** - Columns with ordered item IDs
- **Sprint** (Scrum) - Backlog ordering, workflow states
- **Gantt** - Scheduling derived from due/estimate/dependencies

#### ContainerItem (Placement Records)

Links work items to containers with ordering and metadata:
- `containerId`, `workItemId`, `order`, `metadata`

## Implementation Phases

### Phase 0: Verify Stack Works ✅

**Goal**: Get Expo running, verify it works on at least one platform.

**Tasks**:
1. Create Expo project: `npx create-expo-app@latest Fulfill --template blank-typescript`
2. Test on web: `npm start --web`
3. Test on mobile simulator if available

**Success Criteria**: App runs without errors, shows default Expo screen

---

### Phase 1: Simple Todo List (In-Memory)

**Goal**: Basic todo functionality using `useState` - no Redux, no persistence.

**Features**:
- List view showing todos
- Add new todo (title only)
- Inline edit (title, checkbox for done)
- Delete todo

**Tech**: React Navigation (basic), `useState` only

**Success Criteria**: Can add, edit, complete, and delete todos in memory

---

### Phase 2: Add Redux (Minimal)

**Goal**: Introduce Redux Toolkit, replace `useState` with Redux.

**Features**:
- Same functionality as Phase 1
- One slice: `workItemsSlice`
- Basic actions: `addWorkItem`, `updateWorkItem`, `deleteWorkItem`, `toggleComplete`

**Tech**: Redux Toolkit + React-Redux

**Success Criteria**: Same functionality, now using Redux for state

---

### Phase 3: Add Persistence (AsyncStorage)

**Goal**: Save data locally using AsyncStorage (simpler than SQLite).

**Features**:
- Save work items on changes
- Load work items on app start
- Data persists across app restarts

**Tech**: `@react-native-async-storage/async-storage`

**Success Criteria**: Todos persist after closing and reopening app

---

### Phase 4: Add Detail View

**Goal**: Full CRUD with detail editing screen.

**Features**:
- Navigate to detail screen for a work item
- Edit: title, notes, due date, tags
- Save changes
- Return to list

**Tech**: React Navigation (stack navigation), React Hook Form (optional)

**Success Criteria**: Can edit all work item fields via detail screen

---

### Phase 5: Add SQLite (When Needed)

**Goal**: Upgrade from AsyncStorage to SQLite for better performance/scalability.

**Features**:
- Replace AsyncStorage with SQLite
- Same interface, different backend
- Database schema for WorkItems

**Tech**: `expo-sqlite`, repository pattern

**Success Criteria**: Same functionality, now backed by SQLite

---

### Phase 6: Add Board View (Trello-like)

**Goal**: Add second view/projection - board with columns.

**Features**:
- Add Container model (Board type)
- Board has columns, columns have ordered item IDs
- Drag/drop to reorder items between columns
- Same WorkItems appear in both List and Board views

**Tech**: Drag & drop library (TBD), Container slice in Redux

**Success Criteria**: Same work items can be viewed as list or board

---

## Future Phases (Not Yet Implemented)

- **Phase 7**: Add Container/ContainerItem models for multiple simultaneous organizations
- **Phase 8**: Scrum/Sprint view projection
- **Phase 9**: Gantt chart view (using dependsOnIds, estimates, dueAt)
- **Phase 10**: Desktop platforms (Windows/macOS via React Native for Windows/macOS)
- **Phase 11**: Multi-device sync (operation log, conflict resolution)

## Project Structure (As We Build It)

```
Fulfill/
├── app/                          # Expo Router (if using) or App.tsx
├── src/
│   ├── domain/                   # Core domain models
│   │   └── WorkItem.ts           # WorkItem type definition
│   ├── store/                    # Redux (added in Phase 2)
│   │   ├── store.ts
│   │   ├── hooks.ts
│   │   └── slices/
│   │       └── workItemsSlice.ts
│   ├── components/               # UI components
│   │   └── workItem/
│   │       ├── WorkItemRow.tsx
│   │       └── WorkItemForm.tsx
│   ├── screens/                  # Screen components
│   │   ├── TodoListScreen.tsx
│   │   └── WorkItemDetailScreen.tsx
│   └── data/                     # Persistence (added in Phase 3)
│       └── storage.ts            # AsyncStorage wrapper (later SQLite)
├── package.json
└── tsconfig.json
```

## Design Principles

1. **Start Simple**: Build the simplest thing that works, add complexity incrementally
2. **Domain-First**: Build the domain model right (WorkItem), views are projections
3. **Resume-Friendly Tech**: Choose widely-recognized technologies (Redux Toolkit over Zustand)
4. **Local-First**: Structure persistence as if sync is coming (immutable IDs, timestamps)
5. **Platform Consistency**: UI as similar as possible across platforms

## Key Decisions Made

- ✅ **Redux Toolkit** over Zustand (more resume-friendly, team-familiar)
- ✅ **Expo** for mobile/web (fast iteration, good defaults)
- ✅ **React Native for Windows/macOS** for desktop (same ecosystem)
- ✅ **Incremental approach** - verify each phase before moving on
- ✅ **Start with AsyncStorage** - simpler than SQLite, upgrade when needed

## Notes

- We're intentionally NOT implementing everything at once
- Each phase should be fully working before moving to the next
- If external dependencies don't work, we'll know immediately at Phase 0
- The canonical WorkItem model enables future views without changing core data
