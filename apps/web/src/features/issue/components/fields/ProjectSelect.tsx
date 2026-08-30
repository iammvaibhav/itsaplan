import { SquareKanban } from 'lucide-react';
import type { Project } from '@/lib/api';
import { Pill } from '@/components/common/fields/Pill';
import PopoverPick from '@/components/common/fields/PopoverPick';
import { useTranslations } from 'next-intl';

export default function ProjectSelect({
  projects,
  value,
  onChange,
  readOnly,
}: {
  projects: Project[];
  value: string;
  onChange: (key: string) => void;
  readOnly?: boolean;
}) {
  const tNav = useTranslations('nav');
  const project = projects.find((p) => p.key === value);

  return (
    <PopoverPick
      readOnly={readOnly}
      trigger={
        <Pill
          active={!!project}
          aria-label={project ? `${tNav('project')}: ${project.name}` : tNav('project')}
        >
          <SquareKanban className="size-3.5" />
          <span className="truncate">{project?.name ?? value ?? tNav('project')}</span>
        </Pill>
      }
      inputPlaceholder={tNav('search')}
      emptyText={tNav('noProjects')}
      items={projects.map((p) => ({
        key: p.key,
        search: `${p.name} ${p.key}`,
        icon: <SquareKanban className="size-4" />,
        label: p.name,
        trailing: (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {p.key}
          </span>
        ),
        selected: p.key === value,
        onSelect: () => onChange(p.key),
      }))}
    />
  );
}
