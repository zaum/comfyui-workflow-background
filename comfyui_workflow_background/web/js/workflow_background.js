/**
 * ComfyUI Workflow Background - frontend extension.
 *
 * Per-workflow canvas background images. Stores only the image file
 * reference (never pixel data) in the workflow `extra` block under
 * `extra.canvasBackgroundImage`, so workflows stay small. Each upload
 * gets a unique file in `input/backgrounds`, deleted when replaced
 * or cleared.
 *
 * Rendering: chains onto `canvas.onRenderBackground`. When a workflow
 * background is set we paint it and return true (handled); otherwise we
 * return false so the core background pipeline is untouched.
 *
 * Works on both the legacy LiteGraph canvas (1.x) and Vue canvas (2.x)
 * frontends - only public extension APIs are used:
 * `app.registerExtension`, `getCanvasMenuItems`, `commands`, `settings`.
 */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { $el, ComfyDialog } from "../../../scripts/ui.js";
import {
  FIT_MODES,
  POSITIONS,
  UPLOAD_SUBFOLDER,
  clampInt,
  normalizeConfig,
  positionFractions,
  uniqueUploadName,
} from "./wb_utils.js";

// Load the extension stylesheet. ComfyUI serves extension files statically,
// so resolving against this module's URL works regardless of install folder.
const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.type = "text/css";
cssLink.href = new URL("../css/workflow_background.css?v=3", import.meta.url).href;
document.head.appendChild(cssLink);

const EXT_NAME = "ComfyUI.WorkflowBackground";
const EXTRA_KEY = "canvasBackgroundImage";

const POSITION_FRIENDLY = {
  "top-left": "Top-left",
  top: "Top",
  "top-right": "Top-right",
  left: "Left",
  center: "Center",
  right: "Right",
  "bottom-left": "Bottom-left",
  bottom: "Bottom",
  "bottom-right": "Bottom-right",
};

/** Read the stored background config from the active graph, if any. */
function getStoredConfig() {
  try {
    const extra = app.graph?.extra;
    const cfg = extra?.[EXTRA_KEY];
    if (cfg && typeof cfg === "object" && typeof cfg.filename === "string" && cfg.filename) {
      return normalizeConfig(cfg);
    }
  } catch (e) {
    console.warn(`[${EXT_NAME}] Failed to read background config:`, e);
  }
  return null;
}

/** Build a /view URL for an uploaded image. */
function buildViewUrl(cfg) {
  const params = new URLSearchParams({
    filename: cfg.filename,
    type: cfg.type,
  });
  if (cfg.subfolder) params.set("subfolder", cfg.subfolder);
  return `${api.apiURL("/view")}?${params.toString()}`;
}

/** Persist config into graph.extra and mark the graph dirty so Ctrl+S saves it. */
function saveConfig(cfg) {
  const graph = app.graph;
  if (!graph) return;
  graph.extra = graph.extra || {};
  if (cfg) {
    graph.extra[EXTRA_KEY] = { ...cfg };
  } else {
    delete graph.extra[EXTRA_KEY];
  }
  // Tell both the legacy and the new frontend that the workflow changed,
  // so the save button / autosave picks it up.
  try {
    graph.change?.();
  } catch {}
  try {
    graph.setDirtyCanvas?.(true, true);
  } catch {}
  try {
    app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.();
  } catch {}
  try {
    app.workflowManager?.activeWorkflow?.changeTracker?.checkState?.();
  } catch {}
}

/** Read an extension setting with fallbacks across frontend versions. */
function getSetting(id, fallback) {
  try {
    const v = app.extensionManager?.setting?.get?.(id);
    if (v !== undefined && v !== null) return v;
  } catch {}
  try {
    const v = app.ui?.settings?.getSettingValue?.(id);
    if (v !== undefined && v !== null) return v;
  } catch {}
  return fallback;
}

function toast(msg, type = "info") {
  try {
    app.extensionManager?.toast?.add?.({
      severity: type === "error" ? "error" : type === "warn" ? "warn" : "info",
      summary: "Workflow Background",
      detail: String(msg),
      life: 3500,
    });
  } catch {}
  if (type === "error") console.error(`[${EXT_NAME}]`, msg);
  else console.log(`[${EXT_NAME}]`, msg);
}
// ---------------------------------------------------------------------------
// Background renderer: draws the image onto the canvas background.
// ---------------------------------------------------------------------------

