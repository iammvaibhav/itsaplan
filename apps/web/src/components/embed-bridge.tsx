'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Project } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { qk } from '@/services/queryKeys';
import { projectPath } from '@/utils/paths';

declare global {
  interface Window {
    __paseo_itsaplan?: {
      navigateProject: (projectKey: string) => void;
      prefetchProject: (projectKey: string) => void;
      prefetchAllProjects: () => void;
    };
  }
}

/**
 * Bridge for Paseo embedding (Electron webview and web iframe).
 *
 * Exposes client-side navigation and React Query prefetching so that clicking
 * a project button in Paseo's sidebar switches the board instantaneously without
 * triggering a full webview reload or waiting for uncached queries.
 *
 * Once a session exists, every project the account can see is warmed into the
 * query cache and the Next route cache. Switching then reads memory, not the
 * network.
 */
export default function PaseoEmbedBridge() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user.id);

  useEffect(() => {
    // Prefetch only with a session. Signed out, the reads answer 401, and lib/api
    // treats a 401 as an ended session: it signs out and reloads to /login. Paseo
    // calls these on every guest load, so that became a reload loop on /login.
    const prefetchProject = (projectKey: string) => {
      const trimmed = projectKey?.trim();
      if (!signedIn || !trimmed) return;
      const path = `/project/${encodeURIComponent(trimmed)}`;
      router.prefetch(path);
      void qc.prefetchQuery({
        queryKey: qk.project(trimmed),
        queryFn: () => api.getProject(trimmed),
      });
      void qc.prefetchQuery({
        queryKey: qk.boardIssues(trimmed),
        queryFn: () => api.getBoardIssues(trimmed),
      });
      void qc.prefetchQuery({
        queryKey: qk.views(trimmed),
        queryFn: () => api.listViews(trimmed),
      });
    };

    let warming = false;
    const prefetchAllProjects = () => {
      if (!signedIn || warming) return;
      warming = true;
      void qc
        .fetchQuery({
          queryKey: qk.projects,
          queryFn: () => api.listProjects({ permissions: true }),
        })
        .then((projects: Project[]) => {
          for (const project of projects) {
            prefetchProject(project.key);
          }
        })
        .finally(() => {
          warming = false;
        });
    };

    const navigateProject = (projectKey: string) => {
      const trimmed = projectKey?.trim();
      router.push(trimmed ? projectPath(trimmed) : '/');
    };

    window.__paseo_itsaplan = {
      navigateProject,
      prefetchProject,
      prefetchAllProjects,
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'paseo:navigate-project' && typeof data.projectKey === 'string') {
        navigateProject(data.projectKey);
      } else if (data.type === 'paseo:prefetch-project' && typeof data.projectKey === 'string') {
        prefetchProject(data.projectKey);
      } else if (data.type === 'paseo:prefetch-all-projects') {
        prefetchAllProjects();
      }
    };

    window.addEventListener('message', handleMessage);
    if (!isPending && signedIn) {
      prefetchAllProjects();
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [router, qc, isPending, signedIn]);

  return null;
}
