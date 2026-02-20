import React, { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { Send, Bot, User, Loader2, CheckCircle2, FileCode, AlertCircle, ImagePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

const cleanResponse = (text: string): string => {
  // Remove JSON code blocks containing "files" array
  let cleaned = text;
  
  // Find and remove ```json { "files": [...] } ``` blocks
  const codeBlockRegex = /```(?:json)?\s*[\s\S]*?```/g;
  cleaned = cleaned.replace(codeBlockRegex, (match) => {
    if (match.includes('"files"') && match.includes('"path"')) {
      return ''; // Remove only file-change JSON blocks
    }
    return match; // Keep other code blocks
  });
  
  cleaned = cleaned.replace(/\n\n[✅⚠️].*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
};

interface FileOp {
  path: string;
  status: "pending" | "writing" | "done" | "error";
}

interface ChatImage {
  url: string;
  file: File;
}

const ChatPanel = () => {
  const { messages, addMessage, updateLastAssistantMessage, isLoading, setIsLoading, config, setPreviewUrl, previewUrl, setSelectedFile } = useAppContext();
  const [input, setInput] = useState("");
  const [fileOps, setFileOps] = useState<FileOp[]>([]);
  const [progress, setProgress] = useState(0);
  const [processingLabel, setProcessingLabel] = useState("");
  const [attachedImages, setAttachedImages] = useState<ChatImage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, fileOps]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: ChatImage[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        newImages.push({ url: URL.createObjectURL(file), file });
      }
    });
    setAttachedImages((prev) => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadImage = async (file: File, retries = 2): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { error } = await supabase.storage.from("chat-images").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) {
          console.error(`Upload attempt ${attempt + 1} error:`, error);
          if (attempt === retries) return null;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
        return data.publicUrl;
      } catch (e) {
        console.error(`Upload attempt ${attempt + 1} exception:`, e);
        if (attempt === retries) return null;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return null;
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachedImages.length === 0) || isLoading || !config) return;

    setInput("");
    setIsLoading(true);
    setFileOps([]);
    setProgress(0);
    setProcessingLabel("Processando...");

    // Upload images first
    let imageUrls: string[] = [];
    if (attachedImages.length > 0) {
      setProcessingLabel("Enviando imagens...");
      setProgress(5);
      const uploads = await Promise.all(attachedImages.map((img) => uploadImage(img.file)));
      imageUrls = uploads.filter(Boolean) as string[];
      if (imageUrls.length === 0 && attachedImages.length > 0) {
        addMessage("assistant", "❌ Erro ao enviar as imagens. Verifique sua conexão e tente novamente.");
        setIsLoading(false);
        setProgress(0);
        setProcessingLabel("");
        return;
      }
      if (imageUrls.length < attachedImages.length) {
        addMessage("assistant", `⚠️ ${attachedImages.length - imageUrls.length} imagem(ns) não foi(ram) enviada(s). Continuando com as que foram enviadas com sucesso.`);
      }
      setAttachedImages([]);
    }

    // Build user message content
    let userDisplayContent = text;
    if (imageUrls.length > 0) {
      userDisplayContent += imageUrls.map((url) => `\n![imagem](${url})`).join("");
    }
    addMessage("user", userDisplayContent);

    // Build messages for AI API (multimodal)
    const allMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    // For the new message, use multimodal content if images exist
    let newMsgContent: any;
    if (imageUrls.length > 0) {
      const parts: any[] = [];
      if (text) parts.push({ type: "text", text });
      imageUrls.forEach((url) => {
        parts.push({ type: "image_url", image_url: { url } });
      });
      newMsgContent = parts;
    } else {
      newMsgContent = text;
    }

    const apiMessages = [
      ...allMessages,
      { role: "user" as const, content: newMsgContent },
    ];

    try {
      setProgress(15);
      setProcessingLabel("Conectando com a IA...");

      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          githubToken: config.token,
          repoOwner: config.repoOwner,
          repoName: config.repoName,
          action: "chat",
        }),
      });

      if (!resp.ok || !resp.body) {
        const errorData = await resp.json().catch(() => ({}));
        addMessage("assistant", `❌ Erro: ${errorData.error || "Falha na comunicação"}`);
        setIsLoading(false);
        setProgress(0);
        setProcessingLabel("");
        return;
      }

      setProgress(30);
      setProcessingLabel("Recebendo resposta da IA...");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantSoFar = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              updateLastAssistantMessage(cleanResponse(assistantSoFar));
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final buffer flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              updateLastAssistantMessage(cleanResponse(assistantSoFar));
            }
          } catch { /* ignore */ }
        }
      }

      setProgress(60);
      setProcessingLabel("Aplicando alterações...");
      await applyFileChanges(assistantSoFar);
      setProgress(100);
      setProcessingLabel("");
    } catch (e) {
      console.error(e);
      addMessage("assistant", "❌ Erro inesperado. Tente novamente.");
    }

    setIsLoading(false);
    setTimeout(() => { setProgress(0); setFileOps([]); }, 2000);
  };

  const extractJsonFromResponse = (response: string): any | null => {
    console.log("[CodeAI] Extraindo JSON da resposta. Tamanho:", response.length);
    console.log("[CodeAI] Contém 'files'?", response.includes('"files"'));
    console.log("[CodeAI] Contém 'path'?", response.includes('"path"'));
    console.log("[CodeAI] Contém 'content'?", response.includes('"content"'));
    
    let raw = response;
    
    // Try to find JSON inside code blocks first
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/g);
    
    if (codeBlockMatch) {
      console.log("[CodeAI] Blocos de código encontrados:", codeBlockMatch.length);
      for (const block of codeBlockMatch) {
        const inner = block.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
        if (inner.includes('"files"')) {
          console.log("[CodeAI] Bloco com 'files' encontrado, tamanho:", inner.length);
          raw = inner;
          break;
        }
      }
    } else {
      console.log("[CodeAI] Nenhum bloco de código encontrado");
    }

    const filesIdx = raw.indexOf('"files"');
    if (filesIdx === -1) {
      console.error("[CodeAI] ❌ Palavra 'files' NÃO encontrada na resposta. A IA não gerou o JSON de alterações.");
      console.log("[CodeAI] Últimos 500 chars da resposta:", response.slice(-500));
      return null;
    }
    
    let startIdx = -1;
    for (let i = filesIdx - 1; i >= 0; i--) {
      if (raw[i] === '{') { startIdx = i; break; }
    }
    if (startIdx === -1) {
      console.error("[CodeAI] ❌ Não encontrou '{' antes de 'files'");
      return null;
    }
    
    let depth = 0;
    let endIdx = -1;
    let inString = false;
    let escape = false;
    
    for (let i = startIdx; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    
    if (endIdx === -1) {
      console.error("[CodeAI] ❌ JSON truncado - chaves não balanceadas. max_tokens pode ser insuficiente.");
      return null;
    }
    
    let jsonStr = raw.substring(startIdx, endIdx + 1);
    console.log("[CodeAI] JSON extraído, tamanho:", jsonStr.length);
    
    try {
      const result = JSON.parse(jsonStr);
      console.log("[CodeAI] ✅ JSON parseado com sucesso. Arquivos:", result.files?.length || 0);
      if (result.files) {
        result.files.forEach((f: any, i: number) => {
          console.log(`[CodeAI]   Arquivo ${i + 1}: ${f.path} (${f.content?.length || 0} chars, action: ${f.action || 'update'})`);
        });
      }
      return result;
    } catch (e1) {
      jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try {
        const result = JSON.parse(jsonStr);
        console.log("[CodeAI] ✅ JSON parseado após limpeza. Arquivos:", result.files?.length || 0);
        return result;
      } catch (e2) {
        console.error("[CodeAI] ❌ Falha ao parsear JSON:", e2);
        console.log("[CodeAI] Primeiros 300 chars do JSON:", jsonStr.substring(0, 300));
        return null;
      }
    }
  };

  const applyFileChanges = async (response: string) => {
    console.log("[CodeAI] === INICIANDO applyFileChanges ===");
    console.log("[CodeAI] Tamanho da resposta:", response.length);
    
    const parsed = extractJsonFromResponse(response);
    
    if (!parsed || !config) {
      console.error("[CodeAI] ❌ Extração falhou. parsed:", parsed, "config:", !!config);
      if (response.length > 50) {
        updateLastAssistantMessage(cleanResponse(response) + "\n\n⚠️ A IA não gerou o bloco JSON de alterações. Isso significa que nenhuma modificação foi feita. Tente novamente com um pedido mais específico, como: \"Mude o título da página para 'Olá Mundo'\"");
      }
      return;
    }

    const { files } = parsed;
    if (!Array.isArray(files) || files.length === 0) {
      console.error("[CodeAI] ❌ Array 'files' vazio ou inválido");
      updateLastAssistantMessage(cleanResponse(response) + "\n\n⚠️ Nenhum arquivo para alterar foi encontrado na resposta.");
      return;
    }

    const validFiles = files.filter((f: any) => f.path && f.content);
    console.log("[CodeAI] Arquivos válidos:", validFiles.length, "de", files.length);
    if (validFiles.length === 0) {
      console.error("[CodeAI] ❌ Nenhum arquivo tem path+content válidos");
      updateLastAssistantMessage(cleanResponse(response) + "\n\n⚠️ Arquivos sem conteúdo válido na resposta.");
      return;
    }

    const ops: FileOp[] = validFiles.map((f: any) => ({
      path: f.path, status: "pending" as const,
    }));
    setFileOps(ops);

    let successCount = 0;
    let errorCount = 0;
    let lastSuccessFile: { path: string; content: string } | null = null;
    const commitUrls: string[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const fileProgress = 60 + ((i / validFiles.length) * 35);
      setProgress(fileProgress);
      setProcessingLabel(`Escrevendo ${file.path}...`);
      setFileOps(prev => prev.map((op, idx) => idx === i ? { ...op, status: "writing" } : op));

      try {
        let sha: string | undefined;
        const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
        
        // Get SHA
        console.log(`[CodeAI] Buscando SHA de ${file.path}...`);
        try {
          const readRes = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              messages: file.path, githubToken: config.token,
              repoOwner: config.repoOwner, repoName: config.repoName, action: "read-file",
            }),
          });
          if (readRes.ok) {
            const data = await readRes.json();
            sha = data.sha;
            console.log(`[CodeAI] SHA obtido: ${sha?.substring(0, 7)}`);
          } else {
            console.log(`[CodeAI] Arquivo novo (sem SHA): ${file.path}`);
          }
        } catch { /* new file */ }

        // Write with retry
        let writeSuccess = false;
        for (let attempt = 0; attempt < 3 && !writeSuccess; attempt++) {
          console.log(`[CodeAI] Tentativa ${attempt + 1} de escrita: ${file.path}`);
          try {
            const writeRes = await fetch(CHAT_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                messages: { path: file.path, content: file.content, sha },
                githubToken: config.token, repoOwner: config.repoOwner,
                repoName: config.repoName, action: "write-file",
              }),
            });

            if (writeRes.ok) {
              const result = await writeRes.json();
              writeSuccess = true;
              successCount++;
              lastSuccessFile = { path: file.path, content: file.content };
              const commitUrl = result.commit?.html_url || `https://github.com/${config.repoOwner}/${config.repoName}/commits/main`;
              commitUrls.push(commitUrl);
              console.log(`[CodeAI] ✅ Escrita OK: ${file.path} - Commit: ${commitUrl}`);
              setFileOps(prev => prev.map((op, idx) => idx === i ? { ...op, status: "done" } : op));
            } else {
              const errText = await writeRes.text();
              console.error(`Write attempt ${attempt + 1} failed:`, errText);
              if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1000));
                // Re-fetch SHA
                try {
                  const readRes = await fetch(CHAT_URL, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                    },
                    body: JSON.stringify({
                      messages: file.path, githubToken: config.token,
                      repoOwner: config.repoOwner, repoName: config.repoName, action: "read-file",
                    }),
                  });
                  if (readRes.ok) {
                    const data = await readRes.json();
                    sha = data.sha;
                  }
                } catch { /* ignore */ }
              }
            }
          } catch (e) {
            console.error(`Write attempt ${attempt + 1} exception:`, e);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
          }
        }
        
        if (!writeSuccess) {
          errorCount++;
          setFileOps(prev => prev.map((op, idx) => idx === i ? { ...op, status: "error" } : op));
        }
      } catch {
        errorCount++;
        setFileOps(prev => prev.map((op, idx) => idx === i ? { ...op, status: "error" } : op));
      }
    }

    console.log(`[CodeAI] === RESULTADO: ${successCount} sucesso, ${errorCount} erro ===`);
    
    let statusMsg = "";
    if (successCount > 0) {
      statusMsg += `\n\n✅ ${successCount} arquivo(s) commitado(s) no GitHub com sucesso!`;
      const ghLink = `https://github.com/${config.repoOwner}/${config.repoName}/commits/main`;
      statusMsg += `\n\n🔗 [Ver commits no GitHub](${ghLink})`;
      statusMsg += `\n\n⏳ **Nota:** Se seu site usa GitHub Pages, as alterações podem levar 1-2 minutos para aparecer no deploy. Verifique o código na aba "Código" para confirmar que a modificação foi feita.`;
    }
    if (errorCount > 0) statusMsg += `\n\n❌ ${errorCount} arquivo(s) com erro ao escrever.`;
    if (statusMsg) updateLastAssistantMessage(cleanResponse(response) + statusMsg);

    // Auto-show the last modified file in Code tab
    if (lastSuccessFile) {
      setSelectedFile(lastSuccessFile);
    }

    // Auto-refresh preview
    if (successCount > 0 && previewUrl) {
      setTimeout(() => {
        const currentUrl = previewUrl;
        setPreviewUrl("");
        setTimeout(() => setPreviewUrl(currentUrl), 100);
      }, 3000);
    }

    // Refresh file explorer
    if (successCount > 0) {
      window.dispatchEvent(new CustomEvent("files-updated"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Render message content with images
  const renderMessageContent = (content: string, role: string) => {
    // Extract image URLs from markdown
    const parts = content.split(/!\[.*?\]\((.*?)\)/g);
    const imageMatches = [...content.matchAll(/!\[.*?\]\((.*?)\)/g)];

    if (imageMatches.length === 0) {
      if (role === "assistant") {
        return (
          <div className="prose prose-sm prose-invert max-w-none [&_pre]:bg-background [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_code]:font-mono [&_code]:text-primary">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        );
      }
      return content;
    }

    return (
      <div className="space-y-2">
        {parts.map((part, idx) => {
          if (idx % 2 === 0 && part.trim()) {
            return role === "assistant" ? (
              <div key={idx} className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{part}</ReactMarkdown>
              </div>
            ) : (
              <p key={idx} className="text-sm">{part.trim()}</p>
            );
          }
          if (idx % 2 === 1) {
            return (
              <img
                key={idx}
                src={part}
                alt="Imagem enviada"
                className="max-w-full max-h-48 rounded-lg border border-border object-cover"
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Assistente IA</h2>
          <p className="text-xs text-muted-foreground">
            {config?.repoOwner}/{config?.repoName}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
            <Bot className="h-12 w-12 text-primary/50" />
            <div>
              <p className="text-sm font-medium">Pronto para começar!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Peça alterações ou envie imagens para análise
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {["Adicione um header bonito", "Mude a cor de fundo para azul", "Crie um footer com links"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-xs text-left px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted transition-all"
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}>
              {renderMessageContent(msg.content, msg.role)}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <User className="h-3.5 w-3.5 text-secondary-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-xl px-4 py-3 flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-primary/50" style={{ animation: "typing-dot 1.4s infinite 0s" }} />
                  <div className="w-2 h-2 rounded-full bg-primary/50" style={{ animation: "typing-dot 1.4s infinite 0.2s" }} />
                  <div className="w-2 h-2 rounded-full bg-primary/50" style={{ animation: "typing-dot 1.4s infinite 0.4s" }} />
                </div>
              </div>
            )}
            {progress > 0 && (
              <div className="mx-2 space-y-2 rounded-xl border border-border bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>{processingLabel}</span>
                </div>
                <Progress value={progress} className="h-1.5" />
                {fileOps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {fileOps.map((op) => (
                      <div key={op.path} className="flex items-center gap-2 text-xs">
                        {op.status === "pending" && <FileCode className="h-3 w-3 text-muted-foreground" />}
                        {op.status === "writing" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        {op.status === "done" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        {op.status === "error" && <AlertCircle className="h-3 w-3 text-destructive" />}
                        <span className={op.status === "done" ? "text-green-500" : op.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                          {op.path}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isLoading && fileOps.length > 0 && progress === 100 && (
          <div className="mx-2 space-y-2 rounded-xl border border-border bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs text-green-500">
              <CheckCircle2 className="h-3 w-3" />
              <span>Alterações aplicadas!</span>
            </div>
            <div className="space-y-1">
              {fileOps.map((op) => (
                <div key={op.path} className="flex items-center gap-2 text-xs">
                  {op.status === "done" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-destructive" />}
                  <span className={op.status === "done" ? "text-green-500" : "text-destructive"}>{op.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image preview */}
      {attachedImages.length > 0 && (
        <div className="border-t border-border px-3 py-2 flex gap-2 overflow-x-auto">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0">
              <img src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover border border-border" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:bg-destructive/90"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl bg-muted p-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-30"
            title="Enviar imagem"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva a alteração ou envie uma imagem..."
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none scrollbar-thin"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachedImages.length === 0) || isLoading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-30"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
