// Standard content-page container: left-aligned, single consistent max width,
// consistent padding. Single source of truth so page widths don't drift again.
// NOTE: do NOT add `mx-auto` — centering is what made content drift to the middle
// of the pane on wide screens. The Kanban board intentionally opts out (full-width).
export const PAGE_CONTAINER = 'p-6 max-w-5xl w-full';
