"""The Orchestrator reading a request: task + molecule, with and without an LLM."""
import pytest

from backend.mas import intent, llm
from backend.molrepr import resolve

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"


@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    monkeypatch.setenv("VESYN_LLM", "none")


@pytest.mark.parametrize("prompt, task, molecule", [
    ("CCO", "retrosynthesis", "CCO"),
    ("aspirin", "retrosynthesis", "aspirin"),
    ("aspirin?", "retrosynthesis", "aspirin"),
    (f"plan a synthesis of {ASPIRIN}", "retrosynthesis", ASPIRIN),
    ("how to make paracetamol?", "retrosynthesis", "paracetamol"),
    ("What is the solubility of ibuprofen?", "solubility", "ibuprofen"),
    ("find drugs similar to caffeine", "analogues", "caffeine"),
    ("logP and molecular weight of CCO", "properties", "CCO"),
    ("tell me about metformin", "profile", "metformin"),
    ("predict the toxicity of aspirin", "unsupported", "aspirin"),
    ("I need NO help", "unsupported", None),  # "NO" / "I" are prose, not SMILES
])
def test_rules(prompt, task, molecule):
    got = intent.interpret(prompt)
    assert (got["task"], got["method"]) == (task, "rules")
    if molecule:
        assert got["molecule"] == molecule


def test_drawn_structure_wins_over_the_text():
    got = intent.interpret("solubility of this one", smiles=ASPIRIN)
    assert got["task"] == "solubility" and got["molecule"] == ASPIRIN
    assert intent.interpret("", smiles=ASPIRIN)["task"] == "retrosynthesis"


def test_llm_reads_the_task_but_may_only_copy_the_molecule(monkeypatch):
    monkeypatch.setenv("VESYN_LLM", "ollama:test")
    reply = {"text": '{"task": "solubility", "molecule": "ibuprofen"}'}

    def fake(system, prompt, **kw):
        return {"provider": "ollama", "model": "test", **reply}

    monkeypatch.setattr(llm, "generate", fake)
    got = intent.interpret("how well does ibuprofen dissolve in water")
    assert got == {"task": "solubility", "molecule": "ibuprofen", "method": "llm:ollama:test",
                   "supported": list(intent.TASKS)}
    # an invented structure is not in the prompt, so it is not trusted
    reply["text"] = '{"task": "solubility", "molecule": "CC(C)Cc1ccc(C(C)C(=O)O)cc1"}'
    assert intent.interpret("solubility of ibuprofen, please")["molecule"] == "ibuprofen"
    # a bare name never reaches the LLM (qwen3 was seen to call "aspirin" a profile)
    reply["text"] = '{"task": "profile", "molecule": "aspirin"}'
    assert intent.interpret("aspirin")["task"] == "retrosynthesis"
    # garbage falls back to the rules
    reply["text"] = "sorry, I cannot help"
    assert intent.interpret("solubility of ibuprofen")["method"] == "rules"


def test_direct_answer():
    target = {"canonical_smiles": "CCO", "matched_name": "ethanol"}
    profile = {
        "properties": {"formula": "C2H6O", "molecular_weight": 46.07, "logp": -0.0014, "tpsa": 20.23,
                       "hbd": 1, "hba": 1, "lipinski_violations": 0},
        "solubility": {"predicted_value": 1.1, "units": "log10(mol/L)",
                       "prediction_interval": {"lower": 0.2, "upper": 2.0},
                       "applicability": {"structurally_familiar": False}},
    }
    s = intent.direct_answer("solubility", target, profile)
    assert s.startswith("ethanol: predicted aqueous solubility 1.1") and "0.2 to 2.0" in s
    assert "caution" in s and "MW" not in s
    assert "MW 46.07" in intent.direct_answer("properties", target, profile)
    assert "unavailable (boom)" in intent.direct_answer(
        "analogues", target, {"analogues": {"error": "boom"}})


@pytest.mark.skipif(not resolve.CHEMBL_TSV.exists(), reason="local ChEMBL file not downloaded")
def test_approved_drug_names_resolve_offline(monkeypatch):
    def no_network(name):
        raise AssertionError(f"PubChem was called for {name!r}")

    monkeypatch.setattr(resolve, "_lookup_pubchem", no_network)
    got = resolve.resolve("Ibuprofen")
    assert (got.source, got.matched_name) == ("chembl", "Ibuprofen")
    assert got.canonical_smiles == "CC(C)Cc1ccc(C(C)C(=O)O)cc1"
    # the international name, where ChEMBL files the drug under its US name
    assert resolve.resolve("paracetamol").matched_name == "Acetaminophen"
