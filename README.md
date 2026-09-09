# ComfyUI Workflow Background

Per-workflow canvas background images for ComfyUI. Frontend-only extension pack, no nodes, no core file changes.

## Features

- Every workflow can have its own background image; it switches automatically when you change workflows.
- Right-click canvas menu:
  - **Set Workflow Background** - pick an image (file browser, drag & drop, or paste from clipboard).
  - **Clear Workflow Background** - remove the background from the current workflow.
- Sizing modes: **Cover** and **Contain**. Aspect ratio is always preserved.
- Position: **Center** or **Top-left**.
- Opacity: 0-100%.
- The image is NOT embedded in the workflow JSON - only the file name is stored in the workflow `extra` data.
- The image is uploaded to the ComfyUI `input/backgrounds` folder.
- Settings persist with the workflow after saving.

## Install

Copy this folder into your ComfyUI `custom_nodes` directory and restart ComfyUI:

```
custom_nodes/comfyui-workflow-background
```

## Usage

1. Right-click an empty canvas area.
2. Choose **Set Workflow Background**.
3. Pick an image (browse, drop, or paste), adjust opacity / fit / position, press **Save**.
4. Save the workflow (Ctrl+S) so the background setting is stored.

## Storage format

Saved under `extra.canvasBackgroundImage` in the workflow JSON:

```json
{
  "filename": "my-bg.png",
  "subfolder": "backgrounds",
  "type": "input",
  "opacity": 80,
  "fit": "cover",
  "position": "center"
}
```

## Compatibility

Works with both the legacy (LiteGraph canvas) and Vue (2.x) frontends. Uses only the public frontend extension API (`app.registerExtension`, `getCanvasMenuItems`) plus the documented `canvas.onRenderBackground` chain.
