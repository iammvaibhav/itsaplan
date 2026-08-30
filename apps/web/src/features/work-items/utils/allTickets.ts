import type { AllTicket, StateType } from '@/lib/api';

// The display order of the global board's state groups: work flows left to
// right from the backlog to whatever closed it.
export const STATE_TYPE_ORDER: StateType[] = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
];

export interface ColumnMeta {
  name: string;
  stateType: StateType;
  position: number;
  color?: string;
}

// One column lane of the All tickets board: a column name and the tickets in it,
// in the order the API sent them (project, then column position).
export interface TicketColumnGroup {
  name: string;
  stateType: StateType;
  color?: string;
  tickets: AllTicket[];
}

export function stateTypeRank(stateType: StateType): number {
  const idx = STATE_TYPE_ORDER.indexOf(stateType);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

// Deterministic ordering rule for cross-project column lanes:
// 1. By lifecycle state group order (backlog < unstarted < started < completed < canceled)
// 2. By column position / rank within that state group (e.g. In Progress pos 2 < Ready to review pos 5)
// 3. By column name alphabetically as tie-breaker
export function compareColumns(a: ColumnMeta, b: ColumnMeta): number {
  const rankA = stateTypeRank(a.stateType);
  const rankB = stateTypeRank(b.stateType);
  if (rankA !== rankB) return rankA - rankB;
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
}

export interface GroupTicketsOptions {
  includeEmpty?: boolean;
  knownColumns?: Array<{ name: string; stateType: StateType; position?: number; color?: string }>;
}

// Groups the cross-project list by its column name. By default only
// non-empty groups are returned, ordered deterministically by state type
// lifecycle rank, then position, then name. Pass includeEmpty: true with
// knownColumns to include all known column lanes in deterministic display order.
export function groupTicketsByColumnName(
  tickets: AllTicket[],
  options?: GroupTicketsOptions,
): TicketColumnGroup[] {
  const columnsByName = new Map<string, ColumnMeta>();
  const ticketsByName = new Map<string, AllTicket[]>();

  // Register known columns if provided
  if (options?.knownColumns) {
    for (const col of options.knownColumns) {
      if (!columnsByName.has(col.name)) {
        columnsByName.set(col.name, {
          name: col.name,
          stateType: col.stateType,
          position: col.position ?? 0,
          color: col.color,
        });
      }
    }
  }

  // Collect from tickets
  for (const ticket of tickets) {
    if (!columnsByName.has(ticket.columnName)) {
      columnsByName.set(ticket.columnName, {
        name: ticket.columnName,
        stateType: ticket.stateType,
        position: ticket.position ?? 0,
        color: ticket.columnColor,
      });
    }
    const list = ticketsByName.get(ticket.columnName);
    if (list) list.push(ticket);
    else ticketsByName.set(ticket.columnName, [ticket]);
  }

  const sortedColumns = Array.from(columnsByName.values()).sort(compareColumns);

  const filterFn = options?.includeEmpty
    ? () => true
    : (c: ColumnMeta) => (ticketsByName.get(c.name)?.length ?? 0) > 0;

  return sortedColumns.filter(filterFn).map((col) => ({
    name: col.name,
    stateType: col.stateType,
    color: col.color,
    tickets: ticketsByName.get(col.name) ?? [],
  }));
}
