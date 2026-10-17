# QuickAnswer

Copy a multiple-choice question on any page and a small popup shows the answer, for example `Option B: Mars`.

Each user connects their own AI, so the developer never pays for usage.

## Install (Chrome, Edge, Brave)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. The settings page opens. Pick an AI, paste a key, and click **Run a test question**.

## AI options

| Option | Cost | Setup |
|---|---|---|
| Google Gemini (recommended) | Free | Get a key at aistudio.google.com/app/apikey (1 minute, any Google account) |
| Groq | Free | Get a key at console.groq.com/keys |
| Chrome built-in AI | Free, no key | Click "Download model" in settings. Desktop Chrome on a capable PC only |
| OpenAI / Claude | Paid by the user | Needs API credit. ChatGPT Plus and Claude Pro subscriptions don't include API use |

## Using it

- **Copy** a question (Ctrl+C). The answer appears in the corner.
- Or select text and press **Alt+Shift+A**, or right-click and pick **Get answer**. Use these on pages that block copying.
- Click the popup or press Esc to close it.
- To limit it to one site, add the site under "Only run on these sites" in settings.

## Files

- `manifest.json`: extension config
- `background.js`: sends the question to the chosen AI
- `content.js`: watches for copies on the page and shows the popup
- `offscreen.html/js`: runs Chrome's built-in AI
- `options.*`, `popup.*`, `ui.css`: settings page and toolbar popup
- `common.js`: shared defaults and the prompt
