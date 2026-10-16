import { Link } from "@tanstack/react-router";
import { usePrefetchTicket } from "@/lib/tickets";

/**
 * Ticket title link with intent prefetch. Hovering or keyboard-focusing the
 * row warms the detail + thread queries the detail page reads, so the click
 * renders from cache instead of waiting on two round trips.
 */
export function TicketTitleLink({
  ticketId,
  title,
}: {
  readonly ticketId: string;
  readonly title: string;
}) {
  const prefetch = usePrefetchTicket(ticketId);

  return (
    <Link
      to="/tickets/$ticketId"
      params={{ ticketId }}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      className="block truncate text-sm font-medium text-primary hover:underline"
    >
      {title}
    </Link>
  );
}
