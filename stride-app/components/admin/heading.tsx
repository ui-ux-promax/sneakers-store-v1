interface HeadingProps {
  title: string;
  description?: string;
}

// Заголовок страницы/секции в admin-shell
export function Heading({ title, description }: HeadingProps) {
  return (
    <div className="space-y-1">
      <h2 className="font-admin-head text-2xl font-bold text-admin-on-surface">{title}</h2>
      {description && (
        <p className="text-sm text-admin-on-surface-variant">{description}</p>
      )}
    </div>
  );
}
