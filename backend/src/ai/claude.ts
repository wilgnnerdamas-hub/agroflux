// Cliente mínimo da API da Anthropic (Messages API) com saída estruturada por ferramenta.
// A chave fica só no backend (ANTHROPIC_API_KEY); nada disso vai para o frontend.

export type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string } };

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeCall {
  system: string;
  content: ClaudeBlock[];
  tool: ToolSpec;
  maxTokens?: number;
}

/** Chama o Claude obrigando o uso de uma ferramenta e devolve o `input` dela (o JSON estruturado). */
export type ClaudeToolCaller = (call: ClaudeCall) => Promise<unknown>;

export function createClaudeCaller(apiKey: string, model: string, timeoutMs = 60_000): ClaudeToolCaller {
  return async ({ system, content, tool, maxTokens = 1_500 }) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) {
      // Não repassa o corpo (pode conter detalhes da conta); só o status.
      throw new Error(`Anthropic API ${res.status}`);
    }
    const body = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
    const use = body.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
    if (!use) throw new Error("Resposta da IA sem o resultado estruturado.");
    return use.input;
  };
}
