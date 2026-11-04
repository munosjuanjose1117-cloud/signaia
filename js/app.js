import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { classify, toFeatures } from "./classifier.js";
import { initLookup, renderSignDetails } from "./lookup.js";
import { loadSamples, mergeSamples, saveSamples, serializeSamples } from "./samples.js";
import { SIGNS } from "./signs.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// La cámara entrega la imagen sin voltear y MediaPipe nombra bien la mano en ese caso
// (comprobado con los GIF de referencia, donde se firma con la mano derecha).
const HAND_NAMES = { Left: "Mano izquierda", Right: "Mano derecha" };

const SAMPLES_PER_RECORDING = 30;
const RECORDING_COUNTDOWN_MS = 3000;
const SAMPLE_INTERVAL_MS = 100;
const MIN_SIGNS_TO_RECOGNIZE = 2;

// Una seña solo se muestra si aparece en la mayoría de los últimos cuadros, para evitar parpadeos.
const HISTORY_SIZE = 10;
const STABLE_FRAMES = 7;

const CAMERA_ERRORS = {
  NotAllowedError: "Debes permitir el uso de la cámara en el navegador.",
  NotFoundError: "No se encontró ninguna cámara.",
  NotReadableError: "La cámara está siendo usada por otra aplicación.",
};

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const placeholder = document.getElementById("placeholder");
const toggle = document.getElementById("toggle");
const statusText = document.getElementById("status");
const handCount = document.getElementById("handCount");
const fps = document.getElementById("fps");
const handsList = document.getElementById("hands");
const resultName = document.getElementById("resultName");
const resultDetail = document.getElementById("resultDetail");
const explainButton = document.getElementById("explain");
const explanation = document.getElementById("explanation");
const explanationTitle = document.getElementById("explanationTitle");
const explanationText = document.getElementById("explanationText");
const practiceButton = document.getElementById("practiceButton");
const practiceScore = document.getElementById("practiceScore");
const practiceTarget = document.getElementById("practiceTarget");
const practiceFeedback = document.getElementById("practiceFeedback");
const signsList = document.getElementById("signs");
const exportButton = document.getElementById("exportSamples");
const importInput = document.getElementById("importSamples");

const ctx = overlay.getContext("2d");
const drawing = new DrawingUtils(ctx);

let landmarker = null;
let stream = null;
let lastVideoTime = -1;
let frames = 0;
let fpsStart = 0;
let samples = loadSamples();
let recording = null;
let history = [];
let currentPrediction = null;
let explaining = false;
let practice = null;
let lastTargetId = null;
let correctCount = 0;
let attemptCount = 0;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

async function createLandmarker(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

async function loadModel() {
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
      landmarker = await createLandmarker(vision, "GPU");
    } catch {
      landmarker = await createLandmarker(vision, "CPU");
    }
    toggle.disabled = false;
    setStatus("Modelo listo. Enciende la cámara.");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo cargar el modelo. Revisa tu conexión a internet.", true);
  }
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
  } catch (error) {
    console.error(error);
    setStatus(CAMERA_ERRORS[error.name] ?? "No se pudo abrir la cámara.", true);
    return;
  }

  video.srcObject = stream;
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  placeholder.hidden = true;
  toggle.textContent = "Apagar cámara";
  setStatus("Muestra una o dos manos a la cámara.");
  fpsStart = performance.now();
  frames = 0;
  renderSigns();
  requestAnimationFrame(detect);
}

function stopCamera() {
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  lastVideoTime = -1;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  placeholder.hidden = false;
  toggle.textContent = "Encender cámara";
  handCount.textContent = "0";
  fps.textContent = "0";
  handsList.replaceChildren();
  recording = null;
  history = [];
  endPractice();
  setStatus("Cámara apagada.");
  showIdleResult();
  renderSigns();
}

function trainedSigns() {
  return SIGNS.filter((sign) => samples[sign.id].length > 0).length;
}

function showResult(name, detail, prediction = null) {
  resultName.textContent = name;
  resultDetail.textContent = detail;
  currentPrediction = prediction;
  explainButton.disabled = explaining || prediction === null;
}

async function explainSign() {
  const { signId, confidence } = currentPrediction;
  explaining = true;
  explainButton.disabled = true;
  explainButton.textContent = "Consultando…";
  explanation.hidden = false;
  explanationTitle.textContent = SIGNS.find((sign) => sign.id === signId).name;
  explanationText.textContent = "";
  explanationText.classList.remove("error");

  try {
    const response = await fetch("api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signId, confidence }),
    });
    // Sin servidor (por ejemplo en GitHub Pages) la respuesta no es JSON.
    const data = await response.json().catch(() => {
      throw new Error("La explicación con IA solo funciona con el servidor de SignaIA.");
    });
    if (!response.ok) throw new Error(data.error);
    explanationText.textContent = data.explanation;
  } catch (error) {
    console.error(error);
    explanationText.textContent = error.message || "No se pudo obtener la explicación.";
    explanationText.classList.add("error");
  } finally {
    explaining = false;
    explainButton.textContent = "Explicar con IA";
    explainButton.disabled = currentPrediction === null;
  }
}

