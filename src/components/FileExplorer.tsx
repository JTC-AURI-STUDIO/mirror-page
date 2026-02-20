import React, { useEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { FolderOpen, File, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  expanded?: boolean;
}

const FileExplorer = () => {
  const { config, selectedFile, setSelectedFile } = useAppContext();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = async (path = "") => {
    if (!config) return [];
    const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: path,
        githubToken: config.token,
        repoOwner: config.repoOwner,
        repoName: config.repoName,
        action: "list-files",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      name: f.name,
      path: f.path,
      type: f.type,
    }));
  };

  const loadRoot = async () => {
    setLoading(true);
    const files = await fetchFiles();
    setTree(files);
    setLoading(false);
  };

  useEffect(() => {
    if (config) loadRoot();
  }, [config]);

  // Auto-refresh when files are updated via chat
  useEffect(() => {
    const handler = () => { loadRoot(); };
    window.addEventListener("files-updated", handler);
    return () => window.removeEventListener("files-updated", handler);
  }, [config]);

  const toggleDir = async (node: FileNode, parentPath: string[]) => {
    if (node.type !== "dir") {
      // Read file
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: node.path,
          githubToken: config?.token,
          repoOwner: config?.repoOwner,
          repoName: config?.repoName,
          action: "read-file",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedFile({ path: node.path, content: data.content || "" });
      }
      return;
    }

    // Toggle directory
    const updateTree = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) => {
        if (n.path === node.path) {
          return { ...n, expanded: !n.expanded };
        }
        if (n.children) return { ...n, children: updateTree(n.children) };
        return n;
      });

    if (!node.children) {
      const children = await fetchFiles(node.path);
      const updateWithChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map((n) => {
          if (n.path === node.path) return { ...n, children, expanded: true };
          if (n.children) return { ...n, children: updateWithChildren(n.children) };
          return n;
        });
      setTree(updateWithChildren(tree));
    } else {
      setTree(updateTree(tree));
    }
  };

  const renderNode = (node: FileNode, depth = 0) => (
    <div key={node.path}>
      <button
        onClick={() => toggleDir(node, [])}
        className={`flex w-full items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded transition-colors ${
          selectedFile?.path === node.path ? "bg-muted text-primary" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.type === "dir" ? (
          <>
            {node.expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {node.expanded && node.children?.map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arquivos</span>
        <button onClick={loadRoot} className="p-1 hover:text-primary transition-colors" title="Atualizar">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>
      {/* File preview removed - now in PreviewPanel code tab */}
    </div>
  );
};

export default FileExplorer;
