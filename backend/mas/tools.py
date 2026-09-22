"""Every scientific capability, registered as a governed Vesyn tool.

Nothing here is new chemistry: each tool wraps a chemistry service (inherited
from RamChems) that is already tested. The value added is the gateway around them -
policy, audit and events - see gateway.py.

Route-tree tools take {"tree": <route tree>} and return {"tree": <enriched
copy>, "summary": {...}}, so the validator can chain them.
"""
from __future__ import annotations

import copy
from collections import Counter
from functools import cache

from rdkit import Chem
from rdkit.Chem import Crippen, Descriptors, Lipinski, rdMolDescriptors

from backend.mas import intent, llm
from backend.mas.gateway import PolicyError, Tool, register
from backend.molrepr import resolve as resolver
from backend.molrepr import search, service
from backend.retrosynthesis.service import (
    MAX_ITERATION_LIMIT,
    _enrich_with_evidence,
    _enrich_with_validation,
    _evidence_summary,
)

# Bound by the API lifespan once the heavy models have loaded.
_retro = None
_qsar = None


def bind(retro=None, qsar=None) -> None:
    global _retro, _qsar
    _retro, _qsar = retro, qsar


def iter_steps(node: dict, depth: int = 0):
    """(product_smiles, reaction, depth) for every reaction in a route tree."""
    for reaction in node.get("reactions", []):
        yield node["molecule_smiles"], reaction, depth
        for child in reaction.get("reactants", []):
            yield from iter_steps(child, depth + 1)


def leaves(node: dict):
    if not node.get("reactions"):
        yield node
    for reaction in node.get("reactions", []):
        for child in reaction.get("reactants", []):
            yield from leaves(child)


# --- policies ------------------------------------------------------------

def _needs_smiles(args: dict) -> None:
    if not isinstance(args.get("smiles"), str) or not args["smiles"].strip():
        raise PolicyError("smiles must be a non-empty string")


def _needs_query(args: dict) -> None:
    if not isinstance(args.get("query"), str) or not args["query"].strip():
        raise PolicyError("query must be a non-empty string")


def _needs_prompt(args: dict) -> None:
    if not isinstance(args.get("prompt"), str) or not args["prompt"].strip():
        raise PolicyError("prompt must be a non-empty string")


def _needs_request(args: dict) -> None:
    if not any(isinstance(args.get(k), str) and args[k].strip() for k in ("prompt", "smiles")):
        raise PolicyError("give a prompt or a drawn structure")


def _needs_tree(args: dict) -> None:
    tree = args.get("tree")
    if not isinstance(tree, dict) or "molecule_smiles" not in tree:
        raise PolicyError("tree must be a route tree with molecule_smiles")


def _search_budget(args: dict) -> None:
    _needs_smiles(args)
    limit, top_n = args.get("iteration_limit", 100), args.get("top_n", 5)
    if not (isinstance(limit, int) and 1 <= limit <= MAX_ITERATION_LIMIT):
        raise PolicyError(f"iteration_limit must be an int in 1..{MAX_ITERATION_LIMIT}")
    if not (isinstance(top_n, int) and 1 <= top_n <= 25):
        raise PolicyError("top_n must be an int in 1..25")


# --- implementations -----------------------------------------------------

def _resolve(args: dict) -> dict:
    return resolver.resolve(args["query"]).to_dict()


def _represent(args: dict) -> dict:
    smiles = args["smiles"]
    mol = service.parent(service.parse(smiles))
    props = {
        "canonical_smiles": service.canonicalize(smiles),
        "inchikey": service.to_inchikey(smiles),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "molecular_weight": round(Descriptors.MolWt(mol), 3),
        "logp": round(Crippen.MolLogP(mol), 3),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 2),
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),
        "rings": rdMolDescriptors.CalcNumRings(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "stereocentres": len(Chem.FindMolChiralCenters(mol, includeUnassigned=True)),
    }
    props["lipinski_violations"] = sum([
        props["molecular_weight"] > 500, props["logp"] > 5, props["hbd"] > 5, props["hba"] > 10,
    ])
    return props


def _similar(args: dict) -> dict:
    hits = search.similarity_search(args["smiles"], top_n=args.get("top_n", 5))
    return {
        "library": "ChEMBL approved small molecules (local)",
        "hits": [
            {"molecule_id": m["id"], "smiles": m["canonical_smiles"], "tanimoto": round(s, 4)}
            for m, s in hits
        ],
    }


def _solubility(args: dict) -> dict:
    if _qsar is None:
        raise RuntimeError("QSAR models are not loaded")
    return _qsar.predict(smiles=args["smiles"], property_name="solubility")


def _plan(args: dict) -> dict:
    if _retro is None:
        raise RuntimeError("AiZynthFinder is not loaded")
    return _retro.plan_routes(
        smiles=args["smiles"],
        top_n=args.get("top_n", 5),
        iteration_limit=args.get("iteration_limit", 100),
    )


@cache
def _structural_model():
    from backend.retrosynthesis.validation import RDKitTemplateReversalModel
    return RDKitTemplateReversalModel()


