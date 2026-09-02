import pytest
from pydantic import ValidationError

from app.schemas import RuntimeProfileCreate, SessionExecutionImport, normalize_model_config, normalize_workspace_assignment


def test_model_config_accepts_shared_limits_hierarchical_ref_and_safe_environment():
    value = normalize_model_config({
        "provider": "openai",
        "modelId": "gpt",
        "contextWindow": 1024,
        "maxTokens": 1,
        "apiKeyEnv": "LOCAL_MODEL_API_KEY",
    })
    assert value["contextWindow"] == 1024
    assert value["apiKeyEnv"] == "LOCAL_MODEL_API_KEY"
    assert normalize_model_config({"provider": "openai", "modelId": "gpt", "credentialRef": "keychain:team/model/key-1"})["credentialRef"] == "keychain:team/model/key-1"
    astral = normalize_model_config({"provider": "😀" * 50, "modelId": "😀" * 150})
    assert astral["provider"] == "😀" * 50


@pytest.mark.parametrize("value", [
    {"provider": "openai", "modelId": "gpt", "contextWindow": 1023},
    {"provider": "openai", "modelId": "gpt", "contextWindow": 2**53},
    {"provider": "openai", "modelId": "gpt", "maxTokens": 2**53},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://models.example/" + "x" * 4096},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://models.example/" + "😀" * 2048},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://models.example:99999/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://%zz/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://[v1.foo]/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://256.1.1.1/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://127.0.0.999/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://example.123/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://foo.1/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://foo.0x1/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://0x100000000/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://1.2.3.0x100/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://foo%3Abar/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://@[v1.foo]/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://:@[v1.foo]/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://a\u200cb.com/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://a\u200db.com/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://a\u0378b.com/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://a\u2024b.com/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://﹇v1.foo﹈/v1"},
    {"provider": "openai", "modelId": "gpt", "baseUrl": "https://models.\nexample/v1"},
    {"provider": "openai", "modelId": "gpt", "apiKeyEnv": "WEWORK_HOST_TOKEN"},
    {"provider": "openai", "modelId": "gpt", "apiKeyEnv": "RANDOM_SECRET"},
    {"provider": "openai", "modelId": "gpt", "credentialRef": "vault:model", "apiKeyEnv": "WEWORK_MODEL_API_KEY"},
    {"provider": "😀" * 51, "modelId": "gpt"},
    {"provider": "openai", "modelId": "😀" * 151},
    {"provider": "\ufeff", "modelId": "gpt"},
    {"provider": "openai", "modelId": "\ufeff"},
])
def test_model_config_rejects_values_not_accepted_by_local_host(value):
    with pytest.raises(ValidationError):
        normalize_model_config(value)


@pytest.mark.parametrize("model, value", [
    (RuntimeProfileCreate, {"name": "   ", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (RuntimeProfileCreate, {"name": "Pi", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "systemPrompt": "x" * 100001}),
    (RuntimeProfileCreate, {"name": "😀" * 101, "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (RuntimeProfileCreate, {"name": "\ufeff", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (RuntimeProfileCreate, {"name": "Pi", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "systemPrompt": "😀" * 50001}),
    (SessionExecutionImport, {"id": "session", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "systemPrompt": "bad\x00prompt", "profileRevision": 1}),
    (SessionExecutionImport, {"id": "session", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "profileRevision": 2**53}),
    (SessionExecutionImport, {"id": "😀" * 101, "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (SessionExecutionImport, {"id": "session", "name": "😀" * 101, "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (SessionExecutionImport, {"id": "session", "name": "\ufeff", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (SessionExecutionImport, {"id": "\ufeff", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}}),
    (SessionExecutionImport, {"id": "session", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "sourceProfileId": "\ufeff"}),
    (SessionExecutionImport, {"id": "session", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "modelCatalogId": "\ufeff"}),
    (SessionExecutionImport, {"id": "session", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "sourceProfileId": "😀" * 101}),
    (SessionExecutionImport, {"id": "session", "name": "Session", "adapter": "pi", "model": {"provider": "pi", "modelId": "default"}, "modelCatalogId": "😀" * 101}),
])
def test_runtime_envelopes_reject_values_the_host_cannot_prepare(model, value):
    with pytest.raises(ValidationError):
        model.model_validate(value)


@pytest.mark.parametrize("value", [
    {"kind": "local", "rootPath": "/" + "😀" * 2048},
    {"kind": "ssh", "host": "gpu.example.com", "port": 22, "username": "alice", "rootPath": "/" + "😀" * 2048, "credentialRef": "vault:ssh/team"},
])
def test_workspace_paths_use_the_host_utf16_length_boundary(value):
    with pytest.raises(ValidationError):
        normalize_workspace_assignment(value)
