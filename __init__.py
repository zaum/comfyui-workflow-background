"ComfyUI Workflow Background - per-workflow canvas background images (frontend extension, no nodes)."
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

# Server route: delete a background image from input/backgrounds.
# Strictly scoped to that folder (no path traversal possible) and only
# registered when the ComfyUI server is importable.
try:
    import os

    from aiohttp import web
    from server import PromptServer
    import folder_paths

    _WB_BG_SUBFOLDER = "backgrounds"

    @PromptServer.instance.routes.post("/workflow_background/delete")
    async def _wb_delete_background(request):
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        filename = data.get("filename", "")
        subfolder = data.get("subfolder", "")
        ftype = data.get("type", "")
        if ftype != "input" or subfolder != _WB_BG_SUBFOLDER:
            return web.json_response({"error": "refusing: out of scope"}, status=403)
        if not filename or filename != os.path.basename(filename) or ".." in filename:
            return web.json_response({"error": "invalid filename"}, status=400)
        input_dir = os.path.realpath(folder_paths.get_input_directory())
        scope_dir = os.path.join(input_dir, _WB_BG_SUBFOLDER)
        target = os.path.realpath(os.path.join(scope_dir, filename))
        if os.path.dirname(target) != scope_dir:
            return web.json_response({"error": "refusing: out of scope"}, status=403)
        try:
            if os.path.isfile(target):
                os.remove(target)
                return web.json_response({"deleted": True})
            return web.json_response({"deleted": False, "reason": "not found"})
        except OSError as e:
            return web.json_response({"deleted": False, "reason": str(e)}, status=500)
except Exception:
    pass

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
