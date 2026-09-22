"""What is the user asking, and about which molecule? The Orchestrator's first job.

A drawn structure always wins over text. The LLM (when configured) reads free
text, but may only COPY the molecule as the user wrote it - names are resolved
from the local ChEMBL list or PubChem and SMILES by RDKit, never by the model.
Without an LLM, keyword rules do the same job less well.
"""
from __future__ import annotations

import json
import re

from rdkit import Chem, rdBase

from backend.mas import llm

#: What Vesyn can do today. Anything else is answered as unsupported, not guessed.
TASKS = {
    "retrosynthesis": "routes to make it from purchasable precursors, validated step by step",
    "profile": "descriptors, predicted solubility and the most similar approved drugs",
    "properties": "RDKit descriptors and drug-likeness",
    "solubility": "predicted aqueous solubility with an interval",
    "analogues": "the most similar approved drugs (ChEMBL)",
}

# First match wins, so the order matters.
_KEYWORDS = (
    ("retrosynthesis", r"retro|synthe|route|precursor|disconnect|\bmake\b|\bprepar"),
    ("solubility", r"solub"),
    ("analogues", r"similar|analog|nearest|look.?alike"),
    ("properties", r"propert|descriptor|logp|weight|\bmw\b|tpsa|lipinski|drug.?like|formula"),
    ("profile", r"profile|tell me about|describe|overview|analy[sz]|characteri"),
)
# "the solubility OF aspirin", "similar TO caffeine", "how to make aspirin"
_AFTER = re.compile(
    r"\b(?:of|for|about|to|on)\s+"
    r"(?:(?:the|a|an|compound|molecule|drug|make|synthesi[sz]e|prepare)\s+)*(.+)$",
    re.I,
)
_FILLER = {
    "please", "plan", "find", "show", "give", "me", "tell", "what", "what's", "whats", "is", "are",
    "the", "a", "an", "predict", "compute", "calculate", "get", "do", "run", "synthesize",
    "synthesise", "synthesis", "route", "routes", "retrosynthesis", "solubility", "properties",
    "profile", "similar", "analogue", "analogues", "analog", "analogs", "drug", "drugs",
    "molecule", "compound", "can", "you", "i", "want", "need", "how", "make", "its", "it's",
}
_PUNCT = "\"'`“”‘’,;:!?"

SYSTEM = (
    "You route requests for a chemistry assistant. Reply with ONE JSON object and nothing else: "
    '{"task": "<task>", "molecule": "<molecule or null>"}. '
    "task is one of: retrosynthesis (how to make or synthesize it, routes, precursors), "
    "properties (descriptors, molecular weight, logP, TPSA, drug-likeness), "
    "solubility (aqueous solubility), analogues (similar or related known drugs), "
    "profile (a general overview, or several of the above), "
    "unsupported (anything else, e.g. toxicity, docking, spectra, prices). "
    "If the request is only a molecule with no task, use retrosynthesis. "
    "molecule is the molecule EXACTLY as written in the request - a SMILES string or a "
    "compound name. Copy it; never convert, complete or invent a structure."
)


def looks_like_smiles(token: str) -> bool:
    # RDKit reads text after a space as the molecule's title, so "I need help" parses.
    if not token or any(c.isspace() for c in token):
        return False
    # Two letters of prose ("NO", "I") parse as SMILES; demand SMILES syntax or length.
    if len(token) < 3 and not re.search(r"[=#()\[\]@+\\/%\d]", token):
        return False
    with rdBase.BlockLogs():
        mol = Chem.MolFromSmiles(token)
    return mol is not None and mol.GetNumAtoms() > 0


def _tokens(prompt: str) -> list[str]:
    return [t.strip(_PUNCT).rstrip(".") for t in prompt.split()]


def _find_smiles(prompt: str) -> str | None:
    return next((t for t in _tokens(prompt) if t and looks_like_smiles(t)), None)


def _name_only(prompt: str) -> bool:
    """True when the whole prompt is just a compound name ("aspirin")."""
    return not _AFTER.search(prompt) and not any(t.lower() in _FILLER for t in _tokens(prompt))


