import React, { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { Globe, ExternalLink, RefreshCw, FileCode, Eye, Copy, Check } from "lucide-react";

const PreviewPanel = () => {
  const { config, previewUrl, setPreviewUrl, selectedFile } = useAppContext();
  const [inputUrl, setInputUrl] = useState("");
  const [key, setKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const handleSetUrl = () => {
    if (inputUrl.trim()) {
      setPreviewUrl(inputUrl.trim());
    }
  };

  const suggestedUrl = config
    ? `https://${config.repoOwner}.github.io/${config.repoName}`
    : "";

  const handleCopy = () => {
    if (selectedFile?.content) {
      navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Auto-switch to code tab when a file is selected
  React.useEffect(() => {
    if (selectedFile) setActiveTab("code");
  }, [selectedFile]);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center border-b border-border bg-card">
        <button
          onClick={() => setActiveTab("preview")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
            activeTab === "preview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          onClick={() => setActiveTab("code")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
            activeTab === "code"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCode className="h-3.5 w-3.5" />
          Código
          {selectedFile && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono truncate max-w-[150px]">
              {selectedFile.path.split("/").pop()}
            </span>
          )}
        </button>

        {/* URL bar for preview tab */}
        {activeTab === "preview" && (
          <div className="flex items-center gap-2 ml-auto pr-3">
            <input
              type="text"
              value={previewUrl || inputUrl}
              onChange={(e) => { setInputUrl(e.target.value); setPreviewUrl(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSetUrl(); }}
              placeholder="URL de preview..."
              className="w-48 bg-muted/50 rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button
              onClick={() => setKey((k) => k + 1)}
              className="p-1 hover:text-primary transition-colors"
              title="Recarregar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:text-primary transition-colors"
                title="Abrir em nova aba"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Copy button for code tab */}
        {activeTab === "code" && selectedFile && (
          <div className="flex items-center gap-2 ml-auto pr-3">
            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
              {selectedFile.path}
            </span>
            <button
              onClick={handleCopy}
              className="p-1 hover:text-primary transition-colors"
              title="Copiar código"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab === "preview" ? (
          previewUrl ? (
            <iframe
              key={key}
              src={previewUrl}
              className="absolute inset-0 h-full w-full border-0"
              title="Preview do projeto"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-8">
              <Globe className="h-16 w-16 text-muted-foreground/30" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhum preview configurado
                </p>
                <p className="text-xs text-muted-foreground/70 max-w-sm">
                  Insira a URL de deploy do seu projeto para visualizar as alterações em tempo real.
                </p>
                {suggestedUrl && (
                  <button
                    onClick={() => setPreviewUrl(suggestedUrl)}
                    className="text-xs text-primary hover:underline"
                  >
                    Tentar: {suggestedUrl}
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          selectedFile ? (
            <div className="h-full overflow-auto scrollbar-thin">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 sticky top-0 z-10">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-mono text-foreground font-medium">{selectedFile.path}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {selectedFile.content.split("\n").length} linhas
                </span>
              </div>
              <pre className="p-4 text-xs font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {selectedFile.content.split("\n").map((line, i) => (
                  <div key={i} className="flex hover:bg-muted/30 transition-colors">
                    <span className="inline-block w-10 shrink-0 text-right pr-4 text-muted-foreground/50 select-none">
                      {i + 1}
                    </span>
                    <span className="flex-1">{line || " "}</span>
                  </div>
                ))}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-8">
              <FileCode className="h-16 w-16 text-muted-foreground/30" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhum arquivo selecionado
                </p>
                <p className="text-xs text-muted-foreground/70 max-w-sm">
                  Clique em um arquivo no explorador à esquerda para ver seu conteúdo completo aqui.
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PreviewPanel;
