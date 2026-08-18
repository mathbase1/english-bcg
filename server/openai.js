export async function callOpenAI({
  model,
  instructions,
  input,
  schemaName,
  schema,
  maxOutputTokens = 1500
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "");
  if (!apiKey) {
    const error = new Error("Missing OPENAI_API_KEY in Vercel environment variables.");
    error.status = 500;
    throw error;
  }

  const selectedModel = model || process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const reasoningEffort = String(process.env.OPENAI_REASONING_EFFORT || "low");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      store: false,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
      input: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `OpenAI request failed (${response.status}).`;
    const error = new Error(String(message));
    error.status = response.status;
    error.retryAfter = Number(response.headers.get("retry-after") || 0) || null;
    throw error;
  }

  if (data?.status === "failed") {
    const message = data?.error?.message || "OpenAI could not complete the response.";
    const error = new Error(String(message));
    error.status = 502;
    throw error;
  }

  if (data?.status === "incomplete") {
    const reason = data?.incomplete_details?.reason || "response incomplete";
    const error = new Error(`OpenAI returned an incomplete response: ${reason}.`);
    error.status = 502;
    throw error;
  }

  const refusal = extractRefusal(data);
  if (refusal) {
    const error = new Error(`OpenAI declined the request: ${refusal}`);
    error.status = 422;
    throw error;
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    const error = new Error("OpenAI returned no structured output.");
    error.status = 502;
    throw error;
  }

  try {
    return JSON.parse(outputText);
  } catch {
    const error = new Error("OpenAI returned output that could not be parsed as JSON.");
    error.status = 502;
    throw error;
  }
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("").trim();
}

function extractRefusal(data) {
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "refusal" && typeof content?.refusal === "string") {
        return content.refusal.trim();
      }
    }
  }
  return "";
}
