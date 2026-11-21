# Anki SAT MCP

Un servidor MCP local para convertir preguntas de SAT Reading & Writing en **cuestionarios interactivos** y tarjetas de repaso. En un cuestionario puedes marcar una opción por pregunta, navegar por el lote, entregar, ver tu puntuación y revisar los errores. El ejemplo incluido tiene diez preguntas originales en inglés.

## Pruébalo en un navegador

Necesitas Node.js 22 o posterior y npm. Desde la carpeta del repositorio, ejecuta:

```powershell
npm ci
npm run build
npm run quiz -- examples/sat-reading-writing.json
```

El último comando imprime la ruta de un archivo HTML. Ábrelo en tu navegador y contesta el cuestionario. El archivo incluye su propio estilo y código. Funciona sin conexión y las respuestas se borran al cerrar o recargar la página. Puedes elegir una carpeta de salida con un segundo argumento o con la variable `ANKI_SAT_EXPORT_DIR`. La ubicación predeterminada es `Anki SAT Exports` dentro de tu carpeta de usuario.

## Usarlo en Anki desde un cliente MCP

1. Instala [Anki Desktop](https://apps.ankiweb.net/) y el complemento oficial [AnkiConnect](https://ankiweb.net/shared/info/2055492159). En Anki, el código del complemento es `2055492159`. Reinicia Anki y deja abierto el perfil que quieres usar.
2. Registra un servidor MCP con transporte **stdio**. Usa `node` como comando y la ruta absoluta de `dist/src/index.js` como argumento. En Codex puedes registrarlo con este comando desde la carpeta del repositorio:

   ```powershell
   codex mcp add anki-sat -- (Get-Command node.exe).Source (Resolve-Path .\dist\src\index.js).Path
   ```

3. Pide al cliente un cuestionario y solicita una vista previa con `preview_sat_quiz`. Revisa el mazo y el número de preguntas antes de guardar con `commit_sat_preview`.
4. Abre el mazo en Anki y pulsa **Study Now**. En el frente de la tarjeta, responde y pulsa **Submit quiz** en la última pregunta. Anki coloca la clave en **Show Answer**. Puedes usar esa clave al terminar y registrar el repaso con los botones habituales de Anki.

El primer guardado interactivo crea el tipo de nota `SAT Interactive Quiz v1`. Cada formulario ocupa una tarjeta de Anki. La puntuación del cuestionario se calcula en el formulario y la calificación de repaso la decides en Anki. El manual de Anki [documenta el uso de JavaScript en las tarjetas](https://docs.ankiweb.net/templates/styling.html#javascript) y advierte que puede variar entre clientes. Si un cliente no ejecuta el formulario, usa el HTML exportado.

## Herramientas MCP

| Herramienta | Entrada | Qué hace |
| --- | --- | --- |
| `preview_sat_quiz` | `deck`, `questions` | Previsualiza un cuestionario completo para Anki y devuelve un token. |
| `export_sat_quiz` | `deck`, `questions` | Guarda un cuestionario HTML que se puede contestar en un navegador. |
| `preview_sat_questions` | `deck`, `questions` | Previsualiza tarjetas individuales y devuelve un token. |
| `commit_sat_preview` | `previewToken` | Guarda una vista previa, crea el mazo si hace falta y omite duplicados. |
| `export_sat_tsv` | `deck`, `questions` | Guarda tarjetas individuales para importar en Anki con el tipo de nota `Basic`. |
| `list_decks` | — | Lista los mazos del perfil abierto. |
| `check_deck` | `deck` | Comprueba si existe un mazo. |

Las vistas previas consultan Anki. La exportación HTML y TSV funciona con Anki cerrado. Los tokens caducan a los diez minutos y se usan una sola vez en el proceso que los emitió.

## Formato de preguntas

Usa de una a cincuenta preguntas en cada lote. Proporciona el texto, cuatro opciones, una letra correcta y, si quieres, una explicación. El cliente MCP puede preparar estos datos a partir de preguntas que le proporciones.

```json
{
  "deck": "SAT · Reading and Writing",
  "questions": [
    {
      "stem": "Both researchers submitted ____ reports on time.",
      "choices": { "A": "their", "B": "there", "C": "they’re", "D": "theirs" },
      "answer": "A",
      "explanation": "Their is the possessive determiner that modifies reports."
    }
  ]
}
```

## Privacidad y permisos

- El servidor habla con AnkiConnect en `127.0.0.1:8765`. AnkiConnect puede usar una clave. Suminístrala mediante `ANKI_CONNECT_API_KEY` o el archivo local `%LOCALAPPDATA%\AnkiSatMcp\ankiconnect.key` en Windows. Guarda la clave fuera del repositorio.
- El HTML exportado no carga recursos externos ni envía las respuestas. Incluye la clave de respuestas para corregir localmente. Sirve para práctica personal.
- Configura tu cliente MCP para pedir confirmación al llamar a `commit_sat_preview`, la única herramienta que cambia la colección. Si tu cliente usa un modelo en la nube, sus políticas se aplican al contenido que le compartas.
- Usa tus propios materiales o los que tengas permiso para compartir. El ejemplo incluido es original.

`npm test` compila el proyecto y ejecuta las pruebas locales. Consulta la [licencia MIT](LICENSE).