const renderer = {
  img: null,
  url: "",
  config: null,

  setConfig(cfg) {
    this.config = cfg ? { ...cfg } : null;
    const url = cfg ? buildViewUrl(cfg) : "";
    if (url === this.url) {
      try {
        app.canvas?.setDirty?.(true, true);
      } catch {}
      return;
    }
    this.url = url;
    this.img = null;
    if (url) {
      const img = new Image();
      img.onload = () => {
        if (this.url === url) {
          this.img = img;
          try {
            app.canvas?.setDirty?.(true, true);
          } catch {}
        }
      };
      img.onerror = () => {
        if (this.url === url) {
          console.warn(`[${EXT_NAME}] Could not load background image:`, url);
          this.img = null;
        }
      };
      img.src = url;
    }
    try {
      app.canvas?.setDirty?.(true, true);
    } catch {}
  },

  /** Paint callback chained onto canvas.onRenderBackground. */
  paint(cvs, ctx) {
    const cfg = this.config;
    if (!cfg || !this.img?.naturalWidth) return false;

    const dpr = window.devicePixelRatio || 1;
    const cw = cvs.width / dpr;
    const ch = cvs.height / dpr;
    const imgW = this.img.naturalWidth;
    const imgH = this.img.naturalHeight;

    // Destination rect in CSS pixels (screen space - fixed, not zooming).
    // Aspect ratio is always preserved: dw/dh are scaled uniformly.
    let dw, dh;
    if (cfg.fit === "contain") {
      const k = Math.min(cw / imgW, ch / imgH);
      dw = imgW * k;
      dh = imgH * k;
    } else {
      // cover
      const k = Math.max(cw / imgW, ch / imgH);
      dw = imgW * k;
      dh = imgH * k;
    }
    // Position: 3x3 grid alignment (see positionFractions in wb_utils.js).
    const { hx, hy } = positionFractions(cfg.position);
    const dx = (cw - dw) * hx;
    const dy = (ch - dh) * hy;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = cfg.opacity / 100;
    if (cfg.fit === "cover") {
      // Clip to the visible canvas so cover overflow does not spill.
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.img, dx, dy, dw, dh);
    ctx.restore();
    return true;
  },
};

/** Re-read config from the graph and update the renderer + CSS override. */
function refreshFromGraph() {
  const cfg = getStoredConfig();
  renderer.setConfig(cfg);
  updateGlobalOverride(!!cfg);
}

/**
 * When a workflow background is active AND a core global background image
 * is set (rendered via the `--bg-img` CSS variable), suppress the global
 * one so the two images do not stack on top of each other.
 * The workflow background wins. If no global image is set, this is a no-op.
 */
function updateGlobalOverride(active) {
  try {
    const root = document.documentElement;
    if (!active) {
      root.classList.remove("wb-workflow-bg-active");
      return;
    }
    // Only suppress when there is actually a global image to suppress.
    const bgImg = getComputedStyle(root).getPropertyValue("--bg-img").trim();
    if (bgImg && bgImg !== "none") {
      root.classList.add("wb-workflow-bg-active");
    } else {
      root.classList.remove("wb-workflow-bg-active");
    }
  } catch {}
}

/** Hook the background paint chain once the canvas exists. */
function hookRenderChain() {
  const canvas = app.canvas;
  if (!canvas || canvas.__wbHooked) return false;
  canvas.__wbHooked = true;

  const prev = canvas.onRenderBackground;
  canvas.onRenderBackground = function (cvs, ctx) {
    if (renderer.paint(cvs, ctx)) return true;
    if (typeof prev === "function") {
      return prev.call(this, cvs, ctx);
    }
    return false;
  };
  return true;
}

/**
 * Watch for graph swaps (workflow open / switch) and re-apply background.
 *
 * Event-driven first: hooks on `app.loadGraphData` (every workflow load)
 * and `graph.configure` refresh immediately. A slow safety-net poll
 * (2s) catches swaps that bypass the hooks, and also re-checks the
 * `--bg-img` variable in case the user sets a global background after
 * the workflow one (otherwise the two images would stack).
 */
