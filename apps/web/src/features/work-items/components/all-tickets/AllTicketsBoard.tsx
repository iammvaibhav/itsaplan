'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, Search, X } from 'lucide-react';
import { type AllTicket } from '@/lib/api';
import { issuePath } from '@/utils/paths';
import { formatShortDate, isDueOverdue } from '@/utils/dates';
import {
  AssigneeAvatar,
  DateBadge,
  LabelBadge,
  PriorityBadge,
} from '@/features/issue/components/shared/IssueBadges';
import { StateIcon } from '@/features/issue/components/shared/IssueIcons';
import { groupTicketsByStateType } from '../../utils/allTickets';
import { useAllTicketsQuery } from '@/services/issues.service';
import { Input } from '@/components/ui/input';

// The global All tickets board: one lane per column state group (backlog,
// unstarted, started, completed, canceled), every ticket across the projects the
// user can reach. Read-only by design (ADR 0002 keeps writes per-project): a
// card deep-links into its own project's issue page, where the normal write
// paths live.
export default function AllTicketsBoard() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tDisplay = useTranslations('display.stateTypes');
  const router = useRouter();
  const [queryText, setQueryText] = useState('');
  // Holds the previous list while the filtered one loads, so typing does not
  // blank the board between keystrokes.
  const deferredQuery = useDeferredValue(queryText.trim());
  const { data, isPending } = useAllTicketsQuery(deferredQuery ? { query: deferredQuery } : {});

  const groups = useMemo(() => groupTicketsByStateType(data?.issues ?? []), [data]);
  const empty = !isPending && groups.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="ms-auto w-64 shrink-0 px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={t('searchTickets')}
            className="ps-9 pe-8"
            aria-label={t('searchTickets')}
          />
          {queryText && (
            <button
              type="button"
              aria-label={tCommon('clearSearch')}
              onClick={() => setQueryText('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {empty && (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {t('noTickets')}
        </div>
      )}

      {isPending && groups.length === 0 && (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {tCommon('loading')}
        </div>
      )}

      {!empty && (
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
          {groups.map((group) => (
            <section
              key={group.stateType}
              className="flex max-h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/40"
              aria-label={tDisplay(group.stateType)}
            >
              <header className="flex items-center gap-2 px-3 py-2">
                <StateIcon stateType={group.stateType} color="#6b7280" />
                <span className="truncate text-sm font-medium">{tDisplay(group.stateType)}</span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                  {group.tickets.length}
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {group.tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onOpen={() => router.push(issuePath(ticket.projectKey, ticket.sequenceNumber))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// One card on the global board. The project chip replaces what a per-project
// board never needs: which project the ticket belongs to. The lane already says
// the state group, so the card does not repeat its per-project column name.
function TicketCard({ ticket, onOpen }: { ticket: AllTicket; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-md border bg-card px-3 py-2.5 text-start shadow-sm transition-colors hover:bg-accent/50"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{ticket.identifier}</span>
        <span
          className="max-w-24 truncate rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
          title={ticket.projectName}
        >
          {ticket.projectKey}
        </span>
      </div>

      <div className="mb-2 line-clamp-3 text-sm leading-snug">{ticket.title}</div>

      <div className="flex min-h-5 flex-wrap items-center gap-1">
        {ticket.priority && <PriorityBadge priority={ticket.priority} />}
        {ticket.dueDate && (
          <DateBadge
            icon={<CalendarClock className="size-3.5" />}
            date={formatShortDate(ticket.dueDate)}
            overdue={isDueOverdue(ticket.dueDate)}
          />
        )}
        {ticket.labels.map((l) => (
          <LabelBadge key={l.id} color={l.color} name={l.name} />
        ))}
        {ticket.assigneeUserId && ticket.assigneeName && (
          <span className="ms-auto inline-flex">
            <AssigneeAvatar name={ticket.assigneeName} image={ticket.assigneeImage} />
          </span>
        )}
      </div>
    </button>
  );
}
