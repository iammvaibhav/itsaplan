import { useEffect, useMemo, useRef, useState } from 'react';
import { type Editor } from '@tiptap/react';
import { Loader2, MoreHorizontal } from 'lucide-react';
import {
  type CycleRef,
  type Issue,
  type IssueFieldValueInput,
  type ProjectDetail,
  type Project,
} from '@/lib/api';
import { type NewIssueDefaults } from '@/utils/project';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { useCreateIssue, useSetFieldValue, useUpdateIssue } from '@/services/issues.service';
import { useProjectQuery, useProjectsQuery } from '@/services/projects.service';
import { useCycleOptionsQuery } from '@/services/cycles.service';
import { fieldDefsForType } from '../../utils/fieldDefs';
import { useFileDragZone } from '../../hooks/useFileDragZone';
import { useFilePaste } from '../../hooks/useFilePaste';
import { useNewIssueAttachments } from '../../hooks/useNewIssueAttachments';
import {
  attachmentHtml,
  removeEmbed,
  replaceEmbed,
  stripEmbed,
  type Embeddable,
} from '../../utils/attachmentEmbed';
import { DESCRIPTION_SECTION, OTHER_SECTION, fieldSectionId } from '../../utils/bodySections';
import { hasFieldValue } from '../../utils/fieldValues';
import EstimatePill from '../fields/EstimatePill';
import IssueCustomFieldPill from '../fields/IssueCustomFieldPill';
import ProjectSelect from '../fields/ProjectSelect';
import NewIssueAttachButton from './NewIssueAttachButton';
import NewIssueAttachmentStrip from './NewIssueAttachmentStrip';
import NewIssueDropOverlay from './NewIssueDropOverlay';
import Modal from '@/components/common/overlay/Modal';
import NewIssueBody from './NewIssueBody';
import AssigneeSelect from '@/components/common/fields/AssigneeSelect';
import DatePill from '@/components/common/fields/DatePill';
import DelegateSelect from '../fields/DelegateSelect';
import LabelsSelect from '@/components/common/fields/LabelsSelect';
import PrioritySelect from '@/components/common/fields/PrioritySelect';
import StatusSelect from '@/components/common/fields/StatusSelect';
import TypeSelect from '@/components/common/fields/TypeSelect';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pill } from '@/components/common/fields/Pill';
import InitiativeSelect from '../fields/InitiativeSelect';
import CycleSelect from '../fields/CycleSelect';
import { useTranslations } from 'next-intl';

const STORE_KEY = 'planner_last_project_key';

function getStoredProjectKey(projects: Project[] | undefined, defaultKey?: string): string {
  if (defaultKey) return defaultKey;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORE_KEY);
      if (stored && projects?.some((p) => p.key === stored)) {
        return stored;
      }
    } catch {
      // Storage unavailable (private mode / quota)
    }
  }
  return projects?.[0]?.key ?? '';
}

interface NewIssueFormProps {
  project: ProjectDetail;
  projects?: Project[];
  selectedProjectKey: string;
  onSelectProject: (key: string) => void;
  defaults: NewIssueDefaults;
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  fullscreen: boolean;
  onClose: () => void;
  onCreated: (created: Issue) => void;
}

