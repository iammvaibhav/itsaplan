'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DndContext } from '@dnd-kit/core';
import { ChevronDown, Eye, Search, X } from 'lucide-react';
import {
  type AllTicket,
  type BoardIssue,
  type Column,
  type IssueType,
  type Label,
  type Assignee,
  type ProjectDetail,
} from '@/lib/api';
import { issuePath } from '@/utils/paths';
import { defaultViewSettings } from '@/utils/viewSettings';
import { type Maps, type IssueGroup, DEFAULT_COLOR } from '@/utils/project';
import { boardCollision } from '../../utils/kanban';
import { STATE_TYPE_ORDER } from '../../utils/allTickets';
import { useAllTicketsQuery } from '@/services/issues.service';
import { useProjectQuery } from '@/services/projects.service';
import { useCycleOptionsQuery } from '@/services/cycles.service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BoardColumn } from '../kanban/BoardColumn';
import { CollapsedColumn } from '../kanban/CollapsedColumn';
import { GroupDot } from '../shared/GroupDot';
import { SelectionProvider } from '../../context/useSelection';
import IssueDetail from '@/features/issue/components/detail/IssueDetail';
import IssueDetailSkeleton from '@/features/issue/components/detail/IssueDetailSkeleton';

const KANBAN_PROPERTIES = defaultViewSettings('kanban').properties;

function ticketToBoardIssue(ticket: AllTicket): BoardIssue {
  return {
    id: ticket.id,
    projectId: ticket.projectId,
    sequenceNumber: ticket.sequenceNumber,
    identifier: ticket.identifier,
    typeId: ticket.typeId,
    initiative: null,
    cycle: null,
    assigneeUserId: ticket.assigneeUserId,
    delegateUserId: null,
    columnId: ticket.columnId,
    parentId: null,
    title: ticket.title,
    description: '',
    priority: ticket.priority,
    estimatePoints: null,
    estimateMinutes: null,
    loggedMinutes: 0,
    startDate: null,
    dueDate: ticket.dueDate,
    position: ticket.position,
    createdAt: ticket.updatedAt,
    updatedAt: ticket.updatedAt,
    archivedAt: null,
    statusSince: ticket.updatedAt,
    shareToken: null,
    shareExtended: false,
    links: [],
    subtaskCount: 0,
    labelIds: ticket.labels.map((l) => l.id),
    fieldValues: [],
  };
}

