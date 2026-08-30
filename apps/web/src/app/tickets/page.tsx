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
import AllTicketsBoard from '@/features/work-items/components/all-tickets/AllTicketsBoard';

// The global All tickets board. A top-level route on purpose: it must be
// reachable without picking a project first, so it renders the app chrome (the
// sidebar, with its project switcher) directly instead of living under the
// project Shell at /project/[projectKey]. The header's project-bound buttons
// (new issue, chat) are inert here — hasProject is false.
export default function TicketsPage() {
  const t = useTranslations('nav');
  const router = useRouter();
  const { data: projects } = useProjectsQuery();
  const [creating, setCreating] = useState(false);
  const [showCommand, setShowCommand] = useState(false);

  useKeyboardShortcuts({
    hasProject: false,
    hasChat: false,
    projects: projects ?? [],
    overlayOpen: showCommand || creating,
    onToggleCommand: () => setShowCommand((v) => !v),
    onSelectProject: (key) => router.push(projectPath(key)),
    onChangeView: () => {},
    onNewIssue: () => {},
    onNewProject: () => setCreating(true),
    onSettings: () => {},
    onToggleChat: () => {},
  });
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        projects={projects ?? []}
        currentProjectKey={null}
        onSelectProject={(key) => router.push(projectPath(key))}
        onNewProject={() => setCreating(true)}
      />
      <SidebarInset className="min-w-0">
        <AppHeader
          title={t('allTickets')}
          hasProject={false}
          onOpenCommand={() => setShowCommand(true)}
          onNewIssue={() => {}}
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
        onNewIssue={() => {}}
        onSelectAll={() => {}}
        onNewProject={() => setCreating(true)}
        onSelectProject={(key) => router.push(projectPath(key))}
        onOpenIssue={() => {}}
        onIssueDeleted={() => {}}
        onToggleChat={() => {}}
      />

      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreated={(key) => {
            setCreating(false);
            router.push(projectPath(key));
          }}
        />
      )}
    </SidebarProvider>
  );
}
