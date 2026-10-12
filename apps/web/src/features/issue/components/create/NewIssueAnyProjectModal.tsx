import { useCallback, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Issue } from '@/lib/api/endpoints/issues';
import type { Project, ProjectDetail } from '@/lib/api/endpoints/projects';
import Modal from '@/components/common/overlay/Modal';
import { useProjectQuery } from '@/services/projects.service';
import { useCycleOptionsQuery } from '@/services/cycles.service';
import ProjectSelect from '../fields/ProjectSelect';
import type { NewIssueDefaults } from '@/utils/project';
import NewIssueModal from './NewIssueModal';

// Fork: "New issue" from the All tickets board, where no project is selected. The
// dialog opens on the project used last (else the first one) and a project pill
// switches it; the issue form itself is the regular NewIssueModal.
const STORE_KEY = 'planner_last_project_key';

function initialProjectRef(projects: Project[]): string {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored && projects.some((p) => p.ref === stored)) return stored;
  } catch {
    // Storage unavailable (private mode, quota): fall back to the first project.
  }
  return projects[0]?.ref ?? '';
}

export default function NewIssueAnyProjectModal({
  projects,
  defaults = {},
  onClose,
  onCreated,
}: {
  projects: Project[];
  defaults?: NewIssueDefaults;
  onClose: () => void;
  onCreated: (created: Issue) => void;
}) {
  const t = useTranslations('issue.create');
  const tCommon = useTranslations('common');
  const [projectRef, setProjectRef] = useState(() => initialProjectRef(projects));
  const [draft, setDraft] = useState({
    title: defaults.title ?? '',
    description: defaults.description ?? '',
  });

  const scaffold = useProjectQuery(projectRef || null).data ?? null;
  const cycles = useCycleOptionsQuery(scaffold?.project.cyclesEnabled ? projectRef : null);
  const project: ProjectDetail | null = useMemo(
    () => (scaffold ? { ...scaffold, issues: [], plannedCycles: cycles.data ?? [] } : null),
    [scaffold, cycles.data],
  );

  const selectProject = (ref: string) => {
    setProjectRef(ref);
    try {
      localStorage.setItem(STORE_KEY, ref);
    } catch {
      // Not remembered; the dialog still switches.
    }
  };
  const keepDraft = useCallback((next: { title: string; description: string }) => {
    setDraft(next);
  }, []);

  if (!project || project.project.ref !== projectRef) {
    return (
      <Modal title={t('title')} onClose={onClose} wide>
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="me-2 size-4 animate-spin" />
          {tCommon('loading')}
        </div>
      </Modal>
    );
  }

  return (
    <NewIssueModal
      // A different project has different columns, types and fields, so the form
      // starts over; the typed title and description carry across.
      key={projectRef}
      project={project}
      defaults={{ ...defaults, ...draft }}
      projectPicker={
        projects.length > 1 ? (
          <ProjectSelect projects={projects} value={projectRef} onChange={selectProject} />
        ) : undefined
      }
      onDraftChange={keepDraft}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
