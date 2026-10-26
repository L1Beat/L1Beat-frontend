import type { ReactNode } from 'react';

/**
 * Compact page title row. One line of title, one of context, controls on the
 * right. No eyebrow, no hero copy: the data starts within the first fold.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </header>
  );
}
