'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/services/queryKeys';

declare global {
  interface Window {
    __paseo_itsaplan?: {
      navigateProject: (projectKey: string) => void;
      prefetchProject: (projectKey: string) => void;
    };
  }
}

/**
 * Bridge for Paseo embedding (Electron webview and web iframe).
 *
 * Exposes client-side navigation and React Query prefetching so that clicking
 * a project button in Paseo's sidebar switches the board instantaneously without
 * triggering a full webview reload or waiting for uncached queries.
 */
export default function PaseoEmbedBridge() {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    const navigateProject = (projectKey: string) => {
      const trimmed = projectKey?.trim();
      const path = trimmed ? `/project/${encodeURIComponent(trimmed)}` : '/';
      router.push(path);
    };

    const prefetchProject = (projectKey: string) => {
      const trimmed = projectKey?.trim();
      if (!trimmed) return;
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

    window.__paseo_itsaplan = {
      navigateProject,
      prefetchProject,
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'paseo:navigate-project' && typeof data.projectKey === 'string') {
        navigateProject(data.projectKey);
      } else if (data.type === 'paseo:prefetch-project' && typeof data.projectKey === 'string') {
        prefetchProject(data.projectKey);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      delete window.__paseo_itsaplan;
      window.removeEventListener('message', handleMessage);
    };
  }, [router, qc]);

  return null;
}
