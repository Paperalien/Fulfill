import { Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { readLastEmail } from '../lib/localStore';
import { useSavePromptOpener } from '../contexts/SavePromptContext';

// "Save your data" / "Sign in" link for the mobile drawer. The drawer (a Radix
// Sheet) unmounts when closed, so it can't host the save dialog itself — this is
// just a trigger that asks the always-mounted SavePrompt dialog to open.
export function SaveDataTrigger() {
  const { isAuthenticated } = useAuth();
  const { requestOpenSavePrompt } = useSavePromptOpener();

  if (isAuthenticated) return null;
  const remembered = readLastEmail();

  return (
    <button
      onClick={requestOpenSavePrompt}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={remembered ? 'Sign in' : 'Save your data'}
    >
      <Mail size={14} />
      <span>{remembered ? 'Sign in' : 'Save your data'}</span>
    </button>
  );
}
