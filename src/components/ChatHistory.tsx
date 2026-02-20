import React from "react";
import { useAppContext } from "@/context/AppContext";
import { Plus, MessageSquare, Trash2, Clock, Github } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const ChatHistory = () => {
  const { activeSessionId, sessions, loadSession, deleteSession, startNewChat } = useAppContext();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Agora";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico
        </span>
        <button
          onClick={startNewChat}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-all"
          title="Novo Chat"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1 space-y-0.5">
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum chat salvo</p>
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition-all hover:bg-muted group ${
                  activeSessionId === s.id ? "bg-muted border-l-2 border-primary" : ""
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {s.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Github className="h-2.5 w-2.5 text-muted-foreground/60" />
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                      {s.config.repoOwner}/{s.config.repoName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatDate(s.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                  title="Excluir chat"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatHistory;
