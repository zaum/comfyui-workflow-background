# AGENTS.md - ComfyUI Workflow Background Extension

## Dev vs installed copy (important)

- Dev folder (edit here): `I:\APPLICATIONS\Comfy Worfklow Background Extension`
- Live copy loaded by ComfyUI: `C:\Users\peter\Documents\ComfyUI\custom_nodes\comfyui-workflow-background`
- ComfyUI never reads the dev folder. After every JS/CSS/Python change, copy the changed files to the live copy, otherwise the user sees no change.

## Deploy steps after each fix

1. Edit files in the dev folder.
2. Verify: `node --check` for JS files, `npm test` for unit tests.
3. Copy to live copy (PowerShell):
   ```powershell
   Copy-Item -LiteralPath "I:\APPLICATIONS\Comfy Worfklow Background Extension\comfyui_workflow_background\web\js\workflow_background.js" -Destination "C:\Users\peter\Documents\ComfyUI\custom_nodes\comfyui-workflow-background\web\js\workflow_background.js" -Force
   Copy-Item -LiteralPath "I:\APPLICATIONS\Comfy Worfklow Background Extension\comfyui_workflow_background\web\css\workflow_background.css" -Destination "C:\Users\peter\Documents\ComfyUI\custom_nodes\comfyui-workflow-background\web\css\workflow_background.css" -Force
   ```
4. Verify the live copy contains the change (e.g. `Select-String` for the new marker).
5. No ComfyUI server restart needed for frontend-only (JS/CSS) changes. Tell the user to hard-refresh the browser: `Ctrl+F5`.
6. Python (`__init__.py`) changes DO need a ComfyUI restart.

## Privacy check before publish

- Never commit absolute local paths, usernames, tokens, API keys, IPs, hostnames, emails.
- Use placeholders or env variables instead.
