// Публичный API скелетон-компонентов админки STRIDE.
// Импорт: import { ListPageSkeleton, DetailPageSkeleton, FormPageSkeleton, DashboardSkeleton } from '@/components/admin/skeleton';
// Все компоненты серверные (без 'use client') — рендерятся в loading.tsx.

// --- Базовый примитив ---
export { Skeleton } from './skeleton';
export type { SkeletonProps, SkeletonRounded } from './skeleton';

// --- Страничные композиты (основной API для loading.tsx) ---
export { ListPageSkeleton } from './list-page-skeleton';
export type { ListPageSkeletonProps } from './list-page-skeleton';

export { DetailPageSkeleton } from './detail-page-skeleton';
export type { DetailPageSkeletonProps } from './detail-page-skeleton';

export { FormPageSkeleton } from './form-page-skeleton';
export type { FormPageSkeletonProps } from './form-page-skeleton';

export { DashboardSkeleton } from './dashboard-skeleton';

// --- Секционные блоки (для точечного переиспользования) ---
export { PageHeaderSkeleton } from './page-header-skeleton';
export type { PageHeaderSkeletonProps } from './page-header-skeleton';

export { FilterBarSkeleton } from './filter-bar-skeleton';
export type { FilterBarSkeletonProps } from './filter-bar-skeleton';

export { TableSkeleton } from './table-skeleton';
export type { TableSkeletonProps } from './table-skeleton';

export { StatCardsSkeleton } from './stat-cards-skeleton';
export type { StatCardsSkeletonProps } from './stat-cards-skeleton';

export { StatusChipsSkeleton } from './status-chips-skeleton';
export type { StatusChipsSkeletonProps } from './status-chips-skeleton';

export { SectionCardSkeleton } from './section-card-skeleton';
export type { SectionCardSkeletonProps, SectionVariant } from './section-card-skeleton';

export { DetailSkeleton } from './detail-skeleton';
export type { DetailSkeletonProps } from './detail-skeleton';

export { FormSkeleton } from './form-skeleton';
export type { FormSkeletonProps } from './form-skeleton';
