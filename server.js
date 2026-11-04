// Servidor local de desarrollo, sin dependencias. Uso: node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // Sin .env la app funciona igual; solo se desactivan las explicaciones con IA.
}

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const NIM_BASE_URL = process.env.NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NIM_MODEL = process.env.NIM_MODEL || "mistralai/mistral-large-2-instruct";
const NIM_TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// La IA solo recibe lo que está verificado en el catálogo, para que no invente cómo se hace una seña.
const SYSTEM_PROMPT = `Eres el tutor de SignaIA, una app para aprender Lengua de Señas Colombiana (LSC).
Responde en español, con tono amable y en máximo 4 oraciones.
Usa únicamente la información del catálogo que recibes sobre el significado y la forma de la seña.
Nunca describas configuraciones de mano ni movimientos que no estén en el catálogo, ni inventes datos sobre LSC.
Si el catálogo no trae información, dilo y recomienda consultar una fuente verificada, como el INSOR, o a una persona usuaria de LSC.
Puedes dar consejos generales de práctica, como revisar la luz, el encuadre y repetir la seña con calma.`;

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Cuerpo demasiado grande"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function buildUserPrompt(sign, confidence) {
  return `Seña reconocida por la cámara: ${sign.name}
Coincidencia con los ejemplos grabados: ${Math.round(confidence * 100)}%
Significado según el catálogo: ${sign.meaning ?? "sin información verificada"}
Forma de hacerla según el catálogo: ${sign.guide ?? "sin información verificada"}

Explícale al estudiante qué significa la seña y dale retroalimentación según la coincidencia.`;
}

async function handleFeedback(req, res) {
  if (!process.env.NVIDIA_API_KEY) {
    sendJson(res, 503, { error: "Falta configurar NVIDIA_API_KEY en el archivo .env." });
    return;
  }

  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Solicitud inválida." });
    return;
  }

  const { SIGNS } = await import("./js/signs.js");
  const sign = SIGNS.find((candidate) => candidate.id === input?.signId);
  const confidence = input?.confidence;
  if (!sign || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    sendJson(res, 400, { error: "Solicitud inválida." });
    return;
  }

  try {
    const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(sign, confidence) },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(NIM_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`NVIDIA NIM respondió ${response.status}: ${await response.text()}`);
      sendJson(res, 502, { error: `NVIDIA NIM respondió con error ${response.status}.` });
      return;
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content?.trim();
    if (!explanation) {
      sendJson(res, 502, { error: "NVIDIA NIM no devolvió una explicación." });
      return;
    }
    sendJson(res, 200, { explanation });
  } catch (error) {
    console.error(error);
    sendJson(res, 502, { error: "No se pudo contactar a NVIDIA NIM." });
  }
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");

    if (pathname === "/api/feedback") {
      if (req.method === "POST") handleFeedback(req, res);
      else sendJson(res, 405, { error: "Método no permitido." });
      return;
    }

    const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
    const file = path.resolve(ROOT, relative);

    if (!file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)]) {
      res.writeHead(404).end("No encontrado");
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end("No encontrado");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] }).end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`SignaIA en http://localhost:${PORT}`);
  });
