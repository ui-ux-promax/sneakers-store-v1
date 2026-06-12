'use client';

import { useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from './button';
import { Input } from './input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

export type DataTableServerPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  /**
   * Server pagination mode: скрывает встроенный поиск, навигация через колбэки.
   * Данные уже постранично нарезаны снаружи — таблица не режет.
   */
  serverPagination?: DataTableServerPagination;
  /**
   * Стабильный React-ключ по данным строки (например id).
   * Без этого react-table использует индекс — stateful-ячейки теряют стейт при смене страницы.
   */
  getRowId?: (row: TData, index: number) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  serverPagination,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const isServer = Boolean(serverPagination);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: isServer ? undefined : getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: isServer ? undefined : getFilteredRowModel(),
    manualPagination: isServer,
    getRowId,
    state: { columnFilters },
  });

  return (
    <div>
      {!isServer && searchKey ? (
        <div className="flex items-center py-4">
          <Input
            placeholder="Поиск..."
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn(searchKey)?.setFilterValue(e.target.value)}
            className="max-w-sm"
          />
        </div>
      ) : null}

      {/* обёртка с admin-бордером и скруглением */}
      <div className="border border-admin-outline-variant rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-admin-on-surface-variant">
                  Нет данных.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {isServer && serverPagination ? (
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="text-xs text-admin-on-surface-variant">
            Страница {serverPagination.page} из {Math.max(serverPagination.totalPages, 1)} ·{' '}
            всего {serverPagination.total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={serverPagination.onPrevious}
              disabled={serverPagination.page <= 1}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={serverPagination.onNext}
              disabled={serverPagination.page >= serverPagination.totalPages}
            >
              Вперёд
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end py-4 space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Назад
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Вперёд
          </Button>
        </div>
      )}
    </div>
  );
}
