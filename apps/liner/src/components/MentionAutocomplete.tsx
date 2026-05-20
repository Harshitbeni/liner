import * as React from 'react';

export type MentionItem = {
  id: string;
  label: string;
  description: string;
  prefix: '@' | '/';
};

type Props = {
  items: MentionItem[];
  query: string;
  prefix: '@' | '/';
  onSelect: (item: MentionItem) => void;
  visible: boolean;
};

export function MentionAutocomplete({
  items,
  query,
  prefix,
  onSelect,
  visible,
}: Props) {
  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    return items
      .filter((i) => i.prefix === prefix)
      .filter(
        (i) =>
          !q ||
          i.id.toLowerCase().includes(q) ||
          i.label.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, query, prefix]);

  if (!visible || filtered.length === 0) return null;

  return (
    <ul className="mention-menu" role="listbox">
      {filtered.map((item) => (
        <li key={`${item.prefix}${item.id}`}>
          <button
            type="button"
            role="option"
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className="mention-prefix">{item.prefix}</span>
            <span className="mention-label">{item.label}</span>
            <span className="mention-desc">{item.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
