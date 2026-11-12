# Panel

Mi día, mi semana, mis tareas y mis fechas, en una app instalable en el celular.

- **Hoy**: hasta tres cosas para cerrar en el día y cómo estoy (energía y ánimo).
- **Semana**: mi semana tipo (bloques fijos) junto con las fechas y tareas de cada día.
- **Tareas**: pendientes por atrasadas, hoy, próximas y sin fecha.
- **Fechas**: entregas y plazos con los días que faltan.

Los datos se guardan **solo en el celular** (no hay servidor ni cuenta). Para respaldarlos o pasarlos a otro teléfono: Ajustes → Exportar / Importar respaldo.

## Desarrollo

- Probar en el PC: `node tools/serve.mjs` y abrir `http://localhost:5173` (agregar `?sw` para probar el modo sin internet).
- Antes de cada publicación hay que actualizar la lista de archivos sin internet, o los celulares se quedan con la versión vieja:
  `node "%USERPROFILE%/.claude/skills/hacer-instalable/scripts/make-pwa.mjs" sw .`
- Se publica en GitHub Pages desde la rama `main`. Este repositorio es público: **nunca** poner datos personales en el código.
