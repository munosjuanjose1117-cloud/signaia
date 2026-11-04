// Abecedario de LSC con los GIF de referencia. Falta que alguien que sepa LSC confirme cada
// letra y agregar guide desde una fuente verificada.
// Si cambias un id, los ejemplos ya grabados con ese id dejan de usarse.
// meaning y guide son lo único que la IA puede afirmar sobre cada seña.
// reference es la imagen o el video de la seña, por ejemplo "referencias/hola.mp4".
// movement marca las letras que en el GIF se ven con movimiento: la app solo compara la
// forma de la mano, así que con esas puede fallar.
const LETTERS = [
  ["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"], ["e", "E"], ["f", "F"], ["g", "G"],
  ["h", "H"], ["i", "I"], ["j", "J", true], ["k", "K"], ["l", "L"], ["m", "M"], ["n", "N"],
  ["enie", "Ñ", true], ["o", "O"], ["p", "P"], ["q", "Q"], ["r", "R"], ["s", "S", true],
  ["t", "T"], ["u", "U"], ["v", "V"], ["w", "W"], ["x", "X"], ["y", "Y"], ["z", "Z", true],
];

export const SIGNS = LETTERS.map(([id, letter, movement = false]) => ({
  id: `letra-${id}`,
  name: `Letra ${letter}`,
  meaning: `Letra ${letter} del alfabeto manual de LSC`,
  guide: null,
  reference: `referencias/letras/${id === "enie" ? "enie" : letter}.gif`,
  movement,
}));