function watchGraphChanges() {
  let lastGraph = null;
  let lastExtraJson = "";
  let lastBgImg = null;

  const check = () => {
    const g = app.graph;
    if (!g) return;
    hookRenderChain();
    let json = "";
    try {
      json = JSON.stringify(g.extra?.[EXTRA_KEY] ?? null);
    } catch {
      json = "";
    }
    if (g !== lastGraph || json !== lastExtraJson) {
      lastGraph = g;
      lastExtraJson = json;
      refreshFromGraph();
    }
    try {
      const cur = getComputedStyle(document.documentElement).getPropertyValue("--bg-img").trim();
      if (cur !== lastBgImg) {
        lastBgImg = cur;
        updateGlobalOverride(!!renderer.config);
      }
    } catch {}
  };

  // Refresh right after a workflow is loaded through the app.
  try {
    if (typeof app.loadGraphData === "function" && !app.__wbLoadHooked) {
      app.__wbLoadHooked = true;
      const origLoad = app.loadGraphData.bind(app);
      app.loadGraphData = async (...args) => {
        const r = await origLoad(...args);
        try {
          setTimeout(check, 50);
        } catch {}
        return r;
      };
    }
  } catch {}

  // Also refresh right after a graph is (re)configured, e.g. on load.
  try {
    const graphProto = app.graph?.constructor?.prototype;
    if (graphProto && !graphProto.__wbConfigureHooked) {
      graphProto.__wbConfigureHooked = true;
      const origConfigure = graphProto.configure;
      if (typeof origConfigure === "function") {
        graphProto.configure = function (...args) {
          const r = origConfigure.apply(this, args);
          try {
            setTimeout(check, 50);
          } catch {}
          return r;
        };
      }
    }
  } catch {}

  check();
  setInterval(check, 2000);
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];
const ACCEPT_ATTR = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

function isAcceptedImage(file) {
  if (!file) return false;
  if (file.type && ACCEPTED_MIME.includes(file.type)) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || "");
}

