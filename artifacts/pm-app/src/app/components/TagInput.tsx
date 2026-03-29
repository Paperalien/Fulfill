import { useState, KeyboardEvent } from 'react';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  readOnly?: boolean;
}

const TAG_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-yellow-100 text-yellow-700 border-yellow-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-red-100 text-red-700 border-red-200',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function TagBadge({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tagColor(tag)}`}
    >
      {tag}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagInput({ tags, onChange, placeholder = 'Add tag…', readOnly = false }: Props) {
  const [input, setInput] = useState('');

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1 items-center min-h-8 px-2 py-1 rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} onRemove={readOnly ? undefined : () => removeTag(tag)} />
      ))}
      {!readOnly && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => addTag(input)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-16 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}
