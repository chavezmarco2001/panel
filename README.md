# Panel

Mi día, mi semana, mis tareas y mis fechas, en una app instalable en el celular.

- **Hoy**: hasta tres cosas para cerrar en el día y cómo estoy (energía y ánimo).
- **Semana**: mi semana tipo (bloques fijos) junto con las fechas y tareas de cada día.
- **Tareas**: pendientes por atrasadas, hoy, próximas y sin fecha.
- **Fechas**: entregas y plazos con los días que faltan. Las marcadas como «hito de mi titulación» arman el camino en Avance.
- **Avance**: racha amable (los días de energía baja no la cortan y hay un comodín por semana), calendario de días, semana en números, energía y avance de 28 días, camino a la titulación y logros.
- **Modo foco**: temporizador de 15, 25 o 50 minutos con la pantalla encendida; los minutos se suman al avance.
- **Cierre del día**: marca lo hecho, elige hasta 3 cosas para mañana y cierra el día.
- **Atajos**: al mantener presionado el ícono aparecen «Anotar», «Cierre del día» y «Modo foco».

Los datos se guardan **solo en el celular** (no hay servidor ni cuenta). Para respaldarlos o pasarlos a otro teléfono: Ajustes → Exportar / Importar respaldo.

## Desarrollo

- Probar en el PC: `node tools/serve.mjs` y abrir `http://localhost:5173` (agregar `?sw` para probar el modo sin internet).
- Antes de cada publicación hay que actualizar la lista de archivos sin internet, o los celulares se quedan con la versión vieja:
  `node "%USERPROFILE%/.claude/skills/hacer-instalable/scripts/make-pwa.mjs" sw .`
- Se publica en GitHub Pages desde la rama `main`. Este repositorio es público: **nunca** poner datos personales en el código.
