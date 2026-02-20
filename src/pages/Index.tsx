import React, { useEffect, useState } from "react";
import { AppProvider, useAppContext } from "@/context/AppContext";
import SetupPanel from "@/components/SetupPanel";
import ChatPanel from "@/components/ChatPanel";
import FileExplorer from "@/components/FileExplorer";
import PreviewPanel from "@/components/PreviewPanel";
import { Zap, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

const WorkspaceLayout = () => {
  const { config, setConfig } = useAppContext();
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      if (!s) navigate("/auth");
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) navigate("/auth");
    });
  }, [navigate]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("profiles").select("username").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => { if (data) setUsername(data.username); });
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setConfig(null);
    navigate("/auth");
  };

  if (!session) return null;
  if (!config) return <SetupPanel />;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-bold">
            Code<span className="text-primary">AI</span>
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {config.repoOwner}/{config.repoName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {username && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {username}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 shrink-0 border-r border-border bg-card overflow-hidden">
          <FileExplorer />
        </div>
        <div className="w-[420px] shrink-0 border-r border-border overflow-hidden">
          <ChatPanel />
        </div>
        <div className="flex-1 overflow-hidden">
          <PreviewPanel />
        </div>
      </div>
    </div>
  );
};

const Index = () => {
  return (
    <AppProvider>
      <WorkspaceLayout />
    </AppProvider>
  );
};

export default Index;
