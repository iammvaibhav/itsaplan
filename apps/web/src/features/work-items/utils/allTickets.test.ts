import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AllTicket } from '@/lib/api';
import { groupTicketsByStateType, STATE_TYPE_ORDER } from './allTickets';

function ticket(stateType: AllTicket['stateType'], title = 'T'): AllTicket {
  return {
    id: 1,
    projectId: 1,
    projectKey: 'MKT',
    projectName: 'Marketing',
    sequenceNumber: 1,
    identifier: 'MKT-1',
    title,
    columnId: 10,
    columnName: 'Column',
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
    position: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    labels: [],
  };
}

describe('groupTicketsByStateType', () => {
  it('groups by state group in display order', () => {
    const groups = groupTicketsByStateType([
      ticket('started', 's1'),
      ticket('backlog', 'b1'),
      ticket('completed', 'c1'),
      ticket('started', 's2'),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.stateType, g.tickets.map((t) => t.title)]),
      [
        ['backlog', ['b1']],
        ['started', ['s1', 's2']],
        ['completed', ['c1']],
      ],
    );
  });

  it('keeps input order within a group', () => {
    const groups = groupTicketsByStateType([
      ticket('unstarted', 'first'),
      ticket('unstarted', 'second'),
    ]);
    assert.deepEqual(
      groups[0]!.tickets.map((t) => t.title),
      ['first', 'second'],
    );
  });

  it('drops empty groups and unknown state groups', () => {
    const groups = groupTicketsByStateType([ticket('canceled')]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.stateType, 'canceled');
    // A state value outside the known set has no lane to land in.
    const rogue = { ...ticket('started'), stateType: 'nonsense' as AllTicket['stateType'] };
    assert.deepEqual(groupTicketsByStateType([rogue]), []);
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