function showIdleResult() {
  if (trainedSigns() < MIN_SIGNS_TO_RECOGNIZE) {
    showResult("Sin ejemplos", "Graba ejemplos de al menos 2 señas.");
  } else {
    showResult("Listo", "Enciende la cámara y haz una seña.");
  }
}

function setPracticeFeedback(message, isSuccess = false) {
  practiceFeedback.textContent = message;
  practiceFeedback.classList.toggle("success", isSuccess);
}

function nextPracticeSign() {
  const options = SIGNS.filter(
    (sign) => samples[sign.id].length > 0 && sign.id !== lastTargetId,
  );
  const target = options[Math.floor(Math.random() * options.length)];

  lastTargetId = target.id;
  practice = { target, solved: false };
  attemptCount += 1;
  history = [];
  practiceScore.textContent = `Aciertos: ${correctCount} de ${attemptCount}`;
  renderSignDetails(practiceTarget, target);
  setPracticeFeedback("Haz esta seña frente a la cámara.");
  practiceButton.textContent = "Siguiente seña";
}

function endPractice() {
  practice = null;
  lastTargetId = null;
  practiceTarget.replaceChildren();
  practiceButton.textContent = "Empezar práctica";
  setPracticeFeedback("Enciende la cámara y graba ejemplos de al menos 2 señas.");
}

function updatePractice(signId) {
  if (signId === practice.target.id) {
    practice.solved = true;
    correctCount += 1;
    practiceScore.textContent = `Aciertos: ${correctCount} de ${attemptCount}`;
    setPracticeFeedback(`¡Muy bien! Hiciste "${practice.target.name}".`, true);
  } else {
    const detected = SIGNS.find((sign) => sign.id === signId).name;
    setPracticeFeedback(`Detecté "${detected}". Intenta de nuevo con "${practice.target.name}".`);
  }
}

function renderSigns() {
  practiceButton.disabled =
    !stream || recording !== null || trainedSigns() < MIN_SIGNS_TO_RECOGNIZE;
  signsList.replaceChildren(
    ...SIGNS.map((sign) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const count = document.createElement("span");
      const record = document.createElement("button");
      const clear = document.createElement("button");

      name.textContent = sign.movement ? `${sign.name} · con movimiento` : sign.name;
      count.className = "count";
      count.textContent = `${samples[sign.id].length} ejemplos`;
      record.type = "button";
      record.textContent = recording?.signId === sign.id ? "Grabando…" : "Grabar";
      record.disabled = !stream || recording !== null;
      record.addEventListener("click", () => startRecording(sign));
      clear.type = "button";
      clear.className = "secondary";
      clear.textContent = "Borrar";
      clear.disabled = recording !== null || samples[sign.id].length === 0;
      clear.addEventListener("click", () => clearSign(sign));

      item.append(name, count, record, clear);
      return item;
    }),
  );
}

function persistSamples() {
  if (!saveSamples(samples)) {
    setStatus("No se pudieron guardar los ejemplos. Expórtalos antes de cerrar la página.", true);
  }
}

function startRecording(sign) {
  recording = {
    signId: sign.id,
    name: sign.name,
    vectors: [],
    startAt: performance.now() + RECORDING_COUNTDOWN_MS,
    lastAt: 0,
  };
  history = [];
  renderSigns();
}

function clearSign(sign) {
  if (!window.confirm(`¿Borrar todos los ejemplos de "${sign.name}"?`)) return;
  samples = { ...samples, [sign.id]: [] };
  persistSamples();
  history = [];
  if (practice?.target.id === sign.id || trainedSigns() < MIN_SIGNS_TO_RECOGNIZE) endPractice();
  renderSigns();
  if (!stream) showIdleResult();
}

function updateRecording(result, now) {
  showResult("—", "Grabando ejemplos.");
  if (now < recording.startAt) {
    const seconds = Math.ceil((recording.startAt - now) / 1000);
    setStatus(`Prepara "${recording.name}". Empieza en ${seconds}…`);
    return;
  }
  const features = signingFeatures(result);
  if (!features) {
    setStatus("Grabación en pausa: no se ve ninguna mano.");
    return;
  }
  if (now - recording.lastAt < SAMPLE_INTERVAL_MS) return;

  recording.lastAt = now;
  recording.vectors.push(features);
  setStatus(`Grabando "${recording.name}": ${recording.vectors.length}/${SAMPLES_PER_RECORDING}`);

  if (recording.vectors.length === SAMPLES_PER_RECORDING) {
    const { signId, name, vectors } = recording;
    samples = { ...samples, [signId]: [...samples[signId], ...vectors] };
    recording = null;
    persistSamples();
    setStatus(`Ejemplos de "${name}" guardados.`);
    renderSigns();
  }
}

