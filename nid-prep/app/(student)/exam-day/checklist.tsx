"use client";
import { useOptimistic, useTransition } from "react";
import { toggleChecklist } from "./actions";

interface Item {
  id: string;
  label: string;
  detail?: string;
  due?: string;
}

export function Checklist({ items, done }: { items: Item[]; done: string[] }) {
  const [, start] = useTransition();
  const [ticked, setTicked] = useOptimistic(new Set(done), (state, { id, on }: { id: string; on: boolean }) => {
    const next = new Set(state);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const on = ticked.has(item.id);
        return (
          <li key={item.id}>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  const value = e.target.checked;
                  start(async () => {
                    setTicked({ id: item.id, on: value });
                    await toggleChecklist(item.id, value);
                  });
                }}
                className="mt-1 size-5 accent-[var(--accent)]"
              />
              <span>
                <span className={on ? "text-ink-3 line-through" : ""}>{item.label}</span>
                {item.due && <span className="ml-2 text-xs text-ink-3">by {item.due.slice(5).split("-").reverse().join("/")}</span>}
                {item.detail && <span className="block text-sm text-ink-3">{item.detail}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
