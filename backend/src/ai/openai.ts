// Cliente mínimo da API da OpenAI (Chat Completions) com saída estruturada por function calling.
// Mesma interface do cliente da Anthropic: o serviço de IA não sabe qual provedor está por trás.
// A chave fica só no backend (OPENAI_API_KEY); nada disso vai para o frontend.
import type { ClaudeBlock, ClaudeToolCaller } from "./claude.js";

type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string } };

function toPart(b: ClaudeBlock): OpenAiPart {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.type === "document") return { type: "file", file: { filename: "documento.pdf", file_data: `data:application/pdf;base64,${b.source.data}` } };
  return { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
}

export function createOpenAiCaller(apiKey: string, model: string, timeoutMs = 60_000): ClaudeToolCaller {
  return async ({ system, content, tool, maxTokens = 1_500 }) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: content.map(toPart) },
        ],
        tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
        tool_choice: { type: "function", function: { name: tool.name } },
      }),
    });
    if (!res.ok) {
      // Não repassa o corpo (pode conter detalhes da conta); só o status.
      throw new Error(`OpenAI API ${res.status}`);
    }
    const body = (await res.json()) as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
    const call = body.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === tool.name);
    if (!call?.function?.arguments) throw new Error("Resposta da IA sem o resultado estruturado.");
    return JSON.parse(call.function.arguments);
  };
}
