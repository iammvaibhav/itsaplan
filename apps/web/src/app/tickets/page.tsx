'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useProjectsQuery } from '@/services/projects.service';
import { useTeamsQuery } from '@/services/teams.service';
import { projectPath } from '@/utils/paths';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from '@/components/layout/AppSidebar';
import AppHeader from '@/components/layout/AppHeader';
import CommandLayer from '@/components/layout/CommandLayer';
import NewProjectModal from '@/components/layout/NewProjectModal';
import NewIssueAnyProjectModal from '@/features/issue/components/create/NewIssueAnyProjectModal';
import AllTicketsBoard from '@/features/work-items/components/all-tickets/AllTicketsBoard';

// The global All tickets board. A top-level route on purpose: it must be
// reachable without picking a project first, so it renders the app chrome (the
// sidebar, with its project switcher) directly instead of living under the
// project Shell at /project/[projectKey].
export default function TicketsPage() {
  const t = useTranslations('nav');
  const router = useRouter();
  const { data: projects } = useProjectsQuery();
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  // As in the project Shell with no project open: a project is created in the first
  // team the user owns or manages; with none, New project is not offered.
  const newProjectTeamId = (useTeamsQuery().data ?? []).find((one) => one.role !== 'member')?.id;
  const openNewProject = newProjectTeamId != null ? () => setCreatingProject(true) : null;

  useKeyboardShortcuts({
    hasProject: false,
    hasChat: false,
    overlayOpen: showCommand || creatingProject || creatingIssue,
    onToggleCommand: () => setShowCommand((v) => !v),
    onChangeView: () => {},
    onNewIssue: () => setCreatingIssue(true),
    onNewInitiative: () => {},
    onNewProject: () => openNewProject?.(),
    onSettings: () => {},
    onToggleChat: () => {},
  });
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        projects={projects ?? []}
        currentProjectKey={null}
        onSelectProject={(key) => router.push(projectPath(key))}
      />
      <SidebarInset className="min-w-0">
        <AppHeader
          title={t('allTickets')}
          hasProject={false}
          onOpenCommand={() => setShowCommand(true)}
          onNewIssue={() => setCreatingIssue(true)}
          chatActive={false}
          onToggleChat={() => {}}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <AllTicketsBoard />
        </div>
      </SidebarInset>

      <CommandLayer
        open={showCommand}
        onOpenChange={setShowCommand}
        projects={projects ?? []}
        currentProjectKey={null}
        onBoard={false}
        view="kanban"
        currentIssueId={null}
        onViewChange={() => {}}
        onNewIssue={() => setCreatingIssue(true)}
        onSelectAll={() => {}}
        onNewInitiative={() => {}}
        onNewProject={openNewProject}
        onSelectProject={(key) => router.push(projectPath(key))}
        onOpenIssue={() => {}}
        onIssueDeleted={() => {}}
        onToggleChat={() => {}}
      />

      {creatingProject && newProjectTeamId != null && (
        <NewProjectModal
          teamId={newProjectTeamId}
          onClose={() => setCreatingProject(false)}
          onCreated={(key) => {
            setCreatingProject(false);
            router.push(projectPath(key));
          }}
        />
      )}

      {creatingIssue && (
        <NewIssueAnyProjectModal
          projects={projects ?? []}
          defaults={{}}
          onClose={() => setCreatingIssue(false)}
          onCreated={() => {
            setCreatingIssue(false);
          }}
        />
      )}
    </SidebarProvider>
  );
}
