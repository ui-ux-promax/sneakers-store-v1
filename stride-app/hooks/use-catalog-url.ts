'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function useCatalogUrl() {
  const router = useRouter();
  const sp = useSearchParams();

  const getList = useCallback((key: string) => (sp.get(key)?.split(',').filter(Boolean) ?? []), [sp]);
  const get = useCallback((key: string) => sp.get(key) ?? '', [sp]);

  const push = useCallback((mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mutate(p);
    p.delete('page'); // любое изменение фильтра/сортировки сбрасывает страницу
    const qs = p.toString();
    router.push(qs ? `/catalog?${qs}` : '/catalog', { scroll: false });
  }, [router, sp]);

  const toggleInList = useCallback((key: string, value: string) => push((p) => {
    const cur = (p.get(key)?.split(',').filter(Boolean)) ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    if (next.length) p.set(key, next.join(',')); else p.delete(key);
  }), [push]);

  const setParam = useCallback((key: string, value: string | null) => push((p) => {
    if (value) p.set(key, value); else p.delete(key);
  }), [push]);

  const setPage = useCallback((page: number) => {
    const p = new URLSearchParams(sp.toString());
    if (page > 1) p.set('page', String(page)); else p.delete('page');
    router.push(`/catalog?${p.toString()}`, { scroll: false });
  }, [router, sp]);

  const setParams = useCallback((entries: Record<string, string | null>) => push((p) => {
    for (const [k, v] of Object.entries(entries)) { if (v) p.set(k, v); else p.delete(k); }
  }), [push]);

  const reset = useCallback(() => router.push('/catalog', { scroll: false }), [router]);

  return { sp, get, getList, toggleInList, setParam, setParams, setPage, reset };
}
