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
 * Mobile-first: stacks with full-width actions, spreads out from `sm` up.
 * Title uses clamp() so it shrinks on 320px screens without truncating.
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
        "flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="flex items-center gap-2.5 text-[clamp(1.25rem,1rem+4vw,1.5rem)] leading-tight font-semibold tracking-tight">
          {Icon !== undefined && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <span className="min-w-0 break-words">{title}</span>
        </h1>
        {description !== undefined && (
          <p className="text-sm break-words text-muted-foreground">{description}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="grid w-full shrink-0 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {actions}
        </div>
      )}
    </div>
  );
}
