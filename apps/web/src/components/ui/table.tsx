import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "@/lib/utils";

const tableContainerVariants = cva("w-full max-w-full overflow-x-auto", {
  defaultVariants: { variant: "default" },
  variants: {
    variant: {
      card: "rounded-xl border bg-card shadow-xs/5",
      default: "rounded-lg border",
    },
  },
});

export interface TableProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof tableContainerVariants> {
  readonly children?: React.ReactNode;
}

/**
 * Structured data display. Set `variant="card"` when the grid stands alone
 * without an outer card shell; inside a CardPanel the default bordered
 * container is enough.
 */
export function Table({ className, variant, children, ...props }: TableProps): React.ReactElement {
  return (
    <div
      data-slot="table-container"
      className={cn(tableContainerVariants({ variant }), className)}
      {...props}
    >
      <table data-slot="table" className="w-full caption-bottom border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>): React.ReactElement {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableHeaderCellElement>): React.ReactElement {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableDataCellElement>): React.ReactElement {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
