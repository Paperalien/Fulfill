import { useEffect, RefObject } from 'react';

export function useSearchShortcuts(
  inputRef: RefObject<HTMLInputElement | null>,
  value: string,
  onClear: () => void
) {
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (e.key === '/' && !isEditing) {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current?.focus();
        return;
      }

      if (e.key === 'f' && (isMac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape' && isEditing && target === inputRef.current) {
        if (value) {
          onClear();
        } else {
          inputRef.current?.blur();
        }
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [inputRef, value, onClear]);
}
