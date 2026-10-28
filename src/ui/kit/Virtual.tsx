import React, { useEffect, useRef, useState } from 'react';
import { gridColumns, virtualRange } from './logic.ts';

/** Virtual scrolling list with fixed row height: renders only the visible rows (plus overscan), however long the list is. */
export function VirtualList<T>({ items, rowHeight, height, renderRow, className = '', getKey }: { items: T[]; rowHeight: number; height: number | string; renderRow: (item: T, index: number) => React.ReactNode; className?: string; getKey?: (item: T, index: number) => React.Key }) {
  const ref = useRef<HTMLDivElement>(null); const [top, setTop] = useState(0); const [h, setH] = useState(typeof height === 'number' ? height : 400);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setH(el.clientHeight || 400)); ro.observe(el); setH(el.clientHeight || 400); return () => ro.disconnect(); }, []);
  const r = virtualRange(top, h, rowHeight, items.length);
  return (
    <div ref={ref} className={`k-vscroll ${className}`} style={{ height }} onScroll={(e) => setTop(e.currentTarget.scrollTop)} role="list">
      <div style={{ height: r.padTop }} aria-hidden />
      {items.slice(r.first, r.last).map((it, i) => <div key={getKey ? getKey(it, r.first + i) : r.first + i} role="listitem" style={{ height: rowHeight }}>{renderRow(it, r.first + i)}</div>)}
      <div style={{ height: r.padBottom }} aria-hidden />
    </div>
  );
}

/** Virtual grid of equally sized cells (inventory, codex). Rows are virtualised, columns follow the container width. */
export function VirtualGrid<T>({ items, cell, gap = 8, height, renderCell, className = '' }: { items: T[]; cell: number; gap?: number; height: number | string; renderCell: (item: T, index: number) => React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null); const [top, setTop] = useState(0); const [size, setSize] = useState({ w: 320, h: typeof height === 'number' ? height : 400 });
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 320, h: el.clientHeight || 400 })); ro.observe(el); setSize({ w: el.clientWidth || 320, h: el.clientHeight || 400 }); return () => ro.disconnect(); }, []);
  const cols = gridColumns(size.w, cell, gap); const rows = Math.ceil(items.length / cols); const rowH = cell + gap;
  const r = virtualRange(top, size.h, rowH, rows, 2);
  const slice = items.slice(r.first * cols, r.last * cols);
  return (
    <div ref={ref} className={`k-vscroll ${className}`} style={{ height }} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
      <div style={{ height: r.padTop }} aria-hidden />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap, justifyContent: 'center' }}>{slice.map((it, i) => <React.Fragment key={r.first * cols + i}>{renderCell(it, r.first * cols + i)}</React.Fragment>)}</div>
      <div style={{ height: r.padBottom }} aria-hidden />
    </div>
  );
}
