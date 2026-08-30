'use client';

import { useDeferredValue, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DndContext, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Eye, Search, X } from 'lucide-react';
import {
  api,
  type AllTicket,
  type AllTickets,
  type BoardIssue,
  type Column,
  type IssuePatch,
  type IssueType,
  type Label,
  type Assignee,
  type ProjectDetail,
} from '@/lib/api';
import { useDndSensors } from '@/lib/dnd';
import { issuePath } from '@/utils/paths';
import { defaultViewSettings } from '@/utils/viewSettings';
import { positionsAt, type Maps, type IssueGroup, DEFAULT_COLOR } from '@/utils/project';
import { boardCollision, draggedIds, issuesToMove, type BoardDropData } from '../../utils/kanban';
import { compareColumns, type ColumnMeta } from '../../utils/allTickets';
import { useAllTicketsQuery } from '@/services/issues.service';
import { useProjectQuery, useProjectsQuery } from '@/services/projects.service';
import { useCycleOptionsQuery } from '@/services/cycles.service';
import { qk } from '@/services/queryKeys';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BoardColumn } from '../kanban/BoardColumn';
import { CollapsedColumn } from '../kanban/CollapsedColumn';
import { CardOverlay } from '../kanban/CardOverlay';
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

// The global All tickets board: renders columns grouped by column name across
// projects, ordered deterministically by state type lifecycle rank, column position,
// and name. Dropping a ticket moves it to the column of that name in its own project.
export default function AllTicketsBoard() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tWorkItems = useTranslations('workItems');
  const [queryText, setQueryText] = useState('');
  const deferredQuery = useDeferredValue(queryText.trim());
  const { data, isPending } = useAllTicketsQuery(deferredQuery ? { query: deferredQuery } : {});

  const rawTickets = useMemo(() => data?.issues ?? [], [data]);

  const { data: projects } = useProjectsQuery();
  const projectQueries = useQueries({
    queries: (projects ?? []).map((p) => ({
      queryKey: qk.project(p.key),
      queryFn: () => api.getProject(p.key),
      staleTime: 1000 * 60 * 5,
    })),
  });

  const { columnsByProjectKey, knownColumns } = useMemo(() => {
    const byProjectKey = new Map<string, Column[]>();
    const colMap = new Map<string, ColumnMeta>();

    for (let i = 0; i < (projects ?? []).length; i++) {
      const p = projects![i];
      const scaffold = projectQueries[i]?.data;
      if (scaffold?.columns) {
        byProjectKey.set(p.key, scaffold.columns);
        for (const col of scaffold.columns) {
          if (!colMap.has(col.name)) {
            colMap.set(col.name, {
              name: col.name,
              stateType: col.stateType,
              position: col.position,
              color: col.color,
            });
          }
        }
      }
    }

    for (const t of rawTickets) {
      if (!byProjectKey.has(t.projectKey)) {
        byProjectKey.set(t.projectKey, []);
      }
      const list = byProjectKey.get(t.projectKey)!;
      if (!list.some((c) => c.id === t.columnId)) {
        list.push({
          id: t.columnId,
          projectId: t.projectId,
          name: t.columnName,
          color: t.columnColor,
          stateType: t.stateType,
          position: t.position,
          wipLimit: null,
          wipMode: 'soft',
          autoAssignUserId: null,
        });
      }
      if (!colMap.has(t.columnName)) {
        colMap.set(t.columnName, {
          name: t.columnName,
          stateType: t.stateType,
          position: t.position,
          color: t.columnColor,
        });
      }
    }

    return {
      columnsByProjectKey: byProjectKey,
      knownColumns: Array.from(colMap.values()),
    };
  }, [projects, projectQueries, rawTickets]);

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
    const sorted = [...knownColumns].sort(compareColumns);
    return sorted.map((col) => ({
      key: col.name,
      name: col.name,
      stateType: col.stateType,
      color: col.color || DEFAULT_COLOR,
      assign: null,
      values: [col.name],
    }));
  }, [knownColumns]);

  const allBoardIssues = useMemo(() => rawTickets.map(ticketToBoardIssue), [rawTickets]);

  const issuesByGroup = useMemo(() => {
    const map = new Map<string, BoardIssue[]>();
    for (const group of groups) map.set(group.key, []);
    for (const ticket of rawTickets) {
      const list = map.get(ticket.columnName);
      if (list) {
        list.push(ticketToBoardIssue(ticket));
      } else {
        map.set(ticket.columnName, [ticketToBoardIssue(ticket)]);
      }
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

  const [active, setActive] = useState<{ id: number; count: number } | null>(null);
  const sensors = useDndSensors(false);

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActive({ id: Number(e.active.id), count: draggedIds(e.active).length });
  }, []);

  const onDragCancel = useCallback(() => {
    setActive(null);
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActive(null);
    const data = e.over?.data.current as BoardDropData | undefined;
    data?.onDrop(draggedIds(e.active));
  }, []);

  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; projectKey: string; patch: IssuePatch }) =>
      api.updateIssue(id, patch),
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ['allTickets'] });
      if (vars?.projectKey) {
        void qc.invalidateQueries({ queryKey: qk.boardIssues(vars.projectKey) });
      }
      if (vars?.id) {
        void qc.invalidateQueries({ queryKey: qk.issue(vars.id) });
        void qc.invalidateQueries({ queryKey: qk.feed(vars.id) });
      }
    },
  });

  const moveIssue = useCallback(
    (issueIds: number[], group: IssueGroup, index: number) => {
      const targetIssues = issuesByGroup.get(group.key) ?? [];
      const idsToMove = issuesToMove(issueIds, allBoardIssues, targetIssues, true);
      if (idsToMove.length === 0) return;

      const positions = positionsAt(targetIssues, index, idsToMove.length);

      // Optimistically update TanStack Query cache for allTickets
      qc.setQueriesData({ queryKey: ['allTickets'] }, (old: AllTickets | undefined) => {
        if (!old) return old;
        const movedMap = new Map<number, { column: Column; position: number }>();
        idsToMove.forEach((id, n) => {
          const t = old.issues.find((item) => item.id === id);
          if (!t) return;
          const projectCols = columnsByProjectKey.get(t.projectKey) ?? [];
          const targetCol =
            projectCols.find((c) => c.name.toLowerCase() === group.name.toLowerCase()) ??
            projectCols.find((c) => c.stateType === group.stateType);
          if (targetCol) {
            movedMap.set(id, { column: targetCol, position: positions[n] });
          }
        });

        return {
          ...old,
          issues: old.issues.map((t) => {
            const moved = movedMap.get(t.id);
            if (!moved) return t;
            return {
              ...t,
              columnId: moved.column.id,
              columnName: moved.column.name,
              columnColor: moved.column.color,
              stateType: moved.column.stateType,
              position: moved.position,
            };
          }),
        };
      });

      // Dispatch mutations
      idsToMove.forEach((id, n) => {
        const ticket = rawTickets.find((t) => t.id === id);
        if (!ticket) return;
        const projectCols = columnsByProjectKey.get(ticket.projectKey) ?? [];
        const targetCol =
          projectCols.find((c) => c.name.toLowerCase() === group.name.toLowerCase()) ??
          projectCols.find((c) => c.stateType === group.stateType);
        if (!targetCol) return;
        updateMutation.mutate({
          id: ticket.id,
          projectKey: ticket.projectKey,
          patch: {
            columnId: targetCol.id,
            position: positions[n],
          },
        });
      });
    },
    [issuesByGroup, allBoardIssues, qc, columnsByProjectKey, rawTickets, updateMutation],
  );

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
          <DndContext
            sensors={sensors}
            collisionDetection={boardCollision}
            onDragStart={onDragStart}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
          >
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
                    manualOrder={true}
                    wip={null}
                    filtered={!!deferredQuery}
                    boardIssues={allBoardIssues}
                    onMoveIssue={moveIssue}
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
            <CardOverlay
              activeId={active?.id ?? null}
              count={active?.count ?? 0}
              issues={allBoardIssues}
              maps={maps}
              properties={KANBAN_PROPERTIES}
            />
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
