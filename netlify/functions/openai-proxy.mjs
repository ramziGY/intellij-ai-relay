// Endpoint OpenAI-compatible d'Anthropic
const ANTHROPIC_CHAT_URL = "https://api.anthropic.com/v1/chat/completions";

// Modèle imposé côté serveur (voir https://platform.claude.com/docs/en/models/overview)
const MODEL = "claude-sonnet-5";

// Sécurité : max_tokens par défaut si IntelliJ ne l'envoie pas
const DEFAULT_MAX_TOKENS = 4096;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function apiError(message, status, type) {
  return json({ error: { message, type } }, status);
}

export default async function handler(request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const relayKey = process.env.RELAY_API_KEY;

  // 1. Configuration serveur
  if (!anthropicKey || !relayKey) {
    return apiError("Server configuration is incomplete", 500, "server_error");
  }

  // 2. Clé envoyée par IntelliJ
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${relayKey}`) {
    return apiError("Invalid API key", 401, "invalid_request_error");
  }

  // 3. Route appelée
  const { pathname } = new URL(request.url);
  const isModelsPath = pathname === "/models" || pathname === "/v1/models";
  const isChatPath =
    pathname === "/chat/completions" || pathname === "/v1/chat/completions";

  // 4. Liste des modèles
  if (request.method === "GET" && isModelsPath) {
    return json({
      object: "list",
      data: [{ id: MODEL, object: "model", created: 0, owned_by: "relay" }],
    });
  }

  // 5. Chat
  if (request.method === "POST" && isChatPath) {
    let body;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400, "invalid_request_error");
    }

    if (!Array.isArray(body.messages)) {
      return apiError(
        "The 'messages' field is required",
        400,
        "invalid_request_error",
      );
    }

    // Champs OpenAI inutiles chez Anthropic (ignorés, on nettoie quand même)
    const { store, ...cleanBody } = body;

    // Anthropic accepte temperature entre 0 et 1 uniquement
    if (typeof cleanBody.temperature === "number" && cleanBody.temperature > 1) {
      cleanBody.temperature = 1;
    }

    let upstreamResponse;

    // 6. Appel vers Anthropic
    try {
      upstreamResponse = await fetch(ANTHROPIC_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${anthropicKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...cleanBody,
          model: MODEL,
          max_tokens: cleanBody.max_tokens ?? DEFAULT_MAX_TOKENS,
        }),
      });
    } catch (error) {
      console.error("Unable to contact Anthropic:", error);
      return apiError("Unable to contact Anthropic", 502, "server_error");
    }

    const contentType =
      upstreamResponse.headers.get("content-type") ?? "application/json";

    // 7. Streaming
    if (body.stream === true) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: { "content-type": contentType, "cache-control": "no-store" },
      });
    }

    // 8. Réponse classique
    const responseText = await upstreamResponse.text();
    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: { "content-type": contentType, "cache-control": "no-store" },
    });
  }

  // 9. Route inconnue
  return apiError("Route not found", 404, "invalid_request_error");
}

// 10. Routes publiques
export const config = {
  path: ["/models", "/chat/completions", "/v1/models", "/v1/chat/completions"],
};