/** Upload a File to input/backgrounds, return { filename, subfolder, type }. */
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file, uniqueUploadName(file.name));
  // No "overwrite" flag: every upload gets a unique name, so there is
  // nothing to overwrite. Omitting it also keeps the server-side
  // duplicate-name numbering as a safety net.
  formData.append("type", "input");
  formData.append("subfolder", UPLOAD_SUBFOLDER);

  const resp = await api.fetchApi("/upload/image", { method: "POST", body: formData });
  if (!resp.ok) {
    throw new Error(`Upload failed (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  return {
    filename: data.name,
    subfolder: data.subfolder || UPLOAD_SUBFOLDER,
    type: "input",
  };
}
/** Resolve when an image URL loads (or reject on error / timeout). */
function waitForImage(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error("Image load timed out"));
      }
    }, timeoutMs);
    img.onload = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve();
      }
    };
    img.onerror = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error("Image load failed"));
      }
    };
    img.src = url;
  });
}
// ---------------------------------------------------------------------------
// Picker dialog: browse, drag & drop, or paste from clipboard.
// ---------------------------------------------------------------------------

class BackgroundPickerDialog extends ComfyDialog {
  constructor(onSave) {
    super();
    this.onSave = onSave;
    this.element.classList.add("wb-picker-dialog");
    this.uploading = false;
  }

  show(current) {
    this.uploading = false;
    this.current = current ? { ...current } : null;

    // New backgrounds start from the user's ComfyUI settings (if set),
    // otherwise the built-in defaults.
    const opacityInit = current?.opacity ?? clampInt(getSetting("Comfy.WorkflowBackground.Opacity", 80), 0, 100, 80);
    const fitSetting = getSetting("Comfy.WorkflowBackground.Fit", "cover");
    const fitInit = FIT_MODES.includes(fitSetting) ? fitSetting : "cover";
    const posSetting = getSetting("Comfy.WorkflowBackground.Position", "center");
    const posInit = POSITIONS.includes(posSetting) ? posSetting : "center";

    this.statusLine = $el("div.wb-status", {
      textContent: "Click to open or drag and drop",
    });

    // Paste-from-clipboard icon button (sits inside the drop zone).
    // Uses the same Lucide clipboard-paste icon as the core "Paste Image"
    // entry in node right-click menus.
    this.pasteIcon = $el("span", { className: "icon-[lucide--clipboard-paste]" });
    this.pasteBtn = $el(
      "button.wb-paste-btn",
      { title: "Paste from clipboard" },
      [this.pasteIcon]
    );
    this.pasteBtn.onclick = (e) => {
      e.stopPropagation(); // do not trigger the zone's own click-to-open
      this.pasteFromClipboard();
    };

    // Click anywhere on the zone opens the file browser.
    this.dropZone = $el(
      "div.wb-drop-zone",
      { tabindex: "0" },
      [this.statusLine, this.pasteBtn]
    );
    this.dropZone.onclick = () => this.pickFile();

    // Opacity slider 0-100
    this.opacityInput = $el("input", {
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(opacityInit),
    });
    this.opacityLabel = $el("span.wb-value", { textContent: `${opacityInit}%` });
    this.opacityInput.oninput = () => {
      this.opacityLabel.textContent = `${this.opacityInput.value}%`;
      this.applyLiveSettings();
    };

    // Fit mode: segmented 2-button control (Cover / Fit)
    this.fitValue = fitInit;
    this.fitCoverBtn = $el("button.wb-seg", { textContent: "Cover" });
    this.fitFitBtn = $el("button.wb-seg", { textContent: "Fit" });
    this.fitCoverBtn.onclick = () => this.setFit("cover");
    this.fitFitBtn.onclick = () => this.setFit("contain");
    this.paintFitSeg();

    // Position: 3x3 grid of 9 cells (corners, edges, center).
    // Each cell shows a mini position mark (like a picture-position icon):
    // corner block, edge bar, or center square.
    this.posValue = posInit;
    this.posCells = {};
    const posGrid = $el("div.wb-pos-grid");
    for (const pos of POSITIONS) {
      const cell = $el("button.wb-pos-cell", {
        title: POSITION_FRIENDLY[pos],
        dataset: { pos },
      });
      cell.setAttribute("data-pos", pos);
      cell.appendChild($el("span.wb-pos-mark"));
      cell.onclick = () => this.setPosition(pos);
      this.posCells[pos] = cell;
      posGrid.appendChild(cell);
    }
    this.paintPosGrid();

    const content = $el("div.wb-picker", [
      this.dropZone,
      $el("div.wb-row", [$el("label", { textContent: "Opacity" }), this.opacityInput, this.opacityLabel]),
      // Fit + Position side by side (no captions).
      $el("div.wb-row.wb-side", [
        $el("div.wb-group", [
          $el("div.wb-fit-btns", [this.fitCoverBtn, this.fitFitBtn]),
        ]),
        $el("div.wb-group", [
          posGrid,
        ]),
      ]),
    ]);

        super.show(content);

    // Re-sync after show: the stored config may have changed since this
    // dialog was constructed (buttons are created once, in the constructor).
    this.refreshClearBtn();

    // Clear button bal oldalra, Close jobb oldlára (space-between elrendezéssel).
    // Guarded: show() runs on every open but the buttons persist, so wrapping
    // twice would nest .wb-footer-row divs into each other.
    const footer = this.clearBtn?.parentElement;
    if (footer && this.closeBtn && !footer.classList.contains("wb-footer-row")) {
      footer.appendChild(
        $el("div.wb-footer-row", [this.clearBtn, this.closeBtn])
      );
    }

    // Ctrl+V: capture-phase listener so we get the paste before ComfyUI's
    // own handler (which would drop the image into the workflow as a node).
    this.pasteHandler = (e) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;
      const img = [...files].find((f) => isAcceptedImage(f));
      if (img) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.acceptFile(img);
      }
    };
    document.addEventListener("paste", this.pasteHandler, true);

    // Drag & drop onto the drop zone.
    this.onDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hasFiles = e.dataTransfer?.types?.includes("Files");
      if (hasFiles) this.dropZone?.classList.add("wb-dragging");
    };
    this.onDragLeave = (e) => {
      e.preventDefault();
      this.dropZone?.classList.remove("wb-dragging");
    };
    this.onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation(); // do not let it hit the workflow drop handler
      this.dropZone?.classList.remove("wb-dragging");
      const file = e.dataTransfer?.files?.[0];
      this.acceptFile(file);
    };
    this.dropZone?.addEventListener("dragover", this.onDragOver);
    this.dropZone?.addEventListener("dragleave", this.onDragLeave);
    this.dropZone?.addEventListener("drop", this.onDrop);
  }

  /** Read an image from the clipboard via the async Clipboard API. */
  async pasteFromClipboard() {
    // Pulse immediately on click: clipboard.read() can take a while
    // (permission prompt), and without this there is no feedback at all.
    // uploadAndApply() takes over the pulse once the upload starts.
    this.dropZone?.classList.add("wb-uploading");
    try {
      if (!navigator.clipboard?.read) {
        toast("Clipboard read not supported - use Ctrl+V instead.", "warn");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const file = new File([blob], "clipboard.png", { type });
          this.acceptFile(file);
          return;
        }
      }
      toast("No image found on the clipboard.", "warn");
    } catch (e) {
      console.warn(`[${EXT_NAME}] Clipboard read failed:`, e);
      toast("Clipboard access denied - use Ctrl+V instead.", "warn");
    } finally {
      // If an upload started, it owns the pulse now (removes it when done).
      if (!this.uploading) this.dropZone?.classList.remove("wb-uploading");
    }
  }

  pickFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT_ATTR;
    input.onchange = () => {
      this.acceptFile(input.files?.[0]);
      input.remove();
    };
    input.click();
  }

  acceptFile(file) {
    if (!file) return;
    if (!isAcceptedImage(file)) {
      toast("Only image files are supported (png/jpg/webp/gif/bmp).", "warn");
      return;
    }
    // Live mode: upload immediately and apply to the canvas right away.
    this.uploadAndApply(file);
  }

  setStatus(text) {
    if (this.statusLine) this.statusLine.textContent = text;
  }

  async uploadAndApply(file) {
    if (this.uploading) return;
    this.dropZone?.classList.add("wb-uploading");
    this.uploading = true;
    // Remember the previous file so it can be deleted once replaced
    // (otherwise every re-upload would orphan a file on disk).
    const prev = this.current ? { ...this.current } : null;
    try {
      const ref = await uploadImage(file);
      const cfg = normalizeConfig({ ...ref, ...this.currentSettings() });
      saveConfig(cfg);
      refreshFromGraph();
      this.current = { ...cfg };
      // Delete the replaced file (best effort, never blocks the new one).
      if (prev?.filename && prev.filename !== cfg.filename) {
        try {
          await deleteStoredImage(prev);
        } catch {}
      }
      // Keep the frame pulsing until the image is actually loadable
      // (upload done != visible yet). No status text change.
      try {
        await waitForImage(buildViewUrl(cfg), 15000);
      } catch {}
      // Don't overwrite the "Click to open or drag and drop" text;
      // just reset to the default so the drop zone always shows it.
      this.setStatus("Click to open or drag and drop");
      this.refreshClearBtn();
      this.onSave?.(cfg);
    } catch (e) {
      console.error(`[${EXT_NAME}] Upload failed:`, e);
      toast(`Could not upload background: ${e.message || e}`, "error");
      this.setStatus("Upload failed - try again.");
    } finally {
      this.uploading = false;
      this.dropZone?.classList.remove("wb-uploading");
    }
  }

  currentSettings() {
    return {
      opacity: parseInt(this.opacityInput?.value ?? "80", 10),
      fit: this.fitValue ?? "cover",
      position: this.posValue ?? "center",
    };
  }

  setFit(mode) {
    this.fitValue = FIT_MODES.includes(mode) ? mode : "cover";
    this.paintFitSeg();
    this.applyLiveSettings();
  }

  paintFitSeg() {
    this.fitCoverBtn?.classList.toggle("wb-on", this.fitValue === "cover");
    this.fitFitBtn?.classList.toggle("wb-on", this.fitValue === "contain");
  }

  setPosition(pos) {
    this.posValue = POSITIONS.includes(pos) ? pos : "center";
    this.paintPosGrid();
    this.applyLiveSettings();
  }

  paintPosGrid() {
    for (const pos of POSITIONS) {
      this.posCells[pos]?.classList.toggle("wb-on", this.posValue === pos);
    }
  }
  /** Live-apply opacity/fit/position while the dialog is open. */
  applyLiveSettings() {
    const s = this.currentSettings();
    if (renderer.config) {
      renderer.config.opacity = s.opacity;
      renderer.config.fit = s.fit;
      renderer.config.position = s.position;
      // Keep the dialog snapshot in sync so Clear stays enabled while a
      // background exists (this.current would otherwise go stale).
      this.current = { ...renderer.config };
      // Persist slider tweaks too, so closing the dialog keeps them.
      try {
        saveConfig({ ...renderer.config });
      } catch {}
      try {
        app.canvas?.setDirty?.(true, true);
      } catch {}
    }
  }

  createButtons() {
    // Clear button: enabled whenever a background actually exists.
    // The click handler clears unconditionally, so even a stale disabled
    // state can never block clearing a real background.
    this.clearBtn = $el("button.wb-footer-btn.wb-danger", {
      type: "button",
      textContent: "Clear Background",
      onclick: () => {
        clearBackground();
        this.current = null;
        this.setStatus("Click to open or drag and drop");
        this.refreshClearBtn();
      },
    });
    this.refreshClearBtn();
    const btnClose = $el("button.wb-footer-btn", {
      type: "button",
      textContent: "Close",
      onclick: () => this.close(),
    });
    this.closeBtn = btnClose;
    return [this.clearBtn, btnClose];
  }

  /** Enable the Clear button whenever a background exists (live check). */
  refreshClearBtn() {
    if (!this.clearBtn) return;
    // Check all live sources, not just the dialog-open snapshot:
    // the snapshot (this.current), the stored workflow extra, and the
    // active renderer. If any of them has a background, Clear must work.
    let hasBg = !!this.current?.filename;
    if (!hasBg) {
      try {
        hasBg = !!getStoredConfig()?.filename;
      } catch {}
    }
    if (!hasBg) {
      hasBg = !!renderer.config?.filename;
    }
    this.clearBtn.disabled = !hasBg;
  }

  close() {
    try {
      document.removeEventListener("paste", this.pasteHandler, true);
    } catch {}
    try {
      this.dropZone?.removeEventListener("dragover", this.onDragOver);
      this.dropZone?.removeEventListener("dragleave", this.onDragLeave);
      this.dropZone?.removeEventListener("drop", this.onDrop);
    } catch {}
    super.close();
  }
}

function openPicker() {
  new BackgroundPickerDialog().show(getStoredConfig());
}

/** Delete one background image file from input/backgrounds. Never throws. */
async function deleteStoredImage(cfg) {
  if (!cfg?.filename) return false;
  try {
    const resp = await api.fetchApi("/workflow_background/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: cfg.filename,
        subfolder: cfg.subfolder,
        type: cfg.type,
      }),
    });
    return resp.ok;
  } catch (e) {
    console.warn(`[${EXT_NAME}] Delete failed:`, e);
    return false;
  }
}

async function clearBackground() {
  const cfg = getStoredConfig();
  saveConfig(null);
  refreshFromGraph();
  if (!cfg?.filename) {
    toast("Workflow background cleared.");
    return;
  }
  // Also delete the image file from input/backgrounds (each upload gets
  // a unique name, so no other workflow can reference this file).
  if (await deleteStoredImage(cfg)) {
    toast("Workflow background cleared and image deleted.");
  } else {
    toast("Background cleared, but the image file could not be deleted.", "warn");
  }
}
// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

app.registerExtension({
  name: EXT_NAME,

  settings: [
    {
      id: "Comfy.WorkflowBackground.Opacity",
      name: "Workflow Background default opacity",
      type: "slider",
      defaultValue: 80,
      attrs: { min: 0, max: 100, step: 1 },
    },
    {
      id: "Comfy.WorkflowBackground.Fit",
      name: "Workflow Background fit mode",
      type: "combo",
      defaultValue: "cover",
      options: ["cover", "contain"],
    },
    {
      id: "Comfy.WorkflowBackground.Position",
      name: "Workflow Background position",
      type: "combo",
      defaultValue: "center",
      options: [
        "top-left",
        "top",
        "top-right",
        "left",
        "center",
        "right",
        "bottom-left",
        "bottom",
        "bottom-right",
      ],
    },
  ],

  commands: [
    {
      id: "Comfy.WorkflowBackground.Set",
      label: "Set Workflow Background",
      icon: "pi pi-image",
      function: () => openPicker(),
    },
    {
      id: "Comfy.WorkflowBackground.Clear",
      label: "Clear Workflow Background",
      icon: "pi pi-times",
      function: () => clearBackground(),
    },
  ],

  getCanvasMenuItems() {
    // Always show the same item so the menu position never jumps.
    // The Clear action lives inside the dialog as a button.
    return [
      {
        content: "Change Workflow Background",
        callback: () => openPicker(),
      },
    ];
  },

  async setup() {
    hookRenderChain();
    watchGraphChanges();
    // First apply may happen before the graph exists; retry shortly.
    setTimeout(refreshFromGraph, 1000);
    setTimeout(refreshFromGraph, 3000);
    console.log(`[${EXT_NAME}] loaded`);
  },
});