function updateRecognition(result) {
  if (trainedSigns() < MIN_SIGNS_TO_RECOGNIZE) {
    showIdleResult();
    return;
  }
  const features = signingFeatures(result);
  if (!features) {
    history = [];
    showResult("—", "No se ve ninguna mano.");
    return;
  }

  const prediction = classify(samples, features);
  history = [...history, prediction.recognized ? prediction.signId : null].slice(-HISTORY_SIZE);

  const stable = history.filter((signId) => signId === prediction.signId).length >= STABLE_FRAMES;
  const detail = `Coincidencia ${Math.round(prediction.confidence * 100)}% · distancia ${prediction.distance.toFixed(3)}`;
  if (prediction.recognized && stable) {
    showResult(SIGNS.find((sign) => sign.id === prediction.signId).name, detail, prediction);
    if (practice && !practice.solved) updatePractice(prediction.signId);
  } else {
    showResult("Seña no reconocida", detail);
  }
}

function exportSamples() {
  const url = URL.createObjectURL(
    new Blob([serializeSamples(samples)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "signaia-ejemplos.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importSamples(file) {
  try {
    samples = mergeSamples(samples, JSON.parse(await file.text()));
    persistSamples();
    setStatus(`Ejemplos importados de ${file.name}.`);
    history = [];
    renderSigns();
    if (!stream) showIdleResult();
  } catch (error) {
    console.error(error);
    setStatus(
      error.message === "Versión antigua"
        ? "El archivo es de una versión anterior de SignaIA. Hay que volver a grabar esos ejemplos."
        : "El archivo no tiene ejemplos válidos de SignaIA.",
      true,
    );
  }
}

// Se toma la mano más alta, porque la otra suele quedar quieta abajo y no hace la seña.
function signingHandIndex(result) {
  let best = -1;
  result.landmarks.forEach((landmarks, index) => {
    if (best < 0 || landmarks[0].y < result.landmarks[best][0].y) best = index;
  });
  return best;
}

function signingFeatures(result) {
  const index = signingHandIndex(result);
  if (index < 0) return null;
  return toFeatures(result.worldLandmarks[index], result.handedness[index][0].categoryName);
}

function renderResults(result) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  for (const landmarks of result.landmarks) {
    drawing.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: "#4f7cff",
      lineWidth: 3,
    });
    drawing.drawLandmarks(landmarks, { color: "#ffffff", radius: 3 });
  }

  handCount.textContent = String(result.landmarks.length);
  const signing = result.landmarks.length > 1 ? signingHandIndex(result) : -1;
  handsList.replaceChildren(
    ...result.handedness.map(([hand], index) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const score = document.createElement("span");
      name.textContent = HAND_NAMES[hand.categoryName] + (index === signing ? " · hace la seña" : "");
      score.textContent = `${Math.round(hand.score * 100)}%`;
      item.append(name, score);
      return item;
    }),
  );
}

function updateFps(now) {
  frames += 1;
  if (now - fpsStart >= 1000) {
    fps.textContent = String(Math.round((frames * 1000) / (now - fpsStart)));
    frames = 0;
    fpsStart = now;
  }
}

function detect(now) {
  if (!stream) return;
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    renderResults(result);
    if (recording) updateRecording(result, now);
    else updateRecognition(result);
    updateFps(now);
  }
  requestAnimationFrame(detect);
}

toggle.addEventListener("click", () => {
  if (stream) stopCamera();
  else startCamera();
});

practiceButton.addEventListener("click", nextPracticeSign);
explainButton.addEventListener("click", explainSign);
exportButton.addEventListener("click", exportSamples);
importInput.addEventListener("change", () => {
  if (importInput.files[0]) importSamples(importInput.files[0]);
  importInput.value = "";
});

// Quien abre la app por primera vez arranca con los ejemplos que grabó el grupo.
async function loadDefaultSamples() {
  if (trainedSigns() > 0) return;
  try {
    const response = await fetch("datos/ejemplos.json");
    if (!response.ok) return;
    samples = mergeSamples(samples, await response.json());
    renderSigns();
    if (!stream) showIdleResult();
  } catch (error) {
    console.error(error);
  }
}

initLookup();
renderSigns();
showIdleResult();
loadDefaultSamples();
loadModel();
