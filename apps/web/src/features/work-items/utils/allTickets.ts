import type { AllTicket, StateType } from '@/lib/api';

// The display order of the global board's state groups: work flows left to
// right from the backlog to whatever closed it. Column names differ per
// project — these groups do not.
export const STATE_TYPE_ORDER: StateType[] = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
];

// One column of the All tickets board: a state group and the tickets in it,
// in the order the API sent them (project, then column position).
export interface TicketStateGroup {
  stateType: StateType;
  tickets: AllTicket[];
}

// Groups the cross-project list by its column state group. By default only
// non-empty groups are returned; pass includeEmpty: true to include all known
// state groups in display order. Unknown state groups are dropped.
export function groupTicketsByStateType(
  tickets: AllTicket[],
  options?: { includeEmpty?: boolean },
): TicketStateGroup[] {
  const byState = new Map<StateType, AllTicket[]>();
  for (const ticket of tickets) {
    if (!STATE_TYPE_ORDER.includes(ticket.stateType)) continue;
    const list = byState.get(ticket.stateType);
    if (list) list.push(ticket);
    else byState.set(ticket.stateType, [ticket]);
  }
  const filterFn = options?.includeEmpty ? () => true : (s: StateType) => byState.has(s);
  return STATE_TYPE_ORDER.filter(filterFn).map((stateType) => ({
    stateType,
    tickets: byState.get(stateType) ?? [],
  }));
}
