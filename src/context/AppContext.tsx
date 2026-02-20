import React, { createContext, useContext, useState, ReactNode } from "react";

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

interface AppContextType {
  config: GitHubConfig | null;
  setConfig: (config: GitHubConfig | null) => void;
  messages: Message[];
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
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);

  const addMessage = (role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: new Date() },
    ]);
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

  return (
    <AppContext.Provider
      value={{
        config, setConfig,
        messages, addMessage, updateLastAssistantMessage,
        isLoading, setIsLoading,
        previewUrl, setPreviewUrl,
        files, setFiles,
        selectedFile, setSelectedFile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
