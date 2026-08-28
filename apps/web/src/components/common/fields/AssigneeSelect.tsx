import { CircleDashed } from 'lucide-react';
import type { Assignee } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import Avatar from '@/components/common/Avatar';
import { Pill } from './Pill';
import PopoverPick from './PopoverPick';
import { useTranslations } from 'next-intl';
import { useCandidatePickItem } from '@/features/issue/hooks/useCandidatePickItem';

// The assignee of an issue is a project member or an AI agent. `assignees` is the project's full
// candidate list (members and agents). The signed-in member is pulled out into a
// "You" group at the top; everyone else falls under "Members" or "Agents".
export default function AssigneeSelect({
  assignees,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  assignees: Assignee[];
  value: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const t = useTranslations('issue.fieldSelects');
  const none = t('noAssignee');
  const { data: session } = useSession();
  const currentUserId = session?.user.id ?? null;
  const assignee = assignees.find((a) => a.userId === value);
  const members = assignees.filter((a) => a.kind === 'member');
  const agents = assignees.filter((a) => a.kind === 'agent');
  const toItem = useCandidatePickItem(assignees, value, (userId) => onChange(userId));

  const me = members.find((a) => a.userId === currentUserId);
  const others = members.filter((a) => a.userId !== currentUserId);
  return (
    <PopoverPick
      readOnly={readOnly}
      trigger={
        <Pill active={!!assignee}>
          {assignee ? (
            <Avatar name={assignee.name} image={assignee.image} className="size-4 text-[8px]" />
          ) : (
            <CircleDashed />
          )}
          <span className="truncate">{assignee?.name ?? placeholder ?? none}</span>
        </Pill>
      }
      inputPlaceholder={t('assignTo')}
      emptyText={t('noCandidates')}
      items={[
        {
          key: 'none',
          search: none,
          icon: <CircleDashed />,
          label: none,
          selected: value == null,
          onSelect: () => onChange(null),
        },
      ]}
      groups={[
        ...(me ? [{ heading: t('you'), items: [toItem(me)] }] : []),
        ...(others.length > 0 ? [{ heading: t('members'), items: others.map(toItem) }] : []),
        ...(agents.length > 0 ? [{ heading: t('agents'), items: agents.map(toItem) }] : []),
      ]}
    />
  );
}
