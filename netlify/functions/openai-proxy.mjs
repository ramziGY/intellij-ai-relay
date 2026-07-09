const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const MODEL = "gpt-5.4-mini";

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
  return json(
    {
      error: {
        message,
        type,
      },
    },
    status,
  );
}


export default async function handler(request) {
  const openAiKey = process.env.OPENAI_API_KEY;
  const relayKey = process.env.RELAY_API_KEY;


  // 1. Vérification de la configuration serveur
  if (!openAiKey || !relayKey) {
    return apiError(
      "Server configuration is incomplete",
      500,
      "server_error",
    );
  }


  // 2. Vérification de la clé envoyée par IntelliJ
  const authorization =
    request.headers.get("authorization");

  if (authorization !== `Bearer ${relayKey}`) {
    return apiError(
      "Invalid API key",
      401,
      "invalid_request_error",
    );
  }


  // 3. Récupération de la route appelée

  const { pathname } = new URL(request.url);

  const isModelsPath =
    pathname === "/models" ||
    pathname === "/v1/models";

  const isChatPath =
    pathname === "/chat/completions" ||
    pathname === "/v1/chat/completions";


  // 4. Liste des modèles

  if (request.method === "GET" && isModelsPath) {
    return json({
      object: "list",

      data: [
        {
          id: MODEL,
          object: "model",
          created: 0,
          owned_by: "relay",
        },
      ],
    });
  }


  // 5. Chat

  if (request.method === "POST" && isChatPath) {
    let body;


    // Lecture du JSON envoyé par IntelliJ

    try {
      body = await request.json();
    } catch {
      return apiError(
        "Invalid JSON body",
        400,
        "invalid_request_error",
      );
    }


    // Validation minimale

    if (!Array.isArray(body.messages)) {
      return apiError(
        "The 'messages' field is required",
        400,
        "invalid_request_error",
      );
    }


    let upstreamResponse;


    // 6. Appel vers OpenAI

    try {
      upstreamResponse = await fetch(
        OPENAI_CHAT_URL,
        {
          method: "POST",

          headers: {
            authorization: `Bearer ${openAiKey}`,
            "content-type": "application/json",
          },

          body: JSON.stringify({
            ...body,

            // On impose le modèle côté serveur
            model: MODEL,

            // Pas de stockage de la conversation
            store: false,
          }),
        },
      );
    } catch (error) {
      console.error(
        "Unable to contact OpenAI:",
        error,
      );

      return apiError(
        "Unable to contact OpenAI",
        502,
        "server_error",
      );
    }


    const contentType =
      upstreamResponse.headers.get("content-type") ??
      "application/json";


    // 7. Cas streaming demandé par IntelliJ

    if (body.stream === true) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,

        headers: {
          "content-type": contentType,
          "cache-control": "no-store",
        },
      });
    }


    // 8. Cas réponse classique non streamée

    const responseText =
      await upstreamResponse.text();

    return new Response(responseText, {
      status: upstreamResponse.status,

      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
      },
    });
  }


  // 9. Route inconnue

  return apiError(
    "Route not found",
    404,
    "invalid_request_error",
  );
}


// 10. Routes publiques de la Function

export const config = {
  path: [
    "/models",
    "/chat/completions",

    "/v1/models",
    "/v1/chat/completions",
  ],
};