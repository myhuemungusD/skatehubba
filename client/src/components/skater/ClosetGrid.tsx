import { useMemo } from 'react';
import { useClosetFilter } from '@/store/closetFilter';
import { Badge } from '@/components/ui/badge';
import type { ClosetItem } from '@shared/schema';

interface ClosetGridProps {
  items: ClosetItem[];
}

const filterTypes: Array<'all' | 'deck' | 'trucks' | 'wheels' | 'shoes' | 'apparel' | 'accessory'> = [
  'all',
  'deck',
  'trucks',
  'wheels',
  'shoes',
  'apparel',
  'accessory',
];

export function ClosetGrid({ items }: ClosetGridProps) {
  const { type, setType } = useClosetFilter();

  const filtered = useMemo(
    () => (type === 'all' ? items : items.filter((i) => i.type === type)),
    [items, type]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {filterTypes.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded px-3 py-1 text-sm transition ${
              type === t
                ? 'bg-success text-black font-semibold'
                : 'bg-black/50 text-neutral-200 hover:bg-black/60'
            }`}
            data-testid={`filter-${t}`}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-white/10 bg-black/30 p-3 backdrop-blur-sm"
            data-testid={`closet-item-${item.id}`}
          >
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-36 w-full rounded object-cover"
            />
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">
                  {item.brand} — {item.name}
                </p>
                <p className="text-xs text-neutral-300">{item.type}</p>
              </div>
              {item.rarity && <Badge variant="secondary">{item.rarity}</Badge>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-neutral-300">
            Nothing in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}
