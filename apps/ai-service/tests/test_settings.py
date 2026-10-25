import unittest

from app.settings import DEFAULT_DEMO_MODE_BADGE, SettingsError, demo_badge_text, settings_from_env

SHA = "a" * 64


class SettingsFromEnvTests(unittest.TestCase):
    def test_defaults_when_nothing_is_set(self):
        s = settings_from_env({})
        self.assertEqual(s.model_mode, "fake")
        self.assertEqual(s.transcriber_mode, "fake")
        self.assertIsNone(s.model_file_path)
        self.assertIsNone(s.model_sha256)
        self.assertIsNone(s.llama_server_path)
        self.assertEqual(s.playbook_dir, "playbooks")
        self.assertIsNone(s.redaction_rules_file)
        self.assertEqual(s.data_dir, "data")
        self.assertEqual(s.demo_mode_badge, DEFAULT_DEMO_MODE_BADGE)

    def test_blank_values_are_unset(self):
        s = settings_from_env({"MODEL_MODE": " ", "DATA_DIR": "", "MODEL_FILE_PATH": "  "})
        self.assertEqual(s.model_mode, "fake")
        self.assertEqual(s.data_dir, "data")
        self.assertIsNone(s.model_file_path)

    def test_reads_every_value(self):
        s = settings_from_env(
            {
                "MODEL_MODE": "local",
                "MODEL_FILE_PATH": "/m/model.gguf",
                "MODEL_SHA256": SHA.upper(),
                "LLAMA_SERVER_PATH": "/bin/llama-server",
                "PLAYBOOK_DIR": "/p",
                "REDACTION_RULES_FILE": "/r.json",
                "DATA_DIR": "/d",
                "DEMO_MODE_BADGE": "Custom",
            }
        )
        self.assertEqual(s.model_mode, "local")
        self.assertEqual(s.model_file_path, "/m/model.gguf")
        self.assertEqual(s.model_sha256, SHA)  # normalised to lower case
        self.assertEqual(s.llama_server_path, "/bin/llama-server")
        self.assertEqual(s.playbook_dir, "/p")
        self.assertEqual(s.redaction_rules_file, "/r.json")
        self.assertEqual(s.data_dir, "/d")
        self.assertEqual(s.demo_mode_badge, "Custom")

    def test_unknown_mode_is_rejected(self):
        with self.assertRaisesRegex(SettingsError, "MODEL_MODE"):
            settings_from_env({"MODEL_MODE": "remote"})

    def test_malformed_sha256_is_rejected(self):
        with self.assertRaisesRegex(SettingsError, "MODEL_SHA256"):
            settings_from_env({"MODEL_SHA256": "not-a-hash"})

    def test_local_mode_requires_model_file_and_llama_server(self):
        with self.assertRaisesRegex(SettingsError, "MODEL_FILE_PATH"):
            settings_from_env({"MODEL_MODE": "local", "LLAMA_SERVER_PATH": "/bin/x"})
        with self.assertRaisesRegex(SettingsError, "LLAMA_SERVER_PATH"):
            settings_from_env({"MODEL_MODE": "local", "MODEL_FILE_PATH": "/m"})

    def test_transcriber_mode(self):
        self.assertEqual(settings_from_env({"TRANSCRIBER_MODE": "local"}).transcriber_mode, "local")
        self.assertEqual(settings_from_env({"TRANSCRIBER_MODE": " "}).transcriber_mode, "fake")
        with self.assertRaisesRegex(SettingsError, "TRANSCRIBER_MODE"):
            settings_from_env({"TRANSCRIBER_MODE": "cloud"})

    def test_badge_says_what_is_recorded(self):
        both = settings_from_env({})
        self.assertEqual(demo_badge_text(both), "Demo mode: recorded model output and recorded transcript")
        model_real = settings_from_env({"MODEL_MODE": "local", "MODEL_FILE_PATH": "/m", "LLAMA_SERVER_PATH": "/l"})
        self.assertEqual(demo_badge_text(model_real), "Demo mode: recorded transcript")
        only_model = settings_from_env({"TRANSCRIBER_MODE": "local"})
        self.assertEqual(demo_badge_text(only_model), "Demo mode: recorded model output")
        neither = settings_from_env({"MODEL_MODE": "local", "MODEL_FILE_PATH": "/m", "LLAMA_SERVER_PATH": "/l", "TRANSCRIBER_MODE": "local"})
        self.assertIsNone(demo_badge_text(neither))

    def test_a_custom_badge_changes_the_words_but_never_hides_the_badge(self):
        s = settings_from_env({"DEMO_MODE_BADGE": "Recorded"})
        self.assertEqual(demo_badge_text(s), "Recorded")

    def test_fake_mode_needs_no_model_settings(self):
        settings_from_env({"MODEL_MODE": "fake"})


if __name__ == "__main__":
    unittest.main()
