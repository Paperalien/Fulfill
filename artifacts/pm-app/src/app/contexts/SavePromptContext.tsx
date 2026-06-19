import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

// Lets non-adjacent components (specifically the first-run WelcomeIntro dialog)
// ask the always-mounted "Save your data" popover to open. AuthArea owns the
// popover; it watches `openRequest` and opens whenever the counter increments.
// A counter (rather than a boolean) makes every request observable even if the
// popover was reopened/closed in between.

interface SavePromptOpener {
  openRequest: number;
  requestOpenSavePrompt: () => void;
}

const SavePromptContext = createContext<SavePromptOpener | null>(null);

export function SavePromptProvider({ children }: { children: ReactNode }) {
  const [openRequest, setOpenRequest] = useState(0);
  const requestOpenSavePrompt = useCallback(
    () => setOpenRequest((n) => n + 1),
    [],
  );
  return (
    <SavePromptContext.Provider value={{ openRequest, requestOpenSavePrompt }}>
      {children}
    </SavePromptContext.Provider>
  );
}

// Falls back to a no-op when used outside a provider, so consumers (and their
// tests) work in isolation without wiring up the provider.
export function useSavePromptOpener(): SavePromptOpener {
  return (
    useContext(SavePromptContext) ?? {
      openRequest: 0,
      requestOpenSavePrompt: () => {},
    }
  );
}
