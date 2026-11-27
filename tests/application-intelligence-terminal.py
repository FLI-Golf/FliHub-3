import errno
import os
import pty
import re
import select
import subprocess
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ["node", "tools/application/console.mjs"]
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")

ENV = {
    **os.environ,
    "FLIHUB_INTELLIGENCE_PROVIDER": "jev",
    "FLIHUB_INTELLIGENCE_ENABLED": "false",
    "FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE": "60",
    "TYPESAFE_API_KEY": "offline-security-test-not-a-real-key",
}

ENV.pop("NODE_OPTIONS", None)


class Terminal:
    def __init__(self):
        self.pid, self.fd = pty.fork()
        self.reaped = False

        if self.pid == 0:
            os.chdir(ROOT)
            os.execvpe(COMMAND[0], COMMAND, ENV)

        self.pending = b""

    def send(self, value):
        os.write(self.fd, (value + "\n").encode())

    def expect(self, marker, timeout=10):
        target = marker.encode()
        deadline = time.monotonic() + timeout

        while target not in self.pending:
            remaining = deadline - time.monotonic()

            if remaining <= 0:
                raise AssertionError(
                    f"Timed out waiting for {marker!r}: "
                    f"{self.pending[-2000:]!r}"
                )

            ready, _, _ = select.select(
                [self.fd], [], [], remaining
            )

            if not ready:
                continue

            try:
                data = os.read(self.fd, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b""

            if not data:
                raise AssertionError(
                    f"Terminal closed before {marker!r}"
                )

            self.pending += data

        end = self.pending.index(target) + len(target)
        result = self.pending[:end]
        self.pending = self.pending[end:]

        return ANSI.sub(
            "", result.decode(errors="replace")
        )

    def menu(self):
        return self.expect("Select an option: ")

    def choose(self, value):
        self.send(str(value))

    def assess(self, objective=1, scenario=1):
        self.choose(objective)
        self.expect("Select a scenario: ")
        self.choose(scenario)
        return self.menu()

    def resources(self):
        self.choose(6)
        return self.menu()

    def finish(self):
        self.expect(
            "Jev application intelligence session ended."
        )

        deadline = time.monotonic() + 5

        while time.monotonic() < deadline:
            pid, status = os.waitpid(self.pid, os.WNOHANG)

            if pid:
                self.reaped = True
                return os.waitstatus_to_exitcode(status)

            time.sleep(0.02)

        raise AssertionError("Terminal did not exit")

    def close(self):
        if not self.reaped:
            try:
                os.kill(self.pid, 9)
            except ProcessLookupError:
                pass

            try:
                os.waitpid(self.pid, 0)
            except ChildProcessError:
                pass

            self.reaped = True

        os.close(self.fd)


class ApplicationTerminalTests(unittest.TestCase):
    def terminal(self):
        terminal = Terminal()
        self.addCleanup(terminal.close)

        output = terminal.menu()

        self.assertIn("Offline mock mode", output)
        self.assertIn("execution disabled", output)

        return terminal

    def test_noninteractive_execution_rejected(self):
        result = subprocess.run(
            COMMAND,
            cwd=ROOT,
            env=ENV,
            input="1\n1\n",
            capture_output=True,
            text=True,
            timeout=10,
        )

        self.assertEqual(result.returncode, 1)
        self.assertIn(
            "requires an interactive terminal",
            result.stderr,
        )

    def test_environment_isolation_and_empty_session(self):
        terminal = self.terminal()
        output = terminal.resources()

        for expected in [
            "Provider: offline mock",
            "Assessment attempts: 0",
            "Configured rate limit: 10 requests per minute",
            "Configured concurrency limit: 1",
            "Paid provider requests: 0",
            "Blocked provider fetch attempts: 0",
            "History retention limit: 50 responses",
            "Persistent session storage: disabled",
        ]:
            self.assertIn(expected, output)

        terminal.choose(7)
        self.assertEqual(terminal.finish(), 0)

    def test_invalid_selection_and_cancellation(self):
        terminal = self.terminal()

        terminal.choose(99)
        self.assertIn(
            "Invalid selection",
            terminal.menu(),
        )

        terminal.choose(1)
        terminal.expect("Select a scenario: ")
        terminal.choose(99)

        self.assertIn(
            "Invalid scenario selection",
            terminal.expect("Select a scenario: "),
        )

        terminal.choose(0)
        terminal.menu()

        self.assertIn(
            "Assessment attempts: 0",
            terminal.resources(),
        )

    def test_capability_and_scenario_browsing(self):
        terminal = self.terminal()

        terminal.choose(3)
        output = terminal.menu()

        self.assertIn("APPLICATION CAPABILITIES", output)
        self.assertIn("recommendation-only", output)
        self.assertIn("not-implemented", output)

        terminal.choose(4)
        output = terminal.menu()

        self.assertIn(
            "REGISTERED SYNTHETIC SCENARIOS",
            output,
        )
        self.assertIn("Spring Invitational", output)
        self.assertIn("Information Missing", output)

        self.assertIn(
            "Assessment attempts: 0",
            terminal.resources(),
        )

    def test_advisory_and_clarification(self):
        terminal = self.terminal()

        output = terminal.assess(1, 1)
        self.assertIn("Plan group assignments", output)
        self.assertIn("2.00 / 4", output)
        self.assertIn(
            "Not an official completion measurement",
            output,
        )

        output = terminal.assess(1, 5)
        self.assertIn(
            "Review event prerequisites",
            output,
        )

        output = terminal.assess(2, 6)
        self.assertIn("CLARIFICATION NEEDED", output)
        self.assertIn(
            "Registered participants: unknown",
            output,
        )
        self.assertNotIn("QUALITATIVE READINESS", output)

        output = terminal.resources()
        self.assertIn("Assessment attempts: 3", output)
        self.assertIn("Advisory responses: 3", output)
        self.assertIn(
            "Blocked provider fetch attempts: 0",
            output,
        )

    def test_history_replay_does_not_dispatch(self):
        terminal = self.terminal()
        terminal.assess()

        terminal.choose(5)
        output = terminal.expect(
            "Select a response to review: "
        )

        self.assertIn("Total session responses: 1", output)

        terminal.choose(99)
        self.assertIn(
            "Invalid history selection",
            terminal.expect(
                "Select a response to review: "
            ),
        )

        terminal.choose(1)
        output = terminal.menu()

        self.assertIn("RECORDED ADVISORY RESPONSE", output)
        self.assertIn(
            "no new assessment requested",
            output,
        )
        self.assertIn("Plan group assignments", output)

        output = terminal.resources()

        self.assertIn("Assessment attempts: 1", output)
        self.assertIn("Recorded responses: 1", output)

    def test_rate_limit_and_bounded_history(self):
        terminal = self.terminal()

        # First response is distinctive, allowing eviction
        # to be checked independently of response counts.
        terminal.assess(2, 6)

        for _ in range(9):
            terminal.assess(1, 1)

        output = terminal.assess(1, 1)

        self.assertIn(
            "Assessment status: unavailable",
            output,
        )
        self.assertIn("Reason: rate", output)

        for _ in range(41):
            terminal.assess(1, 1)

        output = terminal.resources()

        for expected in [
            "Assessment attempts: 52",
            "Recorded responses: 52",
            "Retained responses: 50",
            "Discarded responses: 2",
            "Advisory responses: 10",
            "Unavailable responses: 42",
            "Rate-limited responses: 42",
            "Blocked provider fetch attempts: 0",
        ]:
            self.assertIn(expected, output)

        terminal.choose(5)
        output = terminal.expect(
            "Select a response to review: "
        )

        self.assertIn("Retained responses: 50 / 50", output)
        self.assertIn(
            "Older responses have been discarded",
            output,
        )
        self.assertNotIn("Information Missing", output)

        terminal.choose(0)
        terminal.menu()

    def test_interrupt_from_scenario_selection(self):
        terminal = self.terminal()

        terminal.choose(1)
        terminal.expect("Select a scenario: ")

        os.write(terminal.fd, b"\x03")

        self.assertEqual(terminal.finish(), 0)

    def test_new_session_has_no_previous_history(self):
        terminal = self.terminal()
        terminal.assess()
        terminal.choose(7)
        self.assertEqual(terminal.finish(), 0)

        fresh = self.terminal()
        output = fresh.resources()

        self.assertIn("Assessment attempts: 0", output)
        self.assertIn("Recorded responses: 0", output)
        self.assertIn("Retained responses: 0", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
