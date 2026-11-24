# Multiplica Aventura

Aplicación web estática, en español, para que un niño de 8 años practique las tablas del 1 al 10 como un juego.

## Qué incluye

- Dos modos de recorrido: **Guiado**, con progresión bloqueada, y **Libre**, para elegir cualquier nivel sin completar los anteriores.
- Tres etapas: descubrimiento, práctica individual y desafío combinado.
- Umbral de dominio del 80% para desbloquear el siguiente nivel.
- Repetición espaciada de operaciones débiles y repaso inteligente.
- En modo Libre, selección de una o varias tablas para repasar sin depender del progreso de los niveles.
- XP, estrellas, rachas, insignias, confeti y progreso visual.
- Plan flexible: todas las tablas de una vez o distribuidas entre 2 y 10 días.
- Resultados operación por operación al terminar cada desafío mixto.
- Respuestas configurables: opciones múltiples o ingreso manual.
- Tres dificultades: Tranquilo (70%), Normal (80%) y Experto (90%).
- Sonidos musicales, fuegos artificiales de acierto y celebración de nivel.
- Pantalla independiente de Ajustes, accesible desde la navegación principal.
- Explicaciones visuales que distinguen el número repetido de la cantidad de veces.
- Persistencia en `localStorage`, funcionamiento offline y diseño responsive.
- Sonido opcional y soporte para `prefers-reduced-motion`.

## Ejecutar localmente

No requiere compilación ni backend:

```bash
npx serve .
```

También se puede abrir `index.html` directamente, aunque el modo offline necesita un servidor local.

## Publicar en Vercel

1. Subir esta carpeta a un repositorio Git.
2. Importar el repositorio en Vercel.
3. Elegir **Other** como framework.
4. No configurar build command; usar `.` como output directory.
5. Desplegar.

También puede ejecutarse `vercel` desde esta carpeta si la CLI está instalada.

## Privacidad

No hay cuentas ni analítica. Nombre y progreso quedan guardados solo en el navegador del dispositivo.