@cache
def _learned_model():
    import os
    from backend.retrosynthesis.validation import MicroserviceLearnedForwardModel
    return MicroserviceLearnedForwardModel(
        os.environ.get("VESYN_FORWARD_URL", "http://localhost:8435/predict")
    )


@cache
def _conditions():
    from backend.conditions.service import ConditionsService
    return ConditionsService()


def _statuses(tree: dict, key: str) -> dict:
    return dict(Counter(
        (r.get(key) or {}).get("status", "MISSING") for _, r, _ in iter_steps(tree)
    ))


def _structural(args: dict) -> dict:
    tree = copy.deepcopy(args["tree"])
    _enrich_with_validation(tree, _structural_model(), None)
    return {"tree": tree, "summary": _statuses(tree, "structural_validation")}


def _forward(args: dict) -> dict:
    tree = copy.deepcopy(args["tree"])
    _enrich_with_validation(tree, None, _learned_model())
    return {"tree": tree, "summary": _statuses(tree, "forward_validation")}


def _evidence(args: dict) -> dict:
    tree = copy.deepcopy(args["tree"])
    _enrich_with_evidence(tree, _conditions())
    return {"tree": tree, "summary": _evidence_summary(tree)}


def _llm(args: dict) -> dict:
    return llm.generate(args["system"], args["prompt"], args.get("max_tokens", 700))


# --- registry ------------------------------------------------------------

register(Tool(
    name="prompt.interpret", version=f"rules+{llm.spec()}",
    description="Read the request: which task, about which molecule. Copies the molecule; never invents a structure.",
    fn=lambda a: intent.interpret(a.get("prompt") or "", a.get("smiles")),
    agents=frozenset({"planner", "user"}), station="command_desk", check=_needs_request,
    summarize=lambda o: {"task": o["task"], "molecule": o["molecule"], "method": o["method"]},
))
register(Tool(
    name="pubchem.resolve", version="pug-rest",
    description="Turn a compound name or SMILES into a canonical structure (names: local ChEMBL, then PubChem).",
    fn=_resolve, agents=frozenset({"planner", "user"}), station="command_desk",
    check=_needs_query,
    summarize=lambda o: {"smiles": o["canonical_smiles"], "source": o["source"]},
))
register(Tool(
    name="rdkit.represent", version="rdkit-2023.09.6",
    description="Canonical SMILES, InChIKey, formula and drug-likeness descriptors.",
    fn=_represent, agents=frozenset({"planner", "research", "user"}), check=_needs_smiles,
    station="chemistry_workstation",
    summarize=lambda o: {k: o[k] for k in ("formula", "molecular_weight", "logp", "lipinski_violations")},
))
register(Tool(
    name="chembl.similarity", version="chembl-37-approved",
    description="Nearest known approved drugs by Morgan-fingerprint Tanimoto.",
    fn=_similar, agents=frozenset({"research", "user"}), check=_needs_smiles, station="library",
    summarize=lambda o: {"hits": len(o["hits"]), "best": o["hits"][0]["tanimoto"] if o["hits"] else None},
))
register(Tool(
    name="qsar.solubility", version="esol-xgb-conformal",
    description="Aqueous solubility (log10 mol/L) with a conformal prediction interval.",
    fn=_solubility, agents=frozenset({"research", "user"}), check=_needs_smiles, station="library",
    summarize=lambda o: {"value": o["predicted_value"], "units": o["units"]},
))
register(Tool(
    name="aizynthfinder.plan", version="aizynthfinder-4.4.1-uspto",
    description="MCTS retrosynthesis to purchasable (ZINC) precursors. Solved routes only.",
    fn=_plan, agents=frozenset({"retro", "user"}), check=_search_budget,
    station="chemistry_workstation",
    summarize=lambda o: {
        "is_solved": o["is_solved"], "routes": o["routes_returned"],
        "search_time_seconds": o["search_time_seconds"],
    },
))
register(Tool(
    name="rdkit.template_validation", version="rdkit-template-reversal-2023.09.3",
    description="Apply each step's template forwards; does it regenerate the product?",
    fn=_structural, agents=frozenset({"validator", "user"}), check=_needs_tree,
    station="validation_station", summarize=lambda o: o["summary"],
))
register(Tool(
    name="reactiont5.forward_validation", version="ReactionT5v2-forward-USPTO_MIT",
    description="Independent learned forward prediction for every step (microservice on :8435).",
    fn=_forward, agents=frozenset({"validator", "user"}), check=_needs_tree,
    station="validation_station", summarize=lambda o: o["summary"],
))
register(Tool(
    name="ord.evidence", version="ord+uspto-lowe",
    description="Literature precedent and reported conditions for every step (ORD, USPTO).",
    fn=_evidence, agents=frozenset({"validator", "user"}), check=_needs_tree, station="library",
    summarize=lambda o: {k: o["summary"][k] for k in ("steps", "evidence_coverage", "distinct_sources")},
))
register(Tool(
    name="llm.generate", version=llm.spec(),
    description="Prose only: critic notes and the final report. Never judges validity.",
    fn=_llm, agents=frozenset({"critic", "evaluator"}), station="report_desk",
    check=_needs_prompt,
    summarize=lambda o: {"provider": o["provider"], "model": o["model"], "chars": len(o["text"])},
))
