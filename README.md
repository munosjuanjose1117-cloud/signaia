# SignaIA

Asistente de aprendizaje de Lengua de Señas Colombiana (LSC).

## Cómo ejecutarlo

Necesitas Node.js e internet (MediaPipe se descarga al abrir la página).

```bash
node server.js
```

Abre http://localhost:5173 y permite el uso de la cámara. Fuera de `localhost`, el navegador solo permite la cámara con HTTPS.

También se puede publicar con GitHub Pages (`Settings` → `Pages` → `Deploy from a branch` → `main`). Ahí funciona todo menos el botón "Explicar con IA", que necesita el servidor.

## Explicaciones con IA

Copia `.env.example` como `.env`, pega tu clave de NVIDIA y reinicia el servidor. La clave solo vive en el servidor: nunca la subas al repo. Por ahora la conexión con NVIDIA NIM está en `server.js`; al publicar se pasa a Laravel.

## Señas y ejemplos

Las señas se definen en `js/signs.js`. Sus imágenes y videos (PNG, JPG, WebP, GIF, MP4 o WebM) van en la carpeta `referencias/`.

El catálogo tiene las 27 letras del abecedario. La J, Ñ, S y Z se ven con movimiento en el GIF y la app solo compara la forma de la mano, así que con ellas puede fallar; también puede confundir letras parecidas. Para el demo conviene usar letras quietas y distintas entre sí, como A, B, C, D, L, V e Y. Falta que alguien que sepa LSC confirme cada letra. Los GIF son del repositorio `sign-language-gifs` del proyecto "Guantes traductores de lengua de señas colombiana" (Jorge Andrés Rua Vera, Joseph Daniel Pacheco Gutiérrez y Julianna Sophia Schutmaat Carrascal, Corporación Universitaria Reformada), que pide dar crédito al usarlos. Los ejemplos se guardan en el navegador; cada persona puede exportarlos a un archivo JSON y otra importarlos para unirlos. Conviene que graben varias personas, porque la app reconoce mucho mejor a quien grabó los ejemplos. Si cambia la forma de calcular los puntos, los ejemplos viejos se descartan y hay que volver a grabar.

## Estado

- [x] Detección de manos con MediaPipe
- [x] Grabación de ejemplos por seña
- [x] Reconocimiento de señas estáticas con una mano (nombres de prueba; faltan las señas de LSC verificadas)
- [x] Modo práctica y búsqueda de palabras (faltan las imágenes y videos verificados)
- [x] Explicaciones con NVIDIA NIM desde el servidor local
- [ ] Pasar la conexión con NVIDIA NIM a Laravel
- [ ] Publicación en el VPS
