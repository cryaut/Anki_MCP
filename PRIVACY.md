# Privacidad

El servidor MCP se ejecuta localmente. El código del proyecto no incluye telemetría, publicidad ni una cuenta del proyecto.

- Las acciones de Anki intercambian datos con AnkiConnect en 127.0.0.1:8765. El perfil activo puede contener mazos, preguntas y respuestas personales. Limita qué clientes pueden usar las herramientas y revisa el destino antes de guardar.
- Las vistas previas están en memoria y caducan. Los archivos HTML y TSV se guardan localmente hasta que los elimines. Incluyen las preguntas y la clave de respuestas. El HTML corrige en el navegador y mantiene tus selecciones solo durante la sesión de la página.
- Si compartes preguntas con un cliente MCP que usa un asistente en la nube, ese cliente puede recibir el texto y las respuestas de herramientas. Aplican la configuración y las condiciones de ese proveedor. La sincronización de Anki, si la activas, funciona por separado.
- Guarda las claves de AnkiConnect fuera del repositorio y mantén su acceso limitado al equipo local. Usa un perfil de demostración al hacer capturas públicas y excluye nombres de usuario, rutas personales y materiales que no tengas permiso para publicar.