def _find_name(prompt: str) -> str | None:
    m = _AFTER.search(prompt)
    text = re.split(r"[,?!;]", m.group(1) if m else prompt)[0]  # "aspirin, please" -> "aspirin"
    return " ".join(t for t in _tokens(text) if t.lower() not in _FILLER) or None


def _ask_llm(prompt: str) -> dict | None:
    """{task, molecule, method} from the LLM, or None. A missing LLM never fails a run."""
    if llm.spec() == "none":
        return None
    try:
        out = llm.generate(SYSTEM, prompt, max_tokens=120)
        data = json.loads(re.search(r"\{.*\}", out["text"], re.S).group(0))
        task, molecule = data.get("task"), data.get("molecule")
    except Exception:
        return None
    if task not in TASKS and task != "unsupported":
        return None
    molecule = molecule.strip() if isinstance(molecule, str) else None
    # The model may only copy: text that is not in the prompt is not trusted.
    if molecule and molecule.lower() not in prompt.lower():
        molecule = _find_smiles(prompt) or _find_name(prompt)
    return {"task": task, "molecule": molecule or None,
            "method": f"llm:{out['provider']}:{out['model']}"}


def interpret(prompt: str, smiles: str | None = None) -> dict:
    """{task, molecule, method, supported}. `molecule` is text to resolve, or None."""
    prompt = (prompt or "").strip()
    drawn = (smiles or "").strip() or None
    keyword = next((task for task, rx in _KEYWORDS if re.search(rx, prompt, re.I)), None)

    def result(task: str, molecule: str | None, method: str) -> dict:
        return {"task": task, "molecule": drawn or molecule, "method": method,
                "supported": list(TASKS)}

    # A bare structure or one-word name is the classic request: plan its synthesis. Decided here,
    # not by the LLM, which was seen to answer "aspirin" with a profile.
    if not prompt or (keyword is None and len(prompt.split()) == 1):
        return result("retrosynthesis", _tokens(prompt)[0] if prompt else None, "rules")
    parsed = _ask_llm(prompt)
    if parsed:
        return result(parsed["task"], parsed["molecule"], parsed["method"])
    task = keyword or ("retrosynthesis" if _name_only(prompt) else "unsupported")
    return result(task, _find_smiles(prompt) or _find_name(prompt), "rules")


def direct_answer(task: str, target: dict, profile: dict) -> str:
    """One plain sentence answering a non-retrosynthesis request from the tool results."""
    who = target.get("matched_name") or target["canonical_smiles"]
    p, s, a = (profile.get(k) or {} for k in ("properties", "solubility", "analogues"))
    parts = []
    if task in ("properties", "profile") and "formula" in p:
        parts.append(
            f"{p['formula']}, MW {p['molecular_weight']}, logP {p['logp']}, TPSA {p['tpsa']}, "
            f"HBD/HBA {p['hbd']}/{p['hba']}, {p['lipinski_violations']} Lipinski violation(s)")
    if task in ("solubility", "profile") and "predicted_value" in s:
        iv = s.get("prediction_interval") or {}
        span = f" (interval {iv['lower']} to {iv['upper']})" if "lower" in iv else ""
        familiar = (s.get("applicability") or {}).get("structurally_familiar", True)
        caution = "" if familiar else ", outside the model's familiar chemistry - treat with caution"
        parts.append(f"predicted aqueous solubility {s['predicted_value']} {s['units']}{span}{caution}")
    if task in ("analogues", "profile") and "hits" in a:
        hits = a["hits"][:3]
        parts.append("closest approved drugs: " + ", ".join(
            f"{h['smiles']} (Tanimoto {h['tanimoto']})" for h in hits) if hits
            else "no similar approved drug in the local ChEMBL set")
    if parts:
        return f"{who}: " + "; ".join(parts) + "."
    errors = [v["error"] for v in profile.values() if isinstance(v, dict) and "error" in v]
    return f"{who}: the requested result is unavailable ({'; '.join(errors) or 'no data'})."
