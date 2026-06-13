import { Heading } from '@/components/admin/heading';
import { CategoryForm } from '../_components/category-form';

export const metadata = { title: 'Новая категория' };

export default function NewCategoryPage() {
  return (
    <div className="space-y-8">
      <Heading title="Новая категория" description="Создание категории каталога" />
      <CategoryForm />
    </div>
  );
}
