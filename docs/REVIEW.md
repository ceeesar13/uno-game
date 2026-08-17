# Revisión final del proyecto: producto, UX y evolución

## Recomendación final

Consolidar el proyecto como **una mesa de cartas para una persona que se siente social**: acceso inmediato, sin cuenta, anuncios, monedas ni conexión, con rivales expresivos cuyas decisiones sean tácticamente legibles y honestas.

La prioridad no es sumar modos ni conversación genérica. Primero debe cerrarse la integridad de las reglas, la accesibilidad y la experiencia móvil. Después, el producto debe profundizar su ventaja real: **rivales que el jugador puede aprender a leer y dominar**.

**Secuencia recomendada:**

1. Fundaciones de reglas, accesibilidad, claridad y móvil.
2. Personalidad táctica observable de los rivales.
3. Resumen, historial y evidencia de juego justo.
4. Desafío asíncrono compartible sin backend.
5. Variantes pocas, claras y validadas.

---

## Estado de implementación (actualización — 2026-08-17)

Esta sección registra lo construido en la sesión de implementación. **Regla de
honestidad:** se marca como hecho solo lo verificable por código o por prueba en
navegador. Los umbrales que exigen **5–8 sesiones de usabilidad con personas**
(reconocimiento táctico, confianza en justicia, utilidad del resumen, lectura de
estado por participantes) **no se pueden cerrar en una sesión de desarrollo** y
quedan marcados como *pendiente de validación con usuarios*.

| Fase | Ingeniería | Validación humana |
|---|---|---|
| 1. Fundaciones | ✅ Completa | Pendiente: lectura de estado (6/8), zoom 200 % observado |
| 2. Personalidad táctica | ✅ Señales + telemetría local | Pendiente: reconocimiento (5/8) |
| 3. Resumen y justicia | ✅ Semilla, historial, replay, resumen | Pendiente: utilidad del resumen (5/8) |
| 4. Desafío compartible | ✅ URL con semilla+config, round-trip verificado | Pendiente: flujo compartir→jugar (6/8) |
| 5. Variantes | ✅ Modo rápido + 3 presets de reglas | Pendiente: uso/comprensión en validación |

**Construido y verificado (código + navegador):**

- Motor puro extraído a `engine.js` (módulo ES, sin DOM); UI en `game.js`.
- **PRNG sembrado** transportado en el estado ⇒ mismo `seed` + mismas decisiones
  producen el mismo estado final. `test/engine.test.js` (15 tests, `node --test`)
  lo prueba, incluido el *replay* del historial.
- Historial de eventos legible + región `aria-live` que anuncia turno, jugada,
  robo, penalización, cambio de color y resultado.
- Resumen de tres momentos derivado del historial (sin inventar motivaciones).
- Desafío por URL (semilla + bots + reglas); apertura idéntica entre cargas.
- Modo rápido (1 clic, ritmo abreviado) y reglas de casa: clásico, robar hasta
  jugar, acumular +2/+4 (con flujo de "acumular o robar N").
- Señales tácticas por bot (estilo legible, aviso de "¡UNO!") y telemetría local.
- Móvil verificado a 320 px con 3 bots y mano de 20 cartas: **sin desborde**
  horizontal (grid `minmax(0,1fr)`, solape dinámico y strip con scroll de reserva);
  `100dvh`, media query de landscape, cabeceras de bot apiladas sin colisión.
- Contraste: índices de esquina toman el color de la carta (no blanco sobre
  blanco); `--muted` aclarado. *Auditoría formal WCAG AA aún pendiente.*
- Correcciones técnicas: timers de CPU cancelables al reiniciar; sin `innerHTML`
  para nombres; color de comodín limpiado al reciclar el descarte; README.

---

## Resumen ejecutivo

### Estado actual

El producto está en una etapa de **MVP avanzado / beta de portfolio**. La implementación en HTML, CSS y JavaScript vanilla mantiene una ventaja importante: inicia de inmediato, no depende de un proceso de compilación y puede funcionar sin backend.

La experiencia ya ofrece:

- partidas contra 1–3 CPU;
- rivales identificables —Laura, Santiago y Camila— con estilos tácticos, insignias, turnos visibles y reacciones;
- dirección de arte propia, ritmo de mesa y señales claras de actividad;
- separación valiosa entre lógica de juego y presentación, aunque `game.js` todavía concentra demasiadas responsabilidades;
- bases parciales de accesibilidad, como `focus-visible`, `prefers-reduced-motion` y algunos anuncios en vivo.