// The global All tickets board: renders columns across state groups (backlog,
// unstarted, started, completed, canceled) with the project board column chrome
// and card presentation. Clicking a card opens the issue in a side panel.
export default function AllTicketsBoard() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tWorkItems = useTranslations('workItems');
  const tDisplay = useTranslations('display.stateTypes');
  const [queryText, setQueryText] = useState('');
  const deferredQuery = useDeferredValue(queryText.trim());
  const { data, isPending } = useAllTicketsQuery(deferredQuery ? { query: deferredQuery } : {});

  const rawTickets = useMemo(() => data?.issues ?? [], [data]);

  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [pinnedGroup, setPinnedGroup] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);

  const hiddenSet = useMemo(() => new Set(hiddenGroups), [hiddenGroups]);
  const collapsedSet = useMemo(() => new Set(collapsedGroups), [collapsedGroups]);

  const setHidden = (key: string, hide: boolean) => {
    setHiddenGroups((prev) => (hide ? [...prev, key] : prev.filter((k) => k !== key)));
    if (hide && pinnedGroup === key) setPinnedGroup(null);
  };

  const setCollapsed = (key: string, collapse: boolean) => {
    setCollapsedGroups((prev) => (collapse ? [...prev, key] : prev.filter((k) => k !== key)));
  };

  const togglePin = (key: string) => {
    setPinnedGroup((prev) => (prev === key ? null : key));
  };

  const groups: IssueGroup[] = useMemo(() => {
    return STATE_TYPE_ORDER.map((stateType) => ({
      key: stateType,
      name: tDisplay(stateType),
      stateType,
      color: DEFAULT_COLOR,
      assign: null,
      values: [stateType],
    }));
  }, [tDisplay]);

  const allBoardIssues = useMemo(() => rawTickets.map(ticketToBoardIssue), [rawTickets]);

  const issuesByGroup = useMemo(() => {
    const map = new Map<string, BoardIssue[]>();
    for (const group of groups) map.set(group.key, []);
    for (const ticket of rawTickets) {
      const list = map.get(ticket.stateType);
      if (list) list.push(ticketToBoardIssue(ticket));
    }
    return map;
  }, [groups, rawTickets]);

  const maps: Maps = useMemo(() => {
    const typeById = new Map<number, IssueType>();
    const labelById = new Map<number, Label>();
    const assigneeById = new Map<string, Assignee>();
    const columnById = new Map<number, Column>();

    for (const ticket of rawTickets) {
      if (ticket.typeId != null && ticket.typeName != null) {
        typeById.set(ticket.typeId, {
          id: ticket.typeId,
          projectId: ticket.projectId,
          name: ticket.typeName,
          color: ticket.typeColor ?? '#6b7280',
          icon: ticket.typeIcon ?? '',
          isDefault: false,
          position: 0,
        });
      }
      if (ticket.assigneeUserId != null && ticket.assigneeName != null) {
        assigneeById.set(ticket.assigneeUserId, {
          userId: ticket.assigneeUserId,
          name: ticket.assigneeName,
          email: '',
          username: null,
          image: ticket.assigneeImage,
          kind: 'member',
          agentKind: null,
          restrictedToUserId: null,
        });
      }
      for (const label of ticket.labels) {
        labelById.set(label.id, {
          id: label.id,
          projectId: ticket.projectId,
          name: label.name,
          color: label.color,
          groupId: null,
        });
      }
      columnById.set(ticket.columnId, {
        id: ticket.columnId,
        projectId: ticket.projectId,
        name: ticket.columnName,
        color: ticket.columnColor,
        stateType: ticket.stateType,
        position: ticket.position,
        wipLimit: null,
        wipMode: 'soft',
        autoAssignUserId: null,
      });
    }

    return { typeById, labelById, assigneeById, columnById };
  }, [rawTickets]);

  const dummyProject: ProjectDetail = useMemo(
    () => ({
      project: {
        id: 0,
        key: '',
        name: '',
        description: '',
        mcpEnabled: false,
        dashboardsEnabled: false,
        notesEnabled: false,
        checklistsEnabled: false,
        issueStatsEnabled: false,
        cyclesEnabled: false,
        initiativesEnabled: false,
        subtasksEnabled: false,
        timeTrackingEnabled: false,
        timeLoggingEnabled: false,
        pointsEstimateEnabled: false,
        timeEstimateEnabled: false,
        createdAt: '',
      },
      columns: Array.from(maps.columnById.values()),
      issueTypes: Array.from(maps.typeById.values()),
      labels: Array.from(maps.labelById.values()),
      labelGroups: [],
      assignees: Array.from(maps.assigneeById.values()),
      customFields: [],
      viewer: { role: 'member' },
      permissions: {} as unknown as ProjectDetail['permissions'],
      issues: allBoardIssues,
      plannedCycles: [],
    }),
    [maps, allBoardIssues],
  );

  const visibleGroups = groups.filter((g) => !hiddenSet.has(g.key));
  const hiddenGroupsList = groups.filter((g) => hiddenSet.has(g.key));
  const pinned = visibleGroups.find((g) => g.key === pinnedGroup) ?? null;
  const orderedGroups = pinned
    ? [pinned, ...visibleGroups.filter((g) => g !== pinned)]
    : visibleGroups;

  const validIds = useMemo(() => new Set(rawTickets.map((t) => t.id)), [rawTickets]);

  const selectedTicket = useMemo(
    () =>
      selectedIssueId != null ? (rawTickets.find((t) => t.id === selectedIssueId) ?? null) : null,
    [selectedIssueId, rawTickets],
  );

  const empty = !isPending && rawTickets.length === 0 && !deferredQuery;

  return (
    <SelectionProvider validIds={validIds}>
      <div className="flex h-full flex-col">
        <div className="flex h-11 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t('allTickets')}</span>
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t('searchTickets')}
              className="h-8 ps-9 pe-8 text-xs"
              aria-label={t('searchTickets')}
            />
            {queryText && (
              <button
                type="button"
                aria-label={tCommon('clearSearch')}
                onClick={() => setQueryText('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {empty && (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t('noTickets')}
          </div>
        )}

        {isPending && rawTickets.length === 0 && (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {tCommon('loading')}
          </div>
        )}

        {!empty && (!isPending || rawTickets.length > 0) && (
          <DndContext collisionDetection={boardCollision}>
            <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
              {orderedGroups.map((group) =>
                collapsedSet.has(group.key) ? (
                  <CollapsedColumn
                    key={group.key}
                    group={group}
                    count={issuesByGroup.get(group.key)?.length ?? 0}
                    wip={null}
                    pinned={group.key === pinnedGroup}
                    onExpand={() => setCollapsed(group.key, false)}
                    onTogglePin={() => togglePin(group.key)}
                    onAddIssue={() => {}}
                    readOnly={false}
                  />
                ) : (
                  <BoardColumn
                    key={group.key}
                    project={dummyProject}
                    group={group}
                    issues={issuesByGroup.get(group.key) ?? []}
                    maps={maps}
                    properties={KANBAN_PROPERTIES}
                    manualOrder={false}
                    wip={null}
                    filtered={!!deferredQuery}
                    boardIssues={allBoardIssues}
                    onMoveIssue={() => {}}
                    onOpenIssue={setSelectedIssueId}
                    onAddIssue={() => {}}
                    onHide={() => setHidden(group.key, true)}
                    onCollapse={() => setCollapsed(group.key, true)}
                    pinned={group.key === pinnedGroup}
                    onTogglePin={() => togglePin(group.key)}
                    readOnly={false}
                  />
                ),
              )}

              {hiddenGroupsList.length > 0 && (
                <div className="ml-auto w-64 shrink-0 self-start rounded-md border p-2">
                  <div className="flex w-full items-center gap-1.5 px-1 py-1 text-sm font-medium text-muted-foreground">
                    <ChevronDown className="size-4" />
                    {tWorkItems('hiddenColumns')}
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {hiddenGroupsList.map((group) => (
                      <div
                        key={group.key}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
                      >
                        <div className="flex items-center gap-2 text-foreground">
                          <GroupDot group={group} />
                          {group.name}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {issuesByGroup.get(group.key)?.length ?? 0}
                          </span>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-muted-foreground"
                              onClick={() => setHidden(group.key, false)}
                              aria-label={tWorkItems('show')}
                            >
                              <Eye />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tWorkItems('show')}</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DndContext>
        )}

        {selectedTicket && (
          <TicketSidePanel ticket={selectedTicket} onClose={() => setSelectedIssueId(null)} />
        )}
      </div>
    </SelectionProvider>
  );
}

function TicketSidePanel({ ticket, onClose }: { ticket: AllTicket; onClose: () => void }) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const projectQuery = useProjectQuery(ticket.projectKey);
  const cyclesQuery = useCycleOptionsQuery(
    projectQuery.data?.project.cyclesEnabled ? ticket.projectKey : null,
  );

  const projectDetail: ProjectDetail | null = useMemo(() => {
    if (!projectQuery.data) return null;
    return {
      ...projectQuery.data,
      issues: [],
      plannedCycles: cyclesQuery.data ?? [],
    };
  }, [projectQuery.data, cyclesQuery.data]);

  if (!projectDetail) {
    return (
      <div
        className="fixed inset-0 z-50 flex"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="ms-auto flex h-full w-full flex-col overflow-y-auto border-s bg-card px-5 pt-0 pb-5 sm:w-[720px] sm:max-w-[92vw] sm:px-8">
          <div className="sticky top-0 z-10 -mx-5 mb-3 flex items-center justify-between gap-2 bg-card/85 px-5 pt-5 pb-3 backdrop-blur-md sm:-mx-8 sm:px-8">
            <span className="text-xs text-muted-foreground">{ticket.identifier}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onClose}
                title={tCommon('close')}
              >
                <X />
              </Button>
            </div>
          </div>
          <IssueDetailSkeleton />
        </div>
      </div>
    );
  }

  return (
    <IssueDetail
      project={projectDetail}
      issueId={ticket.id}
      onClose={onClose}
      onExpand={(seq) => {
        router.push(issuePath(ticket.projectKey, seq ?? ticket.sequenceNumber));
        onClose();
      }}
    />
  );
}
