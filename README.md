# UNO — mesa para una persona que se siente acompañada

Un juego de cartas tipo UNO para jugar de inmediato contra 1–3 bots con
personalidad. HTML, CSS y JavaScript vanilla: **sin build, sin dependencias de
runtime y sin backend**. Abre `index.html` y se juega.

> Proyecto de portafolio, **no afiliado ni respaldado por Mattel**. "UNO" es una
> marca de sus respectivos titulares; aquí se usa solo con fines educativos y de
> demostración. Evaluar un nombre propio antes de cualquier difusión pública.

## Cómo ejecutar

Al usar módulos ES, el juego debe servirse por HTTP (no `file://`):

```bash
python serve.py        # servidor de previsualización sin caché en http://localhost:8420
# o cualquier estático, p. ej.:  npx serve .
```

En producción, GitHub Pages sirve los archivos directamente.

## Tests

El motor es puro y determinista; se prueba con el runner nativo de Node (sin
dependencias):

```bash
node --test
```

Cubre: baraja estándar (108 cartas), barajado sembrado, reparto determinista por
semilla, validación de jugadas, legalidad del +4, efectos (+2, salto, reversa),
reglas de casa (acumular, robar hasta jugar), terminación de partida y — lo más
importante — que **reproducir el historial de decisiones desde la misma semilla
regenera exactamente el mismo estado final** (garantía de juego justo).

## Arquitectura

Separación estricta entre reglas y presentación:

| Archivo | Responsabilidad |
|---|---|
| `engine.js` | Motor puro. Sin DOM. Reglas, estrategias de CPU, PRNG sembrado, historial y replay. Exporta funciones puras. |
| `game.js` | Capa de UI (módulo ES). Renderiza el estado, anima, anuncia por `aria-live`, y traduce la entrada del usuario en movimientos del motor. |
| `index.html` | Estructura y diálogos accesibles. |
| `style.css` | Sistema visual, responsive (móvil/landscape), y estados de foco/deshabilitado. |
| `test/engine.test.js` | Tests deterministas del motor. |

### Decisiones clave

- **Aleatoriedad sembrada y transportada en el estado.** Todo lo aleatorio
  (barajado, reciclaje del descarte, decisiones de la CPU) se deriva de un PRNG
  `mulberry32` cuyo estado viaja dentro del estado del juego. Misma semilla +
  misma secuencia de decisiones ⇒ mismo resultado. Esto habilita *replay*,
  depuración y **desafíos compartibles sin backend**.
- **Dos registros por partida.** `history` (eventos legibles, para el panel y el
  lector de pantalla) y `log` (decisiones canónicas, para el replay).
- **La persona y los bots se juzgan con la misma regla.** La legalidad de una
  jugada humana se evalúa contra `getValidPlays` del propio motor: nadie —humano
  o bot— puede saltarse una regla que el motor no permita.
- **Sin `innerHTML` para datos de usuario.** Los nombres se insertan como texto.
- **Timers de CPU centralizados y cancelables**, para que ningún turno pendiente
  se dispare sobre una partida recién reiniciada.

## Accesibilidad

- Cada carta es un control operable por teclado con nombre accesible ("Rojo 7",
  "comodín +4"), activable con `Enter`/`Space`.
- Región `aria-live` dedicada que anuncia turno, jugada, robo, penalización,
  cambio de color y resultado.
- Diálogos con `aria-modal`, foco inicial, contención de foco y retorno al
  control invocador; `Escape` cierra el historial (el selector de color es
  obligatorio y no se cierra con `Escape`).
- Respeta `prefers-reduced-motion`; ninguna información depende de una animación.
- Los estados legibles no dependen solo del color: símbolos, etiquetas de estilo
  de cada bot y avisos de "¡UNO!" visibles.

## Características

- 1–3 bots con personalidad y estilo táctico legible (impulsiva, agresivo,
  calculadora), con señales de intención observables.
- Historial de la partida y **resumen de tres momentos** derivado del historial
  (sin inventar motivaciones).
- **Desafío compartible por URL**: comparte semilla, configuración y reglas para
  que otra persona juegue exactamente la misma partida, sin cuenta ni backend.
- **Modo rápido** (1 clic, ritmo abreviado) y **reglas de casa** acotadas:
  clásico, robar hasta jugar, acumular +2/+4.

## Alcance diferido

Multiplayer en tiempo real, cuentas, chat libre, rankings, monedas/anuncios y
diálogo por LLM quedan explícitamente fuera de esta etapa. Ver `docs/REVIEW.md`
para la tesis de producto, el roadmap y las métricas de aceptación.
