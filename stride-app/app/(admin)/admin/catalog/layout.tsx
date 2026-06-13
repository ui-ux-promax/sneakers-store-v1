import { CatalogTabs } from './_components/catalog-tabs';

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <CatalogTabs />
      {children}
    </div>
  );
}
