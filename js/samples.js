import { FEATURE_LENGTH } from "./classifier.js";
import { SIGNS } from "./signs.js";

// Cambia cada vez que cambia la forma de calcular los puntos, porque los ejemplos viejos
// ya no se pueden comparar con los nuevos.
const FORMAT_VERSION = 2;
const STORAGE_KEY = `signaia.samples.v${FORMAT_VERSION}`;

export function emptySamples() {
  return Object.fromEntries(SIGNS.map((sign) => [sign.id, []]));
}

export function loadSamples() {
  const samples = emptySamples();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? mergeSamples(samples, stored) : samples;
  } catch {
    return samples;
  }
}

export function serializeSamples(samples) {
  return JSON.stringify({ version: FORMAT_VERSION, ...samples });
}

export function saveSamples(samples) {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSamples(samples));
    return true;
  } catch {
    return false;
  }
}

// Une ejemplos de otra persona. Lanza un error si el archivo no tiene el formato esperado.
export function mergeSamples(samples, incoming) {
  if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
    throw new Error("Formato inválido");
  }
  if (incoming.version !== FORMAT_VERSION) {
    throw new Error("Versión antigua");
  }

  const merged = { ...samples };
  for (const sign of SIGNS) {
    const vectors = incoming[sign.id] ?? [];
    if (!Array.isArray(vectors) || !vectors.every(isFeatureVector)) {
      throw new Error("Formato inválido");
    }
    merged[sign.id] = [...merged[sign.id], ...vectors];
  }
  return merged;
}

function isFeatureVector(vector) {
  return (
    Array.isArray(vector) &&
    vector.length === FEATURE_LENGTH &&
    vector.every((value) => Number.isFinite(value))
  );
}
