
## Удаление грида — что сделать

Грид сейчас живёт в трёх местах. Нужно убрать **все три**:

**1. `style.css`** — удалить весь блок `#grid-overlay { ... }` [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/525f5dfa-a6f5-4ccf-81e7-15f04d209213/style.css)

**2. `index.html`** — удалить тег `<div id="grid-overlay"></div>` [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/7af94ab7-1975-447c-afb9-668610d9b668/index.html)

**3. `renderer.js`** — удалить строку `this.gridOverlay = document.getElementById('grid-overlay');` и все обращения к `this.gridOverlay` [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/67b3ee8b-df1c-480c-a2a9-f4816301f4cc/renderer.js)

После этого фон будет чистым `--bg-primary: #0d0d0d` — однородный тёмный цвет из `#viewport-container`. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/525f5dfa-a6f5-4ccf-81e7-15f04d209213/style.css)

***

## 🟠 Оставшиеся проблемы

После удаления грида `tile memory limits` должна значительно уменьшиться, но **не исчезнет полностью**, пока:

- `#canvas` имеет размер `100000×100000px` — Chromium всё ещё будет пытаться тайлировать эту область при активном zoom. **TODO:** Рассмотреть уменьшение до `20000×20000px` если рабочая область этого достаточно [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/525f5dfa-a6f5-4ccf-81e7-15f04d209213/style.css)
- `webUtils:getPathForFile` всё ещё идёт через IPC — объект `File` не сериализуется, хендлер не работает корректно [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/96514866-5a6d-4994-ba1d-001e57c59d6f/preload.js)
- `_invalidateDimensionCache` не вызывается при изменении `scale` изображения [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/153923199/67b3ee8b-df1c-480c-a2a9-f4816301f4cc/renderer.js)
