"""Parse les réponses du VLM en actions structurées.

Format attendu du modèle:
    Thought: ...
    Action: click(123, 456)
"""
import logging
import re

log = logging.getLogger(__name__)

ACTION_RE = re.compile(r"Action\s*:\s*(\w+)\s*\(([^)]*)\)", re.DOTALL)
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def parse(text: str):
    """Retourne (thought, action_name, args dict). args vide si pas d'action."""
    thought = ""
    m = re.search(r"Thought\s*:\s*(.+?)(?:\n|$)", text, re.DOTALL)
    if m:
        thought = m.group(1).strip()

    am = ACTION_RE.search(text)
    if not am:
        return thought, "none", {}

    name = am.group(1).lower().replace("-", "_")
    raw = am.group(2)
    nums = [float(x) for x in NUM_RE.findall(raw)]

    if name in ("click", "left_click"):
        if len(nums) >= 2:
            return thought, "click", {"x": nums[0], "y": nums[1]}
    if name in ("double_click", "left_double"):
        if len(nums) >= 2:
            return thought, "double_click", {"x": nums[0], "y": nums[1]}
    if name == "right_click":
        if len(nums) >= 2:
            return thought, "right_click", {"x": nums[0], "y": nums[1]}
    if name in ("type", "write"):
        return thought, "type", {"text": _extract_string(raw)}
    if name in ("hotkey", "key", "press"):
        keys = re.findall(r"'([^']+)'", raw) or re.findall(r'"([^"]+)"', raw)
        if keys:
            return thought, "hotkey", {"keys": keys}
    if name == "scroll":
        direction = nums[0] if nums else 0
        d = "up" if (str(raw).lower().count("up") > str(raw).lower().count("down")) else "down"
        if "up" in raw.lower() and "down" not in raw.lower():
            d = "up"
        amount = abs(int(direction)) if direction else 5
        return thought, "scroll", {"direction": d, "amount": amount}
    if name == "drag":
        if len(nums) >= 4:
            return thought, "drag", {"x1": nums[0], "y1": nums[1], "x2": nums[2], "y2": nums[3]}
    if name in ("wait", "sleep"):
        return thought, "wait", {"seconds": nums[0] if nums else 2}
    if name in ("terminal", "bash", "shell", "run"):
        return thought, "terminal", {"command": _extract_string(raw)}
    if name in ("read_file", "read"):
        return thought, "read_file", {"path": _extract_string(raw)}
    if name in ("write_file", "create_file"):
        sm = re.search(r"'([^']*)'\s*,\s*'''(.*?)'''|'([^']*)'\s*,\s*\"\"\"(.*?)\"\"\"", raw, re.DOTALL)
        if sm:
            path = sm.group(1) or sm.group(3) or ""
            content = sm.group(2) if sm.group(2) is not None else (sm.group(4) or "")
            return thought, "write_file", {"path": path, "content": content}
        return thought, "write_file", {"path": _extract_string(raw), "content": ""}
    if name in ("done", "finished", "finish", "stop"):
        return thought, "done", {}

    return thought, "none", {}


def _extract_string(raw: str) -> str:
    sm = re.search(r"'''(.*?)'''", raw, re.DOTALL)
    if sm:
        return sm.group(1)
    dm = re.search(r'"""(.*?)"""', raw, re.DOTALL)
    if dm:
        return dm.group(1)
    qm = re.search(r"'((?:[^'\\]|\\.)*)'", raw)
    if qm:
        return qm.group(1).replace("\\'", "'")
    qd = re.search(r'"((?:[^"\\]|\\.)*)"', raw)
    if qd:
        return qd.group(1).replace('\\"', '"')
    return raw.strip().strip("'\"")
