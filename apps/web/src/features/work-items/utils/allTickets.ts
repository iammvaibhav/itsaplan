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

// Groups the cross-project list by its column state group. A group with no
// tickets is left out entirely (a member of no project's backlog should not
// see an empty Backlog lane), and unknown state groups are dropped rather
// than invented into lanes the UI has no label or icon for.
export function groupTicketsByStateType(tickets: AllTicket[]): TicketStateGroup[] {
  const byState = new Map<StateType, AllTicket[]>();
  for (const ticket of tickets) {
    const list = byState.get(ticket.stateType);
    if (list) list.push(ticket);
    else byState.set(ticket.stateType, [ticket]);
  }
  return STATE_TYPE_ORDER.filter((s) => byState.has(s)).map((stateType) => ({
    stateType,
    tickets: byState.get(stateType)!,
  }));
}