Andrés está reservado como una personalidad adicional y la propuesta de chat todavía está incompleta. Ninguno debe presentarse como capacidad terminada. La mesa mantiene un máximo de 3 CPU simultáneos.

### Diagnóstico

| Área | Evaluación | Decisión |
|---|---|---|
| Producto | La personalidad de los rivales ya diferencia la experiencia. | Convertirla en información táctica consistente, no solo ambientación. |
| Reglas | Existen rutas que pueden permitir acciones humanas ilegales o ambiguas. | Bloquearlas antes de ampliar contenido. |
| Accesibilidad | La experiencia sigue dependiendo demasiado de mouse/touch y señales visuales. | Diseñar teclado, lector de pantalla, foco y contraste como requisitos funcionales. |
| Responsive | La mesa con 3 CPU y manos grandes es frágil en pantallas pequeñas. | Diseñar y probar explícitamente el caso más exigente. |
| Portfolio | La arquitectura y el cuidado visual son defendibles, pero faltan pruebas y comunicación técnica. | Documentar decisiones y cubrir el motor con tests. |

---

## Qué debe corregirse primero

### Prioridad crítica: integridad del juego

- [x] **Validar el +4 jugado por la persona.** La interfaz debe impedirlo cuando exista una carta del color activo en la mano, aplicar una consecuencia coherente y explicar por qué la acción no es válida.
- [x] **Restringir la jugada posterior al robo.** Si la carta robada puede jugarse, solo esa carta debe quedar habilitada; las cartas previas de la mano permanecen bloqueadas durante esa decisión.
- [x] Hacer inequívocos todos los estados deshabilitados mediante estilo, semántica y ausencia de interacción; no depender solo de opacidad o color.
- [x] Incorporar un historial de eventos que explique robo, descarte, cambio de color, reversa, salto, penalización y transición de turno.

**Criterio de salida:** ninguna entrada por mouse, tacto o teclado permite saltarse las mismas reglas que aplica el motor.

### Prioridad alta: acceso universal

- [x] Convertir cada carta interactiva en un control operable con teclado, con nombre accesible como “7 rojo” o “comodín +4”.
- [x] Definir orden de foco, activación con `Enter`/`Space` y una forma eficiente de recorrer manos grandes.
- [x] Anunciar turno, carta superior, color activo, robo, penalizaciones y resultado mediante regiones en vivo sin repetir mensajes.
- [x] Aplicar semántica real de diálogo a reglas, selección de color y resultados: foco inicial, contención de foco, cierre con `Escape` cuando corresponda y retorno al control invocador.
- [~] Verificar contraste de texto, insignias, estados de foco, cartas habilitadas/deshabilitadas y mensajes sobre todos los fondos. *(Índices de esquina y `--muted` corregidos; auditoría formal WCAG AA pendiente.)*
- [x] Mantener `prefers-reduced-motion` y asegurar que ninguna información dependa de una animación.

