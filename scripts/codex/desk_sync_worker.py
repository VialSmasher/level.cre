"""Run one Daily Desk request under the signed-in broker's Windows profile."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.error
import urllib.request
from uuid import UUID

AUTOMATION = "evening-level-cre-sync"
API = "https://levelcre-production.up.railway.app/api/agent/desk-sync/"
STATE = ["complete", "partial", "failed"]
REASON = ["none", "coverage", "backlog", "access", "interrupted", "other"]
COUNTS = ["recorded", "needsReview", "queued"]
FIELDS = {"state": {"type": "string", "enum": STATE},
          "reason": {"type": "string", "enum": REASON},
          **{key: {"type": "integer", "minimum": 0, "maximum": 1000000} for key in COUNTS}}
SCHEMA = {"type": "object", "properties": FIELDS, "additionalProperties": False, "required": list(FIELDS)}
FAILURE = {"state": "failed", "reason": "interrupted", **dict.fromkeys(COUNTS, 0)}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def api_client():
    config = Path.home() / ".codex/secrets/levelcre-sales-activity.json"
    key = os.environ.get("LEVELCRE_SALES_ACTIVITY_API_KEY") or json.loads(config.read_text("utf-8-sig"))["apiKey"]
    if not isinstance(key, str) or not key.strip():
        raise ValueError("Missing local sales activity credential")
    opener = urllib.request.build_opener(NoRedirect())

    def post(action, body):
        request = urllib.request.Request(API + action, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "x-levelcre-sales-key": key})
        with opener.open(request, timeout=15) as response:
            data = response.read()
            return json.loads(data) if data else None
    return post


def read_automation():
    path = Path.home() / ".codex/automations" / AUTOMATION / "automation.toml"
    with path.open("rb") as file:
        spec = tomllib.load(file)
    if spec.get("id") != AUTOMATION or spec.get("execution_environment") != "local":
        raise ValueError("Unexpected evening automation")
    cwd, = spec["cwds"]
    workspace = Path(cwd).resolve(strict=True)
    if not (workspace / "scripts/codex/record-levelcre-sales-activity.ps1").is_file() or not spec["prompt"].strip():
        raise ValueError("Evening sync workspace unavailable")
    return spec, workspace


def checked_result(result):
    if (not isinstance(result, dict) or result.keys() != FIELDS.keys()
            or result["state"] not in STATE or result["reason"] not in REASON
            or any(type(result[k]) is not int or not 0 <= result[k] <= 1000000 for k in COUNTS)
            or (result["state"] == "complete" and (result["reason"] != "none" or result["queued"]))):
        raise ValueError("Invalid completion receipt")
    return result


def execute(post, ticket):
    spec, workspace = read_automation()
    codex = shutil.which("codex.exe")
    if not codex:
        # Store app updates can change the installation directory between logins.
        command = "(Get-AppxPackage OpenAI.Codex | Select-Object -First 1).InstallLocation"
        location = subprocess.check_output(["powershell.exe", "-NoProfile", "-Command", command], text=True).strip()
        codex = str(Path(location) / "app/resources/codex.exe") if location else None
    if not codex or not Path(codex).is_file():
        raise FileNotFoundError("Codex CLI unavailable")
    prompt = spec["prompt"] + (
        "\n\nThis is a manual Daily Desk run of the same workflow. Respect the project's current AGENTS.md, "
        "including retirement of Postmark. Keep any detailed reconciliation evidence local. "
        "Return only the requested aggregate receipt. Use the verified activity results for counts. "
        "Use failed if the run could not proceed, partial for incomplete coverage, unavailable required "
        "steps or remaining outbox rows, and complete only after checking the final flush. "
        "For failed or partial runs select the closest reason. Use none for a complete run."
    )
    with tempfile.TemporaryDirectory(prefix="levelcre-desk-") as directory:
        schema = Path(directory) / "receipt-schema.json"
        output = Path(directory) / "receipt.json"
        schema.write_text(json.dumps(SCHEMA), encoding="utf-8")
        args = [codex, "exec", "--approve-for-me", "-C", str(workspace),
                "--model", spec["model"], "-c", "model_reasoning_effort=" + json.dumps(spec["reasoning_effort"]),
                "--output-schema", str(schema), "--output-last-message", str(output), "-"]
        start = last_contact = time.monotonic()
        with tempfile.TemporaryFile() as source:
            source.write(prompt.encode("utf-8"))
            source.seek(0)
            child = subprocess.Popen(args, cwd=workspace, stdin=source,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                while True:
                    try:
                        exit_code = child.wait(timeout=25)
                        break
                    except subprocess.TimeoutExpired:
                        now = time.monotonic()
                        if now - start > 7200:
                            raise TimeoutError("Sync timed out")
                        try:
                            post("heartbeat", ticket)
                            last_contact = now
                        except urllib.error.HTTPError as error:
                            if error.code < 500:
                                raise
                        except (OSError, TimeoutError):
                            pass
                        if now - last_contact > 150:
                            raise TimeoutError("Worker lost contact with Level CRE")
            finally:
                if child.poll() is None:
                    child.kill()
                    child.wait()
        if exit_code != 0:
            return FAILURE
        return checked_result(json.loads(output.read_text("utf-8-sig")))


def run_once(post, runner=execute):
    job = post("claim", {}).get("job")
    if job is None:
        return
    ticket = {"requestId": str(UUID(job["requestId"]))}
    try:
        result = runner(post, ticket)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError):
        result = FAILURE
    # Retry delivery of the same receipt only. Do not repeat the mailbox run.
    for attempt in range(4):
        try:
            post("finish", {**ticket, **result})
            return
        except urllib.error.HTTPError as error:
            if error.code == 409:
                return
            if error.code < 500 or attempt == 3:
                raise
        except OSError:
            if attempt == 3:
                raise
        time.sleep(5)


if __name__ == "__main__":
    try:
        run_once(api_client())
    except (KeyError, OSError, ValueError) as error:
        print(f"Desk sync worker unavailable ({type(error).__name__}).", file=sys.stderr)
        sys.exit(1)
