'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { AlertModal } from '@/components/admin/ui/alert-modal';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/admin/ui/dialog';
import { formatPrice } from '@/lib/format';
import { deleteProduct } from '@/app/actions/admin/products';

export interface ProductRow {
  id: string;
  name: string;
  brand: string;
  categoryName: string;
  coverImage: string | null;
  minPrice: number;
  totalStock: number;
  active: boolean;
}

export function ProductTable({ rows }: { rows: ProductRow[] }) {
  const router = useRouter();
  const [toDelete, setToDelete] = React.useState<ProductRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [blockMsg, setBlockMsg] = React.useState<string | null>(null);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deleteProduct(toDelete.id);
    setDeleting(false);
    setToDelete(null);
    if (!res.ok) setBlockMsg(res.error);
    else router.refresh();
  }

  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Фото</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Бренд</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Цена от</TableHead>
            <TableHead>Остаток</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
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
              <TableCell className="text-admin-on-surface-variant">{row.brand}</TableCell>
              <TableCell className="text-admin-on-surface-variant">{row.categoryName}</TableCell>
              <TableCell>{formatPrice(row.minPrice)}</TableCell>
              <TableCell>
                {row.totalStock === 0 ? (
                  <span className="text-admin-error text-xs font-medium">нет в наличии</span>
                ) : (
                  row.totalStock
                )}
              </TableCell>
              <TableCell>
                <span className={row.active ? 'text-admin-on-surface' : 'text-admin-on-surface-variant'}>
                  {row.active ? 'Активен' : 'Черновик'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/catalog/products/${row.id}/edit`}>Изменить</Link>
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setToDelete(row)}>
                    Удалить
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Удалить товар?"
        description={toDelete ? `«${toDelete.name}» будет удалён безвозвратно.` : undefined}
      />

      <Dialog open={blockMsg !== null} onOpenChange={(open) => !open && setBlockMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нельзя удалить товар</DialogTitle>
            <DialogDescription>{blockMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setBlockMsg(null)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
