import { SIGNS } from "./signs.js";

const VIDEO_PATTERN = /\.(mp4|webm)$/i;

function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function createParagraph(text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

function createMedia(sign) {
  if (VIDEO_PATTERN.test(sign.reference)) {
    const media = document.createElement("video");
    media.src = sign.reference;
    media.controls = true;
    media.loop = true;
    media.muted = true;
    media.playsInline = true;
    media.className = "reference";
    return media;
  }
  const media = document.createElement("img");
  media.src = sign.reference;
  media.alt = `Referencia de la seña ${sign.name}`;
  media.className = "reference";
  return media;
}

export function renderSignDetails(container, sign) {
  const title = document.createElement("h3");
  title.textContent = sign.name;
  const parts = [title];

  if (sign.reference) parts.push(createMedia(sign));
  else parts.push(createParagraph("Aún no hay imagen o video de referencia verificado."));
  if (sign.movement) {
    parts.push(
      createParagraph("Esta letra lleva movimiento. La app solo compara la forma de la mano, así que puede fallar."),
    );
  }
  if (sign.meaning) parts.push(createParagraph(`Significado: ${sign.meaning}`));
  if (sign.guide) parts.push(createParagraph(`Cómo hacerla: ${sign.guide}`));

  container.replaceChildren(...parts);
}

export function initLookup() {
  const input = document.getElementById("lookupInput");
  const results = document.getElementById("lookupResults");
  const details = document.getElementById("lookupDetails");

  function renderResults() {
    const query = normalize(input.value);
    const matches = SIGNS.filter((sign) => normalize(sign.name).includes(query));

    if (matches.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No encontramos esa palabra en el catálogo.";
      results.replaceChildren(empty);
      return;
    }

    results.replaceChildren(
      ...matches.map((sign) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = sign.name;
        button.addEventListener("click", () => renderSignDetails(details, sign));
        item.append(button);
        return item;
      }),
    );
  }

  input.addEventListener("input", renderResults);
  renderResults();
}
