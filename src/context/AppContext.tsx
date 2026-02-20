import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";

interface GitHubConfig {
  token: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  config: GitHubConfig;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface AppContextType {
  config: GitHubConfig | null;
  setConfig: (config: GitHubConfig | null) => void;
  messages: Message[];
  setMessages: (msgs: Message[]) => void;
  addMessage: (role: "user" | "assistant", content: string) => void;
  updateLastAssistantMessage: (content: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  previewUrl: string;
  setPreviewUrl: (url: string) => void;
  files: any[];
  setFiles: (files: any[]) => void;
  selectedFile: { path: string; content: string } | null;
  setSelectedFile: (file: { path: string; content: string } | null) => void;
  // Session management
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  sessions: ChatSession[];
  saveCurrentSession: () => void;
  loadSession: (id: string) => void;
  deleteSession: (id: string) => void;
  startNewChat: () => void;
  savedConfigs: GitHubConfig[];
}

const SESSIONS_KEY = "codeai_sessions";
const CONFIGS_KEY = "codeai_configs";

const loadSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const persistSessions = (sessions: ChatSession[]) => {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
};

const loadSavedConfigs = (): GitHubConfig[] => {
  try {
    const raw = localStorage.getItem(CONFIGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const persistConfigs = (configs: GitHubConfig[]) => {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
};

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfigState] = useState<GitHubConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [savedConfigs, setSavedConfigs] = useState<GitHubConfig[]>(loadSavedConfigs);

  const setConfig = (c: GitHubConfig | null) => {
    setConfigState(c);
    if (c) {
      // Save config to saved configs if not already there
      setSavedConfigs(prev => {
        const key = `${c.repoOwner}/${c.repoName}`;
        const exists = prev.some(p => `${p.repoOwner}/${p.repoName}` === key);
        const updated = exists
          ? prev.map(p => `${p.repoOwner}/${p.repoName}` === key ? c : p)
          : [...prev, c];
        persistConfigs(updated);
        return updated;
      });
    }
  };

  const addMessage = (role: "user" | "assistant", content: string) => {
    setMessages((prev) => {
      const updated = [
        ...prev,
        { id: crypto.randomUUID(), role, content, timestamp: new Date() },
      ];
      return updated;
    });
  };

  const updateLastAssistantMessage = (content: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content } : m
        );
      }
      return [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant" as const, content, timestamp: new Date() },
      ];
    });
  };

  // Auto-save session when messages change
  const saveCurrentSession = useCallback(() => {
    if (!config || messages.length === 0) return;

    const title = messages.find(m => m.role === "user")?.content.slice(0, 60) || "Novo Chat";

    setSessions(prev => {
      let updated: ChatSession[];
      if (activeSessionId) {
        updated = prev.map(s =>
          s.id === activeSessionId
            ? { ...s, messages, title, config, updatedAt: new Date().toISOString() }
            : s
        );
      } else {
        const newId = crypto.randomUUID();
        setActiveSessionId(newId);
        const newSession: ChatSession = {
          id: newId,
          title,
          config,
          messages,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        updated = [newSession, ...prev];
      }
      persistSessions(updated);
      return updated;
    });
  }, [config, messages, activeSessionId]);

  // Auto-save when messages change
  useEffect(() => {
    if (messages.length > 0 && config) {
      const timer = setTimeout(saveCurrentSession, 500);
      return () => clearTimeout(timer);
    }
  }, [messages, config, saveCurrentSession]);

  const loadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    setConfigState(session.config);
    setMessages(session.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
    setActiveSessionId(id);
    setSelectedFile(null);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      persistSessions(updated);
      return updated;
    });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setSelectedFile(null);
    // Keep config so user stays in workspace
  };

  return (
    <AppContext.Provider
      value={{
        config, setConfig,
        messages, setMessages, addMessage, updateLastAssistantMessage,
        isLoading, setIsLoading,
        previewUrl, setPreviewUrl,
        files, setFiles,
        selectedFile, setSelectedFile,
        activeSessionId, setActiveSessionId,
        sessions, saveCurrentSession, loadSession, deleteSession, startNewChat,
        savedConfigs,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
