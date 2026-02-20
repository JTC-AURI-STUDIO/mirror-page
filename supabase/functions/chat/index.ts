import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchRepoTree(githubToken: string, repoOwner: string, repoName: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/main?recursive=1`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tree || [])
      .filter((item: any) => item.type === "blob")
      .map((item: any) => item.path);
  } catch {
    return [];
  }
}

async function readFileContent(githubToken: string, repoOwner: string, repoName: string, filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const binary = atob(data.content.replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, githubToken, repoOwner, repoName, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Action: list files
    if (action === "list-files") {
      const path = messages || "";
      const ghRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!ghRes.ok) {
        const err = await ghRes.text();
        throw new Error(`GitHub API error: ${ghRes.status} - ${err}`);
      }
      const files = await ghRes.json();
      return new Response(JSON.stringify({ files }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: read file
    if (action === "read-file") {
      const filePath = messages;
      const ghRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!ghRes.ok) {
        const err = await ghRes.text();
        throw new Error(`File not found: ${filePath} (${ghRes.status})`);
      }
      const fileData = await ghRes.json();
      const binary = atob(fileData.content.replace(/\n/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const content = new TextDecoder().decode(bytes);
      return new Response(JSON.stringify({ content, sha: fileData.sha, path: fileData.path }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: write file
    if (action === "write-file") {
      const { path, content, sha, commitMessage } = messages;
      const ghRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commitMessage || `Update ${path} via AI assistant`,
          content: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
          sha: sha || undefined,
        }),
      });
      if (!ghRes.ok) {
        const err = await ghRes.text();
        throw new Error(`GitHub write error: ${ghRes.status} - ${err}`);
      }
      const result = await ghRes.json();
      return new Response(JSON.stringify({ success: true, commit: result.commit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== CHAT ACTION =====
    // 1. Fetch full file tree
    const allFiles = await fetchRepoTree(githubToken, repoOwner, repoName);
    const fileTreeStr = allFiles.length > 0 ? allFiles.join("\n") : "(não foi possível listar os arquivos)";

    // 2. Identify which files to read for context
    const ignoredPatterns = ["node_modules", ".lock", "lockb", ".git/", "dist/", ".next/", ".png", ".jpg", ".ico", ".svg", ".woff", ".ttf"];
    const relevantExtensions = [".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".json"];
    const priorityFiles = ["package.json", "index.html", "tailwind.config.ts", "vite.config.ts", "tsconfig.json"];
    
    const srcFiles = allFiles.filter(f => {
      if (ignoredPatterns.some(p => f.includes(p))) return false;
      if (priorityFiles.includes(f)) return true;
      return relevantExtensions.some(ext => f.endsWith(ext));
    });

    // Prioritize: config files first, then src/ files, limit to 15
    const sorted = [
      ...srcFiles.filter(f => priorityFiles.includes(f)),
      ...srcFiles.filter(f => !priorityFiles.includes(f) && f.startsWith("src/")),
      ...srcFiles.filter(f => !priorityFiles.includes(f) && !f.startsWith("src/")),
    ];
    const filesToRead = sorted.slice(0, 15);

    // 3. Read files in parallel
    const fileContents: { path: string; content: string }[] = [];
    await Promise.all(
      filesToRead.map(async (filePath) => {
        const content = await readFileContent(githubToken, repoOwner, repoName, filePath);
        if (content && content.length < 15000) {
          fileContents.push({ path: filePath, content });
        }
      })
    );

    const filesContext = fileContents
      .map(f => `=== ARQUIVO: ${f.path} ===\n${f.content}`)
      .join("\n\n");

    // 4. Extract user's latest message to understand intent
    const userMessages = (messages as any[]).filter(m => m.role === "user");
    const latestUserMsg = userMessages[userMessages.length - 1]?.content || "";

    const systemPrompt = `Você é um programador sênior full-stack especialista em React, TypeScript, Tailwind CSS e desenvolvimento web moderno.
Seu trabalho é modificar o código do repositório GitHub "${repoOwner}/${repoName}" conforme solicitado pelo usuário.

## ESTRUTURA COMPLETA DO REPOSITÓRIO:
${fileTreeStr}

## CONTEÚDO DOS ARQUIVOS DO PROJETO:
${filesContext}

## REGRA MAIS IMPORTANTE DE TODAS:
VOCÊ **SEMPRE** DEVE incluir um bloco \`\`\`json com o array "files" na sua resposta quando o usuário pedir QUALQUER modificação.
Se você não incluir o bloco JSON, NENHUMA alteração será aplicada e o usuário ficará frustrado.
NUNCA responda apenas com texto quando uma modificação é solicitada. SEMPRE inclua o JSON.

## REGRAS CRÍTICAS (SIGA RIGOROSAMENTE):

### 1. SOBRE CAMINHOS DE ARQUIVOS:
- Use EXCLUSIVAMENTE caminhos que existem na lista de arquivos acima.
- NUNCA invente um caminho de arquivo. Se o arquivo não está na lista, ele NÃO existe.
- Se precisar criar um novo arquivo, use action "create" e escolha um caminho lógico dentro da estrutura existente.
- Para editar um arquivo existente, use action "update" e o caminho EXATO da lista.

### 2. SOBRE O CONTEÚDO:
- Quando usar action "update", forneça o conteúdo COMPLETO e FINAL do arquivo, não apenas trechos.
- Preserve TODO o código existente que não precisa ser alterado.
- Copie a estrutura, imports e exports exatamente como estão no arquivo original.
- NÃO remova funcionalidades existentes a menos que o usuário peça explicitamente.

### 3. SOBRE A RESPOSTA:
- Primeiro, explique em 1-2 frases CURTAS o que você vai fazer.
- Depois, IMEDIATAMENTE inclua o bloco JSON com as alterações.
- NÃO mostre o código fora do bloco JSON. O sistema aplica automaticamente.
- NUNCA diga "vou fazer X" sem incluir o JSON. Sempre inclua o JSON junto.

### 4. FORMATO JSON OBRIGATÓRIO (SEMPRE INCLUIR):
\`\`\`json
{
  "files": [
    {
      "path": "caminho/exato/do/arquivo.tsx",
      "content": "conteúdo COMPLETO do arquivo aqui",
      "action": "update"
    }
  ]
}
\`\`\`

### 5. QUALIDADE DO CÓDIGO:
- Use Tailwind CSS para estilização.
- Mantenha o código limpo, organizado e funcional.
- Use componentes React modernos com hooks.
- Garanta que o código compila sem erros.
- Se o projeto usa TypeScript, mantenha os tipos corretos.

### 6. ANÁLISE ANTES DE AGIR:
- Leia TODOS os arquivos relevantes acima antes de propor mudanças.
- Entenda as dependências entre arquivos.
- Identifique imports e exports para não quebrar nada.
- Se o arquivo importa componentes de outros arquivos, verifique se esses componentes existem.

### 7. SOBRE IMAGENS ENVIADAS PELO USUÁRIO:
- Quando o usuário enviar uma imagem junto com a mensagem, ele está pedindo para usar essa imagem no projeto.
- A imagem já está hospedada em uma URL pública. Você receberá a URL da imagem como parte da mensagem.
- Use essa URL DIRETAMENTE no código como src da tag <img> ou como background-image no CSS.
- NUNCA tente baixar ou converter a imagem. Use a URL exatamente como recebida.
- Exemplo: se o usuário enviar uma imagem e disser "coloque no header", adicione <img src="URL_DA_IMAGEM" /> no componente do header.
- Se o usuário enviar uma imagem sem instrução específica, pergunte onde ele quer que a imagem seja colocada.
- Garanta que a imagem tenha classes Tailwind adequadas (object-cover, rounded, etc.) para boa apresentação.

### 8. LEMBRETE FINAL:
Se o usuário pediu uma modificação e você NÃO incluiu o bloco \`\`\`json com "files", SUA RESPOSTA ESTÁ ERRADA.
Volte e adicione o JSON. SEMPRE.

Responda sempre em português brasileiro. Seja preciso e eficiente.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        max_tokens: 16000,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Aguarde alguns minutos e tente novamente." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
