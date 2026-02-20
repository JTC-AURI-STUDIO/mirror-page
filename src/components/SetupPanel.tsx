import React, { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { Github, Key, Link, ArrowRight, Zap } from "lucide-react";

const SetupPanel = () => {
  const { setConfig } = useAppContext();
  const [token, setToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setError("");
    if (!token.trim()) {
      setError("Insira o token do GitHub");
      return;
    }
    if (!repoUrl.trim()) {
      setError("Insira o link do repositório");
      return;
    }

    // Parse repo URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      setError("URL do repositório inválida. Use: https://github.com/usuario/repositorio");
      return;
    }

    setIsConnecting(true);

    // Test token
    try {
      const res = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) {
        setError("Token inválido ou sem acesso ao repositório");
        setIsConnecting(false);
        return;
      }
    } catch {
      setError("Erro ao conectar com o GitHub");
      setIsConnecting(false);
      return;
    }

    setConfig({
      token,
      repoUrl,
      repoOwner: match[1],
      repoName: match[2].replace(/\.git$/, ""),
    });
    setIsConnecting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 animate-pulse-glow">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Code<span className="text-primary">AI</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Conecte seu repositório GitHub e use IA para editar seu projeto com comandos em linguagem natural.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4 glass rounded-xl p-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Key className="h-4 w-4 text-primary" />
              Token do GitHub
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg bg-muted border border-border px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <p className="text-xs text-muted-foreground">
              Crie um token em GitHub → Settings → Developer settings → Personal access tokens
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link className="h-4 w-4 text-primary" />
              Link do Repositório
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/usuario/meu-projeto"
              className="w-full rounded-lg bg-muted border border-border px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 glow-primary"
          >
            {isConnecting ? (
              <>
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <Github className="h-4 w-4" />
                Conectar Repositório
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        {/* Help */}
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Como criar o Token?</h3>
          <div className="space-y-3">
            {[
              { step: 1, title: "Acesse a página de tokens", desc: <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-primary font-mono hover:underline">github.com/settings/tokens/new</a> },
              { step: 2, title: "Escolha o tipo de token", desc: <>Clique em <strong className="text-foreground">Generate new token (classic)</strong></> },
              { step: 3, title: "Dê um nome ao token", desc: <>No campo Note, coloque algo como <span className="text-primary font-mono">jtc-gitremix</span></> },
              { step: 4, title: "Marque a permissão 'repo'", desc: <>Na lista de scopes, marque <span className="text-foreground">☑ repo</span> — Full control of private repositories</> },
              { step: 5, title: "Gere e copie o token", desc: <>Clique em <strong className="text-foreground">Generate token</strong> e copie o token <span className="text-primary font-mono">ghp_...</span></> },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {item.step}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 flex items-start gap-2">
            <span className="text-warning text-sm">⚠️</span>
            <p className="text-xs text-warning/90">
              <strong>Importante:</strong> O token só aparece uma vez! Copie e guarde em local seguro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupPanel;
