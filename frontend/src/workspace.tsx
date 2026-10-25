import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth";

export type Member = { member_id: string; user_id?: string | null; name: string; role: string; email?: string };
export type Workspace = {
  id: string;
  name: string;
  type: "personal" | "shared";
  owner_id: string;
  base_currency: string;
  members: Member[];
};

const CUR_KEY = "finplanner_current_ws";

type WsState = {
  workspaces: Workspace[];
  current: Workspace | null;
  currentId: string | null;
  setCurrentId: (id: string) => void;
  loading: boolean;
  refetch: () => void;
};

const WorkspaceContext = createContext<WsState>({} as WsState);
export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentId, setCurrentIdState] = useState<string | null>(null);

  const { data: workspaces = [], isLoading, refetch } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: () => api<Workspace[]>("/workspaces"),
    enabled: !!user,
  });

  useEffect(() => {
    (async () => {
      if (!workspaces.length) return;
      const saved = await storage.getItem<string>(CUR_KEY, "");
      const exists = saved && workspaces.find((w) => w.id === saved);
      if (!currentId || !workspaces.find((w) => w.id === currentId)) {
        setCurrentIdState(exists ? saved! : workspaces[0].id);
      }
    })();
  }, [workspaces, currentId]);

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id);
    storage.setItem(CUR_KEY, id);
  }, []);

  const current = workspaces.find((w) => w.id === currentId) || null;

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, current, currentId, setCurrentId, loading: isLoading, refetch }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