Como referencia de diseño inclusivo, Mattel documenta símbolos de color en sus juegos para mejorar la identificación sin depender únicamente del color: [Preguntas frecuentes de accesibilidad para daltonismo de Mattel Games](https://shop.mattel.com/pages/mattel-games-colorblind-accessibility-faqs).

### Prioridad alta: móvil con 3 CPU

- [x] Diseñar explícitamente la mesa de 3 CPU en anchos de 320–430 px y en orientación horizontal de poca altura.
- [~] Evitar que manos de 15–20 cartas desborden el viewport; adaptar solape, escala o navegación sin reducir el objetivo táctil por debajo de 44 × 44 px. *(Desborde eliminado con solape dinámico + strip con scroll; el objetivo de 44 px en manos de 20 cartas sigue siendo un compromiso a validar.)*
- [x] Usar `100dvh` con fallback y reservar espacio para barras dinámicas del navegador.
- [x] Mantener visibles, sin superposición, el turno actual, la carta superior, el color activo y la acción principal.
- [ ] Probar zoom del navegador al 200 % sin pérdida de contenido ni controles. *(Pendiente de observación manual.)*

---

## Tesis de producto y diferenciación

### Tesis

El producto debe prometer: **“una partida rápida en una mesa que se siente acompañada, contra rivales honestos que se pueden observar, comprender y superar”**.

La ventaja durable no es tener más diálogos, más modos o bots que aparenten inteligencia. Es construir rivales con:

1. patrones tácticos coherentes;
2. señales visibles que permitan anticiparlos;
3. decisiones explicables después de la partida;
4. variación suficiente para que dominarlos requiera aprendizaje;
5. reglas simétricas y evidencia reproducible de juego justo.

La expresión debe reforzar la táctica. Una reacción que no ayuda a entender intención, riesgo o estilo es ambientación; puede ser agradable, pero no constituye una ventaja competitiva.

### Evidencia competitiva e inferencia estratégica

| Tipo | Observación | Implicación |
|---|---|---|
| **Evidencia** | [UNO! Mobile](https://www.letsplayuno.com/support/modes.html) comunica varios modos, reglas especiales y juego social. | Competir por amplitud de modos exigiría una inversión alta y no aprovecha la fortaleza actual. |
| **Evidencia** | [UNO de Ubisoft](https://store.ubisoft.com/us/uno-tm-/640996a5aabb475b7707942d.html?lang=en_US) ofrece juego digital con modos y contenido temático. | La producción audiovisual y el catálogo no son un terreno razonable para un proyecto pequeño. |
| **Evidencia** | [Plato](https://platoapp.com/en) agrupa múltiples juegos sociales y pone el contacto entre personas en el centro. | La competencia por red social depende de escala, comunidad y moderación. |
| **Evidencia** | Mattel mantiene una iniciativa específica para distinguir colores mediante símbolos: [accesibilidad para daltonismo](https://shop.mattel.com/pages/mattel-games-colorblind-accessibility-faqs). | La accesibilidad visual es una expectativa de producto, no un detalle opcional. |
| **Inferencia estratégica** | El proyecto ya tiene tres rivales reconocibles y una arquitectura estática de acceso inmediato. | Profundizar rivales tácticamente legibles y juego sin fricción ofrece una posición más defendible que imitar catálogos o redes sociales. |

Estas fuentes describen capacidades y posicionamiento público. **No demuestran manipulación de partidas, emparejamiento sesgado ni prácticas ocultas de los competidores**; este documento no realiza esas afirmaciones.

---

## Funciones con mayor valor

### 1. Perfiles tácticos de rivales

Cada rival debe exponer una identidad jugable, no solo una personalidad escrita.

| Rival | Promesa de lectura | Evidencia que debe mostrar el juego |
|---|---|---|
| Laura | Cercana y energética; estilo `easy`, amigable y de baja presión táctica. | El código elige cartas con puntuación aleatoria y poca estrategia; sus reacciones son cálidas e impulsivas. La faceta cautelosa todavía requiere validación o implementación explícita. |
| Santiago | Competitivo y seguro; estilo `aggressive` y dificultad alta por presión directa. | La estrategia prioriza `+2`, `+4`, salto y reversa; sus reacciones refuerzan un carácter competitivo. |
| Camila | Sobria y calculadora; estilo `expert`. | La estrategia reserva comodines, conserva cartas especiales y eleva su prioridad cuando el siguiente jugador está cerca de ganar. |

Las etiquetas exactas deben validarse contra el comportamiento real. Si una descripción no coincide con la estrategia implementada, debe corregirse el texto o la estrategia.

### 2. Resumen de tres momentos al terminar

Mostrar solo tres hechos relevantes:

- la decisión que más cambió la probabilidad de ganar;
- el patrón de un rival que el jugador pudo haber leído;
- una alternativa concreta para la próxima partida.

El resumen debe derivarse del historial determinista, no inventar motivaciones. Es preferible una explicación breve y verificable a comentarios generativos difíciles de auditar.

### 3. Semilla, historial de acciones y repetición

- Generar cada partida desde una semilla.
- Registrar acciones, decisiones y resultados en un formato versionado.
- Permitir reproducir la secuencia y comprobar que el mismo historial produce el mismo estado final.
- Exponer la semilla y el historial como evidencia de justicia, con controles de privacidad apropiados.

Esto mejora confianza, depuración, pruebas automatizadas y contenido compartible con una sola inversión técnica.

### 4. Desafío asíncrono por URL o código

Compartir semilla, configuración y objetivo para que otra persona juegue el mismo desafío sin cuenta ni backend. El resultado puede compararse localmente o mediante un texto/código exportable.

Este mecanismo conserva la promesa de acceso instantáneo y añade una capa social sin introducir sincronización, moderación ni infraestructura de multiplayer.

### 5. Modo realmente rápido

Debe cambiar la duración real, no solo el nombre:

- una sola ronda;
- animaciones abreviadas sin perder información;
- menos pausas entre turnos;
- objetivo de finalización medible;
- acceso en un clic desde el inicio.

### 6. Reglas de casa acotadas

Ofrecer pocos presets, con una explicación previa y visible. Cada preset debe indicar qué cambia respecto de la regla base y cómo afecta duración o dificultad. Evitar un configurador exhaustivo antes de validar demanda.

---

## Alcance diferido de forma explícita

No priorizar en esta etapa:

- multiplayer en línea en tiempo real;
- cuentas, perfiles persistentes o recuperación en servidor;
- chat libre o voz entre personas;
- rankings globales;
- monedas, energía, recompensas diarias o anuncios;
- diálogo generado por LLM;
- catálogos amplios de cosméticos, contenido descargable o temas;
- incorporar a Andrés a la selección de personalidades hasta que tenga estrategia, señales y accesibilidad completas, sin elevar el límite de 3 CPU simultáneos.

Estas funciones añaden infraestructura, seguridad, moderación o producción continua sin fortalecer primero el núcleo diferencial. La síntesis de voz pregrabada puede evaluarse como ambientación futura; Whisper, WebLLM y servicios de conversación no se justifican para la siguiente etapa.

---

## Roadmap recomendado

| Fase | Objetivo | Entregables mínimos | Condición para avanzar |
|---|---|---|---|
| 1. Fundaciones | Partida correcta, accesible y clara. | Validación humana de +4; restricción post-robo; teclado/lector; diálogos; contraste; estados deshabilitados; historial; mesa móvil de 3 CPU; tests del motor. | Cero bloqueos críticos en pruebas y métricas de tarea alcanzadas. |
| 2. Personalidad táctica | Rivales que se pueden aprender a leer. | Perfiles coherentes, señales de intención, telemetría local y ajuste de estrategias. | La mayoría de participantes distingue al menos dos rivales por su conducta. |
| 3. Resumen y justicia | Convertir cada partida en aprendizaje verificable. | Resumen de tres momentos, semilla, historial versionado y replay determinista. | Repetición estable y explicaciones comprendidas sin asistencia. |
| 4. Desafío compartible | Añadir vínculo social sin backend. | URL/código con semilla, preset y objetivo; importación y exportación local. | Flujo compartir→jugar completado sin cuenta ni explicación externa. |
| 5. Variantes seleccionadas | Aumentar rejugabilidad sin diluir el núcleo. | Modo rápido y 2–3 presets de reglas de casa. | Cada variante demuestra uso y comprensión en validación. |

---

## Métricas de aceptación

### Fundaciones

| Métrica | Umbral de aceptación |
|---|---|
| Acciones ilegales ejecutadas por cualquier entrada | 0 en la suite de reglas y en sesiones observadas. |
| Jugada posterior al robo | 100 % de los intentos limita la acción a la carta recién robada. |
| Finalización por teclado | 100 % de los flujos críticos sin mouse: iniciar, jugar, robar, elegir color, abrir/cerrar ayuda y reiniciar. |
| Lectura de estado | Al menos 6 de 8 participantes identifican correctamente turno, color activo y siguiente acción sin ayuda. |
| Contraste | Cumplimiento WCAG AA para texto, controles y estados esenciales. |
| Mesa móvil con 3 CPU | Sin solapamiento crítico ni pérdida de acciones a 320 px de ancho, 200 % de zoom y landscape de baja altura. |
| Objetivos táctiles | Controles esenciales de al menos 44 × 44 CSS px. |
| Historial | 100 % de las transiciones de estado relevantes genera un evento comprensible y ordenado. |

### Diferenciación

| Métrica | Umbral inicial |
|---|---|
| Reconocimiento táctico | Al menos 5 de 8 participantes asocia correctamente dos rivales con su patrón después de dos partidas. |
| Confianza en justicia | Al menos 6 de 8 califica la partida con 4/5 o más en “las reglas se aplicaron de forma justa”. |
| Utilidad del resumen | Al menos 5 de 8 identifica una decisión propia que cambiaría en la siguiente partida. |
| Repetibilidad | Misma versión + semilla + historial produce el mismo estado final en el 100 % de pruebas automatizadas. |
| Velocidad | Mediana de menos de 10 s desde carga hasta primera decisión y menos de 6 min para el modo rápido. |
| Desafío compartible | Al menos 6 de 8 completa compartir→abrir→jugar sin cuenta ni ayuda del moderador. |

---

## Plan de validación

Realizar **5–8 sesiones de usabilidad** antes de ampliar el alcance. Incluir al menos una persona que use principalmente teclado, una con baja visión o deficiencia de percepción de color cuando sea posible, y participantes con distinta familiaridad con UNO.

### Guion por sesión

1. Iniciar una partida con 3 CPU en móvil o viewport equivalente.
2. Jugar hasta encontrar una oportunidad de robo y una decisión posterior al robo.
3. Intentar deliberadamente una acción ilegal de +4 y explicar el resultado.
4. Completar un flujo crítico solo con teclado.
5. Abrir y cerrar cada diálogo; comprobar ubicación y retorno del foco.
6. Consultar el historial para explicar los últimos tres eventos.
7. Jugar una segunda partida y describir las diferencias tácticas entre rivales.
8. Revisar el resumen final y, cuando exista, compartir un desafío.

### Evidencia a registrar

- éxito o fallo por tarea, tiempo y cantidad de ayudas;
- errores de regla y puntos de confusión;
- pérdida de foco, anuncios ausentes o redundantes;
- desbordes, toques fallidos y contenido oculto;
- frases usadas por participantes para describir a cada rival;
- puntuación de confianza en justicia y utilidad del resumen;
- problemas diferenciados por severidad: bloqueante, importante o mejora.

Una sesión no valida por sí sola una solución. Los umbrales anteriores deben evaluarse sobre el conjunto y complementarse con tests automatizados de reglas, replay y accesibilidad estática.

---

## Calidad técnica y presentación de portfolio

Conservar y hacer visible la arquitectura sin dependencias ni build. Las mejoras más rentables son:

- cubrir `createDeck`, validación de jugadas, efectos, robo, reversa, reshuffle, +4 y transición post-robo con tests deterministas;
- separar gradualmente motor, estrategias, UI y bootstrap en módulos ES, sin introducir un framework por defecto;
- cancelar o centralizar timers de CPU para evitar turnos pendientes al reiniciar;
- limpiar el color elegido de comodines al reciclar el descarte;
- evitar `innerHTML` para contenido que pueda incorporar datos de usuario;
- documentar tipos de carta y estado con JSDoc;
- crear un README con demo, decisiones de arquitectura, instrucciones de ejecución y pruebas;
- añadir metadatos de presentación y un aviso claro de proyecto no afiliado a Mattel; evaluar nombre propio antes de difusión pública.

La separación técnica solo aporta valor si protege las reglas y acelera cambios verificables. No conviene migrar a un framework como sustituto de tests, accesibilidad o diseño de estado.

---

## Checklist de cierre de la siguiente versión

- [x] Las reglas críticas tienen tests y no difieren entre CPU y persona.
- [x] La partida completa es operable por teclado y comprensible con lector de pantalla.
- [x] Los diálogos gestionan foco de forma predecible.
- [~] Colores, símbolos y estados cumplen contraste y no dependen solo del color. *(Corregido; auditoría formal AA pendiente.)*
- [~] La mesa de 3 CPU funciona en móvil, landscape y zoom al 200 %. *(Móvil y landscape verificados; zoom 200 % pendiente.)*
- [x] El historial permite explicar cada transición relevante.
- [x] Las descripciones tácticas coinciden con el comportamiento medido de cada rival.
- [x] El roadmap no incluye funciones diferidas como compromisos de corto plazo.
- [ ] Se completaron 5–8 sesiones y se documentaron resultados contra los umbrales. *(Requiere personas; no se puede cerrar en desarrollo.)*

---

## Alcance y naturaleza de esta revisión

Esta revisión consolida evidencia verificada del producto actual con inferencias estratégicas explícitamente identificadas. Las observaciones competitivas se limitan a información pública de las fuentes enlazadas. Las decisiones de posicionamiento, secuencia y alcance son recomendaciones que deben validarse con usuarios y datos del producto.
