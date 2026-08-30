import assert from 'node:assert/strict';
// @ts-expect-error vitest is provided at workspace level
import { describe, it } from 'vitest';
import type { AllTicket, StateType } from '@/lib/api';
import {
  groupTicketsByColumnName,
  compareColumns,
  STATE_TYPE_ORDER,
  type ColumnMeta,
} from './allTickets';

function ticket(columnName: string, stateType: StateType, title = 'T', position = 0): AllTicket {
  return {
    id: 1,
    projectId: 1,
    projectKey: 'MKT',
    projectName: 'Marketing',
    sequenceNumber: 1,
    identifier: 'MKT-1',
    title,
    columnId: 10,
    columnName,
    columnColor: '#000000',
    stateType,
    typeId: null,
    typeName: null,
    typeIcon: null,
    typeColor: null,
    priority: null,
    assigneeUserId: null,
    assigneeName: null,
    assigneeImage: null,
    dueDate: null,
    position,
    updatedAt: '2026-01-01T00:00:00.000Z',
    labels: [],
  };
}

describe('groupTicketsByColumnName', () => {
  it('groups by column name in deterministic lifecycle order, keeping In Progress and Ready to review separate', () => {
    const groups = groupTicketsByColumnName([
      ticket('Ready to review', 'started', 'r1', 5),
      ticket('Backlog', 'backlog', 'b1', 0),
      ticket('Done', 'completed', 'd1', 3),
      ticket('In Progress', 'started', 'p1', 2),
      ticket('Todo', 'unstarted', 't1', 1),
      ticket('Canceled', 'canceled', 'c1', 4),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.name, g.stateType, g.tickets.map((t) => t.title)]),
      [
        ['Backlog', 'backlog', ['b1']],
        ['Todo', 'unstarted', ['t1']],
        ['In Progress', 'started', ['p1']],
        ['Ready to review', 'started', ['r1']],
        ['Done', 'completed', ['d1']],
        ['Canceled', 'canceled', ['c1']],
      ],
    );
  });

  it('keeps input order within a column group', () => {
    const groups = groupTicketsByColumnName([
      ticket('Todo', 'unstarted', 'first', 1),
      ticket('Todo', 'unstarted', 'second', 1),
    ]);
    assert.deepEqual(
      groups[0]!.tickets.map((t) => t.title),
      ['first', 'second'],
    );
  });

  it('drops empty groups by default', () => {
    const groups = groupTicketsByColumnName([ticket('Canceled', 'canceled', 'c1', 4)]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.name, 'Canceled');
    assert.equal(groups[0]!.stateType, 'canceled');
  });

  it('includes empty groups when requested with knownColumns', () => {
    const knownColumns: ColumnMeta[] = [
      { name: 'Backlog', stateType: 'backlog', position: 0 },
      { name: 'Todo', stateType: 'unstarted', position: 1 },
      { name: 'In Progress', stateType: 'started', position: 2 },
      { name: 'Ready to review', stateType: 'started', position: 5 },
      { name: 'Done', stateType: 'completed', position: 3 },
      { name: 'Canceled', stateType: 'canceled', position: 4 },
    ];
    const groups = groupTicketsByColumnName([ticket('In Progress', 'started', 'p1', 2)], {
      includeEmpty: true,
      knownColumns,
    });
    assert.equal(groups.length, 6);
    assert.deepEqual(
      groups.map((g) => [g.name, g.tickets.length]),
      [
        ['Backlog', 0],
        ['Todo', 0],
        ['In Progress', 1],
        ['Ready to review', 0],
        ['Done', 0],
        ['Canceled', 0],
      ],
    );
  });

  it('orders columns deterministically by stateType rank, then position, then name', () => {
    const cols: ColumnMeta[] = [
      { name: 'Done', stateType: 'completed', position: 3 },
      { name: 'Ready to review', stateType: 'started', position: 5 },
      { name: 'In Progress', stateType: 'started', position: 2 },
      { name: 'Backlog', stateType: 'backlog', position: 0 },
      { name: 'Todo', stateType: 'unstarted', position: 1 },
      { name: 'Canceled', stateType: 'canceled', position: 4 },
    ];
    const sorted = [...cols].sort(compareColumns);
    assert.deepEqual(
      sorted.map((c) => c.name),
      ['Backlog', 'Todo', 'In Progress', 'Ready to review', 'Done', 'Canceled'],
    );
  });

  it('orders every known state group', () => {
    assert.deepEqual(STATE_TYPE_ORDER, [
      'backlog',
      'unstarted',
      'started',
      'completed',
      'canceled',
    ]);
  });
});
