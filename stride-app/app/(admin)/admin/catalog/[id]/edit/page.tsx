import { notFound } from 'next/navigation';
import { Heading } from '@/components/admin/heading';
import { prisma } from '@/lib/prisma-client';
import { CategoryForm } from '../../_components/category-form';

export const metadata = { title: 'Редактирование категории' };
export const dynamic = 'force-dynamic';

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, tagline: true, coverImage: true, coverImagePublicId: true },
  });
  if (!category) notFound();

  return (
    <div className="space-y-8">
      <Heading title="Редактирование категории" description={category.name} />
      <CategoryForm initial={category} />
    </div>
  );
}
