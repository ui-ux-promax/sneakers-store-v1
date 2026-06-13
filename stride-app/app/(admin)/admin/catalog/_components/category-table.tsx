'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { AlertModal } from '@/components/admin/ui/alert-modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/admin/ui/dialog';
import { deleteCategory, moveCategory } from '@/app/actions/admin/categories';

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  coverImage: string | null;
  productCount: number;
}

export function CategoryTable({ rows }: { rows: CategoryRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // Сообщение-блокировка показывается в отдельной модалке (категория с товарами / ошибка действия).
  const [blockMsg, setBlockMsg] = React.useState<string | null>(null);

  async function handleMove(id: string, dir: 'up' | 'down') {
    setPending(id);
    const res = await moveCategory(id, dir);
    if (!res.ok) {
      setBlockMsg(res.error);
    } else {
      router.refresh();
    }
    setPending(null);
  }

  // Клик «Удалить»: категория с товарами — сразу модалка-блок (без confirm); иначе — confirm.
  function requestDelete(row: CategoryRow) {
    if (row.productCount > 0) {
      setBlockMsg(`«${row.name}»: сначала перенесите или удалите ${row.productCount} товаров.`);
      return;
    }
    setToDelete(row);
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deleteCategory(toDelete.id);
    setDeleting(false);
    setToDelete(null);
    if (!res.ok) {
      // Серверный guard — источник истины (на случай гонки, если товар добавили после рендера).
      setBlockMsg(res.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Обложка</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Товаров</TableHead>
              <TableHead>Порядок</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.coverImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- admin thumb */
                    <img src={row.coverImage} alt="" className="h-10 w-10 rounded object-cover bg-admin-surface-high" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-admin-surface-high" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-admin-on-surface-variant">{row.slug}</TableCell>
                <TableCell>{row.productCount}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Вверх"
                      disabled={i === 0 || pending === row.id}
                      onClick={() => handleMove(row.id, 'up')}
                      className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
                    >
                      <Icon name="arrow_upward" />
                    </button>
                    <button
                      type="button"
                      aria-label="Вниз"
                      disabled={i === rows.length - 1 || pending === row.id}
                      onClick={() => handleMove(row.id, 'down')}
                      className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
                    >
                      <Icon name="arrow_downward" />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/catalog/${row.id}/edit`}>Изменить</Link>
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => requestDelete(row)}>
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Удалить категорию?"
        description={toDelete ? `«${toDelete.name}» будет удалена безвозвратно.` : undefined}
      />

      <Dialog open={blockMsg !== null} onOpenChange={(open) => !open && setBlockMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нельзя удалить категорию</DialogTitle>
            <DialogDescription>{blockMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setBlockMsg(null)}>
              Понятно
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
