const WRIST = 0;
const MIDDLE_KNUCKLE = 9;
const K = 5;
const MIN_CONFIDENCE = 0.6;

// Medido con los GIF y videos de referencia: con la misma persona la letra correcta quedó
// por debajo de 0.03 y con otra persona por debajo de 0.2. Ajustarlo con ejemplos reales.
const MAX_DISTANCE = 0.2;

export const FEATURE_LENGTH = 63;

const INDEX_KNUCKLE = 5;
const PINKY_KNUCKLE = 17;

// Refleja la mano derecha, centra la mano en la muñeca, la escala a un tamaño fijo y la gira
// para que la palma quede siempre igual. Así la seña se compara por la forma de los dedos y
// no por cómo está inclinada la mano, que cambia mucho de una persona a otra.
// Ojo: dos señas que solo se diferencien por la orientación de la mano se verían iguales.
export function toFeatures(worldLandmarks, handName) {
  const mirror = handName === "Right" ? -1 : 1;
  const points = worldLandmarks.map((point) => [mirror * point.x, point.y, point.z]);
  const wrist = points[WRIST];

  const up = sub(points[MIDDLE_KNUCKLE], wrist);
  const scale = length(up) || 1;
  const yAxis = normalize(up);
  const across = sub(points[PINKY_KNUCKLE], points[INDEX_KNUCKLE]);
  const xAxis = normalize(sub(across, yAxis.map((value) => value * dot(across, yAxis))));
  const zAxis = cross(xAxis, yAxis);

  return points.flatMap((point) => {
    const offset = sub(point, wrist);
    return [xAxis, yAxis, zAxis].map((axis) => round(dot(offset, axis) / scale));
  });
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a) {
  const size = length(a) || 1;
  return a.map((value) => value / size);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

export function classify(samples, features) {
  const neighbors = Object.entries(samples)
    .flatMap(([signId, vectors]) =>
      vectors.map((vector) => ({ signId, distance: distance(vector, features) })),
    )
    .sort((a, b) => a.distance - b.distance)
    .slice(0, K);

  if (neighbors.length === 0) return null;

  const votes = {};
  for (const neighbor of neighbors) {
    (votes[neighbor.signId] ??= []).push(neighbor.distance);
  }
  const [signId, distances] = Object.entries(votes).sort((a, b) => b[1].length - a[1].length)[0];
  const confidence = distances.length / neighbors.length;
  const meanDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;

  return {
    signId,
    confidence,
    distance: meanDistance,
    recognized: confidence >= MIN_CONFIDENCE && meanDistance <= MAX_DISTANCE,
  };
}
