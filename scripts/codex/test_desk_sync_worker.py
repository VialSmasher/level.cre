import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import desk_sync_worker as worker


class WorkerTest(unittest.TestCase):
    def test_uses_saved_workflow_and_reports_only_counts(self):
        ticket = {"requestId": str(uuid4())}
        calls = []
        expected = {"state": "complete", "reason": "none", "recorded": 4, "needsReview": 1, "queued": 0}
        def post(route, data):
            calls.append((route, data))
            return {"job": ticket} if route == "claim" else None

        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            script = home / "scripts/codex/record-levelcre-sales-activity.ps1"
            script.parent.mkdir(parents=True)
            script.touch()
            config = home / ".codex/automations" / worker.AUTOMATION / "automation.toml"
            config.parent.mkdir(parents=True)
            config.write_text('\n'.join([
                'id = "evening-level-cre-sync"', 'execution_environment = "local"',
                'model = "test-model"', 'reasoning_effort = "medium"', 'prompt = "saved evening policy"',
                'cwds = [' + json.dumps(str(home)) + ']',
            ]), encoding="utf-8")
            class Child:
                def wait(child, timeout):
                    return 0
                def poll(child):
                    return 0
            def start(args, **kwargs):
                self.assertEqual(kwargs["cwd"], home)
                self.assertIn("saved evening policy", kwargs["stdin"].read().decode())
                self.assertIn("test-model", args)
                Path(args[args.index("--output-last-message")+1]).write_text(json.dumps(expected), encoding="utf-8")
                return Child()
            with patch.object(Path, "home", return_value=home), patch.object(worker.shutil, "which", return_value=str(script)), patch.object(worker.subprocess, "Popen", side_effect=start):
                worker.run_once(post)
        self.assertEqual(calls, [("claim", {}), ("finish", {**ticket, **expected})])

    def test_rejects_private_text_and_false_completion(self):
        valid = {**worker.FAILURE, "state": "complete", "reason": "none"}
        for invalid in ({**valid, "message": "private"}, {**valid, "queued": 1}, {**valid, "recorded": True}):
            with self.assertRaises(ValueError):
                worker.checked_result(invalid)

    def test_idle_poll_does_no_work(self):
        worker.run_once(lambda action, data: {"job": None}, lambda *args: self.fail("unexpected run"))


if __name__ == "__main__":
    unittest.main()
