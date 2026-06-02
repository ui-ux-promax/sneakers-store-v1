export function SpecsTable({ specs }: { specs: Record<string, string> | null }) {
  if (!specs || Object.keys(specs).length === 0) return null;
  return (
    <aside className="rounded-2xl border border-line bg-surface p-6 h-fit">
      <h3 className="font-semibold text-sm mb-3">Характеристики</h3>
      <dl className="text-sm divide-y divide-line">
        {Object.entries(specs).map(([k, v]) => (
          <div key={k} className="flex justify-between py-2">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-medium tnum">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
