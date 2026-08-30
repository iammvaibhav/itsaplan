'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useProjectsQuery } from '@/services/projects.service';
import { projectPath } from '@/utils/paths';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from '@/components/layout/AppSidebar';
import AppHeader from '@/components/layout/AppHeader';
import CommandLayer from '@/components/layout/CommandLayer';
import NewProjectModal from '@/components/layout/NewProjectModal';
import NewIssueModal from '@/features/issue/components/create/NewIssueModal';
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

  useKeyboardShortcuts({
    hasProject: false,
    hasChat: false,
    projects: projects ?? [],
    overlayOpen: showCommand || creatingProject || creatingIssue,
    onToggleCommand: () => setShowCommand((v) => !v),
    onSelectProject: (key) => router.push(projectPath(key)),
    onChangeView: () => {},
    onNewIssue: () => setCreatingIssue(true),
    onNewProject: () => setCreatingProject(true),
    onSettings: () => {},
    onToggleChat: () => {},
  });
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        projects={projects ?? []}
        currentProjectKey={null}
        onSelectProject={(key) => router.push(projectPath(key))}
        onNewProject={() => setCreatingProject(true)}
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
        onNewProject={() => setCreatingProject(true)}
        onSelectProject={(key) => router.push(projectPath(key))}
        onOpenIssue={() => {}}
        onIssueDeleted={() => {}}
        onToggleChat={() => {}}
      />

      {creatingProject && (
        <NewProjectModal
          onClose={() => setCreatingProject(false)}
          onCreated={(key) => {
            setCreatingProject(false);
            router.push(projectPath(key));
          }}
        />
      )}

      {creatingIssue && (
        <NewIssueModal
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
