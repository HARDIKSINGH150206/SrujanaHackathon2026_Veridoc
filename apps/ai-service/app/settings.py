"""Typed VeriDoc settings for the AI service, read from the environment.

Pure over an env mapping so tests pass their own. SHARE_LINK_TTL_HOURS is a
web-app setting and is not read here. Nothing here is a secret.
"""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass

DEFAULT_DEMO_MODE_BADGE = "Demo mode: recorded model output"
DEFAULT_PLAYBOOK_DIR = "playbooks"
DEFAULT_DATA_DIR = "data"
MODEL_MODES = ("fake", "local")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class SettingsError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    model_mode: str
    model_file_path: str | None
    model_sha256: str | None
    llama_server_path: str | None
    playbook_dir: str
    redaction_rules_file: str | None
    data_dir: str
    demo_mode_badge: str


def _read(env: Mapping[str, str], name: str) -> str | None:
    raw = env.get(name, "").strip()
    return raw or None


def settings_from_env(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env

    mode = _read(env, "MODEL_MODE") or "fake"
    if mode not in MODEL_MODES:
        raise SettingsError(f'MODEL_MODE must be "fake" or "local", got "{mode}".')

    sha = _read(env, "MODEL_SHA256")
    if sha is not None:
        sha = sha.lower()
        if not _SHA256_RE.match(sha):
            raise SettingsError("MODEL_SHA256 must be 64 hexadecimal characters.")

    model_file = _read(env, "MODEL_FILE_PATH")
    llama_server = _read(env, "LLAMA_SERVER_PATH")
    if mode == "local":
        for name, value in (("MODEL_FILE_PATH", model_file), ("LLAMA_SERVER_PATH", llama_server)):
            if value is None:
                raise SettingsError(f"{name} is required when MODEL_MODE=local.")

    return Settings(
        model_mode=mode,
        model_file_path=model_file,
        model_sha256=sha,
        llama_server_path=llama_server,
        playbook_dir=_read(env, "PLAYBOOK_DIR") or DEFAULT_PLAYBOOK_DIR,
        redaction_rules_file=_read(env, "REDACTION_RULES_FILE"),
        data_dir=_read(env, "DATA_DIR") or DEFAULT_DATA_DIR,
        demo_mode_badge=_read(env, "DEMO_MODE_BADGE") or DEFAULT_DEMO_MODE_BADGE,
    )
