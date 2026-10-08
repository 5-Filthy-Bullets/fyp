import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: LucideIcon;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Standard page header: icon tile, title, description, right-aligned actions.
 * Stacks on mobile, spreads out from `sm` up.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          {Icon !== undefined && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h1>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