function NewIssueForm({
  project,
  projects,
  selectedProjectKey,
  onSelectProject,
  defaults,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  fullscreen,
  onCreated,
}: NewIssueFormProps) {
  const t = useTranslations('issue.create');
  const tFields = useTranslations('issue.fields');
  const [columnId, setColumnId] = useState(defaults.columnId ?? project.columns[0]?.id ?? 0);
  const [typeId, setTypeId] = useState<number | null>(
    defaults.typeId === undefined
      ? (project.issueTypes.find((t) => t.isDefault)?.id ?? project.issueTypes[0]?.id ?? null)
      : defaults.typeId,
  );
  const [initiativeId, setInitiativeId] = useState<number | null>(defaults.initiativeId ?? null);
  // A default cycle that is not among the planned ones has finished, and nothing new
  // is planned into it — the issue is created without a cycle instead.
  const [cycle, setCycle] = useState<CycleRef | null>(
    () => project.plannedCycles.find((c) => c.id === defaults.cycleId) ?? null,
  );
  const { data: session } = useSession();
  // Assignee defaults to the creating user unless the caller set one explicitly
  // (defaults.assigneeUserId is null for the "No assignee" board group).
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(() => {
    if (defaults.assigneeUserId !== undefined) return defaults.assigneeUserId;
    const userId = session?.user.id;
    return userId != null &&
      project.assignees.some((a) => a.kind === 'member' && a.userId === userId)
      ? userId
      : null;
  });
  const [delegateUserId, setDelegateUserId] = useState<string | null>(
    defaults.delegateUserId ?? null,
  );
  const [priority, setPriority] = useState(defaults.priority ?? '');
  const [estimatePoints, setEstimatePoints] = useState<number | null>(null);
  const [estimateMinutes, setEstimateMinutes] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labelIds, setLabelIds] = useState<number[]>(defaults.labelIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Custom fields for the selected type (project-wide + type-scoped), off the
  // scaffold every member already loads. Fields flagged "show in main info" get their
  // own body section; the rest are added on demand from the "…" menu.
  const fieldDefs = useMemo(
    () => fieldDefsForType(project.customFields, typeId),
    [project.customFields, typeId],
  );
  // A member field the dialog was opened with (the board grouped by it) starts
  // filled in, and shows as a property row so it is visible before saving.
  const [activeFieldIds, setActiveFieldIds] = useState<number[]>(() =>
    (defaults.fieldValues ?? []).map((f) => f.fieldId),
  );
  const [fieldValues, setFieldValues] = useState<Record<number, IssueFieldValueInput>>(() =>
    Object.fromEntries((defaults.fieldValues ?? []).map((f) => [f.fieldId, { value: f.userId }])),
  );
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue(project.project.key);
  const setFieldValueMutation = useSetFieldValue(project.project.key);
  const attachments = useNewIssueAttachments();

  // The description editor instance, so a file dropped or pasted anywhere on the
  // modal (not just onto the editor box) can be inserted at the cursor.
  const [descEditor, setDescEditor] = useState<Editor | null>(null);

  // The markdown editors of the body custom fields, so an attachment removed
  // from the strip takes its embeds with it wherever they were inserted.
  const fieldEditors = useRef(new Map<number, Editor>());

  // Which of the body sections is open, so an attachment lands in the editor the
  // user is looking at.
  const [bodySection, setBodySection] = useState(DESCRIPTION_SECTION);

  function activeBodyEditor(): Editor | null {
    if (bodySection === DESCRIPTION_SECTION) return descEditor;
    const fieldId = fieldSectionId(bodySection);
    return fieldId === null ? null : (fieldEditors.current.get(fieldId) ?? null);
  }

  function insertIntoBody(a: Embeddable) {
    activeBodyEditor()?.chain().focus().insertContent(attachmentHtml(a)).run();
  }

  function removeAttachment(id: number) {
    const item = attachments.remove(id);
    if (!item) return;
    if (descEditor) removeEmbed(descEditor, item.url);
    for (const editor of fieldEditors.current.values()) removeEmbed(editor, item.url);
  }

  // The annotated image replaces the file it was drawn on, so wherever that file
  // was already inserted now shows the annotated one.
  function annotateAttachment(id: number, file: File) {
    const urls = attachments.replace(id, file);
    if (!urls) return;
    if (descEditor) replaceEmbed(descEditor, urls.from, urls.to);
    for (const editor of fieldEditors.current.values()) replaceEmbed(editor, urls.from, urls.to);
  }

  function insertFilesIntoBody(files: FileList) {
    const editor = activeBodyEditor();
    // No editor on screen: still attach the files, they can be inserted later.
    if (!editor) {
      attachments.attach(files);
      return;
    }
    let pos = editor.state.selection.to;
    void (async () => {
      for (const file of Array.from(files)) {
        const a = await attachments.uploadFile(file).catch(() => null);
        if (!a) continue;
        editor.chain().insertContentAt(pos, attachmentHtml(a)).focus().run();
        pos = editor.state.selection.to;
      }
    })();
  }

  const { draggedFiles, dragHandlers } = useFileDragZone(insertFilesIntoBody);

  useFilePaste(insertFilesIntoBody);

  const [addFieldOpen, setAddFieldOpen] = useState(false);

  // Drop shown fields that no longer apply to the selected type. Nothing is shown
  // by default — the user adds fields from the "…" menu.
  useEffect(() => {
    const valid = new Set(fieldDefs.filter((d) => !d.showInBody).map((d) => d.id));
    setActiveFieldIds((prev) => prev.filter((id) => valid.has(id)));
  }, [fieldDefs]);

  const errorMessage = error ?? attachments.error;
  const bodyDefs = fieldDefs.filter((d) => d.showInBody);
  const propertyDefs = fieldDefs.filter((d) => !d.showInBody);
  const activeDefs = propertyDefs.filter((d) => activeFieldIds.includes(d.id));
  const availableDefs = propertyDefs.filter((d) => !activeFieldIds.includes(d.id));

  function toggleLabel(id: number) {
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function setFieldValue(id: number, patch: IssueFieldValueInput) {
    setFieldValues((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const created = await createIssue.mutateAsync({
        projectKey: project.project.key,
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          columnId,
          parentId: defaults.parentId ?? null,
          typeId,
          initiativeId,
          cycleId: cycle?.id ?? null,
          assigneeUserId,
          delegateUserId,
          priority: priority || null,
          estimatePoints,
          estimateMinutes,
          startDate: startDate || null,
          dueDate: dueDate || null,
          labelIds,
        },
      });
      // Upload the pending files, then point every embed at its stored URL
      // instead of the local blob: one.
      const storedUrls = await attachments.uploadAll(created.id);
      const rewrite = (markdown: string) => {
        let out = markdown;
        for (const [blobUrl, url] of storedUrls) {
          out = url ? out.replaceAll(blobUrl, url) : stripEmbed(out, blobUrl);
        }
        return out;
      };

      const body = rewrite(description);
      if (body !== description) {
        await updateIssue.mutateAsync({ id: created.id, patch: { description: body.trim() } });
      }

      // Set custom field values on the freshly created issue. Body fields are
      // always applicable; property fields only if the user added them.
      for (const def of fieldDefs) {
        if (!def.showInBody && !activeFieldIds.includes(def.id)) continue;
        const v = fieldValues[def.id];
        if (!hasFieldValue(v)) continue;
        const value = typeof v.value === 'string' ? { ...v, value: rewrite(v.value) } : v;
        await setFieldValueMutation.mutateAsync({ issueId: created.id, fieldId: def.id, value });
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORE_KEY, project.project.key);
        } catch {
          // ignore
        }
      }

      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // Enter creates the issue when the caret is in the title, or when no element has
  // focus: Radix then keeps focus on the dialog element itself. The handler ignores
  // focus inside the body editors or a nested dialog.
  const titleRef = useRef<HTMLInputElement>(null);
  // No dependency array: the handler reads the title and the saving flag of the
  // current render, so React registers it again after every render.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing)
        return;
      const active = document.activeElement;
      const isTitleFocused = active === titleRef.current;
      const isDialogFocused =
        active instanceof HTMLElement &&
        active.getAttribute('role') === 'dialog' &&
        active.contains(titleRef.current);
      if (!isTitleFocused && !isDialogFocused) return;
      e.preventDefault();
      if (saving || !title.trim()) return;
      void submit();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      className={cn('flex min-h-0 flex-col', fullscreen && 'flex-1 overflow-hidden')}
      {...dragHandlers}
    >
      {draggedFiles !== null && <NewIssueDropOverlay count={draggedFiles} />}
      <input
        ref={titleRef}
        // `auto` once there is something to read, so a title keeps the script it
        // was typed in. While the field is empty there is nothing to read from,
        // and it would fall back to left-to-right and strand the placeholder.
        dir={title ? 'auto' : undefined}
        className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
        placeholder={t('titlePlaceholder')}
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        autoFocus
      />
      <div className={cn('flex min-h-0 flex-col overflow-hidden', fullscreen && 'flex-1')}>
        <NewIssueBody
          section={bodySection}
          onSectionChange={setBodySection}
          fullscreen={fullscreen}
          description={description}
          onDescriptionChange={onDescriptionChange}
          onDescriptionReady={setDescEditor}
          bodyDefs={bodyDefs}
          fieldValues={fieldValues}
          assignees={project.assignees}
          onFieldValue={setFieldValue}
          onFieldEditorReady={(id, editor) => {
            if (editor) fieldEditors.current.set(id, editor);
            else fieldEditors.current.delete(id);
          }}
          uploadFile={attachments.uploadFile}
        />
      </div>

      <div className={`${bodyDefs.length > 0 ? 'mt-8' : 'mt-4'} flex flex-wrap items-center gap-2`}>
        {projects && projects.length > 1 && (
          <ProjectSelect
            projects={projects}
            value={selectedProjectKey}
            onChange={onSelectProject}
          />
        )}

        <StatusSelect columns={project.columns} value={columnId} onChange={setColumnId} />

        {project.assignees.length > 0 && (
          <AssigneeSelect
            assignees={project.assignees}
            value={assigneeUserId}
            onChange={setAssigneeUserId}
            placeholder={tFields('assignee')}
          />
        )}

        {project.assignees.some((a) => a.kind === 'agent') && (
          <DelegateSelect
            assignees={project.assignees}
            value={delegateUserId}
            onChange={setDelegateUserId}
            placeholder={tFields('delegate')}
          />
        )}

        <PrioritySelect value={priority} onChange={setPriority} />

        {project.issueTypes.length > 0 && (
          <TypeSelect issueTypes={project.issueTypes} value={typeId} onChange={setTypeId} />
        )}

        {project.project.initiativesEnabled && (
          <InitiativeSelect
            projectKey={project.project.key}
            value={initiativeId}
            onChange={setInitiativeId}
          />
        )}

        {project.project.cyclesEnabled && (
          <CycleSelect projectKey={project.project.key} value={cycle} onChange={setCycle} />
        )}

        {project.labels.length > 0 && (
          <LabelsSelect
            labels={project.labels}
            groups={project.labelGroups}
            value={labelIds}
            onToggle={toggleLabel}
          />
        )}

        {project.project.pointsEstimateEnabled && (
          <EstimatePill kind="points" value={estimatePoints} onChange={setEstimatePoints} />
        )}

        {project.project.timeEstimateEnabled && (
          <EstimatePill kind="time" value={estimateMinutes} onChange={setEstimateMinutes} />
        )}

        <DatePill
          value={startDate || null}
          placeholder={tFields('startDate')}
          onChange={(v) => setStartDate(v ?? '')}
        />

        <DatePill
          value={dueDate || null}
          placeholder={tFields('dueDate')}
          onChange={(v) => setDueDate(v ?? '')}
        />

        {activeDefs.map((def) => (
          <IssueCustomFieldPill
            key={def.id}
            def={def}
            value={fieldValues[def.id]}
            assignees={project.assignees}
            defaultOpen={def.id === justAddedId}
            onChange={(v) => setFieldValue(def.id, v)}
          />
        ))}

        {availableDefs.length > 0 && (
          <Popover open={addFieldOpen} onOpenChange={setAddFieldOpen}>
            <PopoverTrigger asChild>
              <Pill>
                <MoreHorizontal />
              </Pill>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandInput placeholder={t('addFieldPlaceholder')} />
                <CommandList>
                  <CommandEmpty>{t('noFields')}</CommandEmpty>
                  <CommandGroup>
                    {availableDefs.map((def) => (
                      <CommandItem
                        key={def.id}
                        value={def.name}
                        onSelect={() => {
                          setActiveFieldIds((ids) => [...ids, def.id]);
                          setJustAddedId(def.id);
                          setAddFieldOpen(false);
                        }}
                      >
                        <span className="flex-1">{def.name}</span>
                        <span className="text-xs text-muted-foreground">{def.fieldType}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {errorMessage && <p className="mt-3 text-xs text-destructive">{errorMessage}</p>}

      <div className="mt-4 flex items-center gap-2 border-t pt-3">
        <NewIssueAttachButton onPick={attachments.attach} />
        <NewIssueAttachmentStrip
          items={attachments.pending}
          onInsert={bodySection === OTHER_SECTION ? undefined : insertIntoBody}
          onAnnotate={annotateAttachment}
          onRemove={removeAttachment}
        />
        <Button className="ml-auto" disabled={saving || !title.trim()} onClick={submit}>
          {t('submit')}
        </Button>
      </div>
    </div>
  );
}

export default function NewIssueModal({
  project: initialProject,
  projects: initialProjects,
  defaults = {},
  crumb,
  onClose,
  onCreated,
}: {
  project?: ProjectDetail;
  projects?: Project[];
  defaults?: NewIssueDefaults;
  // What the issue is being created for, named in the header after the title
  // ("Subtask of ISS-12", "Blocked by ISS-12").
  crumb?: string;
  onClose: () => void;
  onCreated: (created: Issue) => void;
}) {
  const t = useTranslations('issue.create');
  const tCommon = useTranslations('common');
  const projectsQuery = useProjectsQuery();
  const projects = initialProjects ?? projectsQuery.data ?? [];
  const [selectedProjectKey, setSelectedProjectKey] = useState(() =>
    getStoredProjectKey(projects, initialProject?.project.key),
  );

  useEffect(() => {
    if (!selectedProjectKey && projects.length > 0) {
      setSelectedProjectKey(getStoredProjectKey(projects, initialProject?.project.key));
    }
  }, [selectedProjectKey, projects, initialProject]);

  const handleSelectProject = (key: string) => {
    setSelectedProjectKey(key);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORE_KEY, key);
      } catch {
        // ignore
      }
    }
  };

  const projectKeyToFetch =
    initialProject && initialProject.project.key === selectedProjectKey
      ? null
      : selectedProjectKey || null;

  const projectQuery = useProjectQuery(projectKeyToFetch);
  const scaffold = projectQuery.data ?? null;
  const cyclesQuery = useCycleOptionsQuery(
    scaffold?.project.cyclesEnabled ? selectedProjectKey : null,
  );

  const activeProject: ProjectDetail | null = useMemo(() => {
    if (initialProject && initialProject.project.key === selectedProjectKey) {
      return initialProject;
    }
    if (!scaffold) return null;
    return {
      ...scaffold,
      issues: [],
      changeSeq: 0,
      plannedCycles: cyclesQuery.data ?? [],
    };
  }, [initialProject, selectedProjectKey, scaffold, cyclesQuery.data]);

  const [title, setTitle] = useState(defaults.title ?? '');
  const [description, setDescription] = useState(defaults.description ?? '');
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <Modal
      title={t('title')}
      crumb={crumb}
      projectKey={activeProject?.project.key ?? selectedProjectKey}
      onClose={onClose}
      wide
      fullscreen={fullscreen}
      onToggleFullscreen={() => setFullscreen((v) => !v)}
      // Halves the dialog's bottom padding: the footer then sits as far from the
      // separator above it as from the dialog edge below.
      className="pb-3"
    >
      {activeProject ? (
        <NewIssueForm
          key={activeProject.project.key}
          project={activeProject}
          projects={projects.length > 1 ? projects : undefined}
          selectedProjectKey={selectedProjectKey}
          onSelectProject={handleSelectProject}
          defaults={defaults}
          title={title}
          onTitleChange={setTitle}
          description={description}
          onDescriptionChange={setDescription}
          fullscreen={fullscreen}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="me-2 size-4 animate-spin" />
          {tCommon('loading')}
        </div>
      )}
    </Modal>
  );
}
