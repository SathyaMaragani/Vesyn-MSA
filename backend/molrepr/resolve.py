"""Resolve a user's text into a structure.

People type "glucose", not "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O". Without this
every name-shaped query fails as an unparseable SMILES, which reads as the search
being broken rather than as the wrong input format.

SMILES is tried first, locally, then approved-drug names from the local ChEMBL
file. Only other names hit the network (PubChem).
"""
from __future__ import annotations

import csv
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from functools import cache
from pathlib import Path

from backend.molrepr import service

PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{}/property/SMILES,Title/JSON"
# Approved-drug names, offline. Written by scripts/download_chembl.py.
CHEMBL_TSV = Path(__file__).resolve().parents[2] / "data/external/chembl/chembl_approved.tsv"
TIMEOUT_SECONDS = 12

# Names are stable, so one lookup per name per process is plenty.
_cache: dict[str, "Resolution"] = {}


class ResolutionError(ValueError):
    """Neither a parseable structure nor a resolvable name -> HTTP 400/404."""


@dataclass
class Resolution:
    query: str
    canonical_smiles: str
    #  "smiles"  - the input already was a structure
    #  "chembl"  - an approved-drug name, found locally
    #  "pubchem" - looked up by name
    source: str
    matched_name: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _lookup_pubchem(name: str) -> Resolution:
    url = PUBCHEM.format(urllib.parse.quote(name, safe=""))
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as err:
        err.close()  # an HTTPError holds the open response; do not leak the socket
        if err.code == 404:
            raise ResolutionError(
                f"{name!r} is not a valid SMILES and PubChem has no compound by that name"
            ) from err
        raise ResolutionError(f"PubChem lookup failed for {name!r}: HTTP {err.code}") from err
    except Exception as err:  # DNS, TLS, timeout - offline is a normal local state
        raise ResolutionError(
            f"{name!r} is not a valid SMILES, and the PubChem name lookup could not "
            f"be reached ({type(err).__name__}). Paste a SMILES instead."
        ) from err

    properties = payload.get("PropertyTable", {}).get("Properties", [])
    if not properties or not properties[0].get("SMILES"):
        raise ResolutionError(f"PubChem returned no structure for {name!r}")

    entry = properties[0]
    # Canonicalize through our own service so a resolved name and a pasted SMILES
    # land on exactly the same string.
    return Resolution(
        query=name,
        canonical_smiles=service.canonicalize(entry["SMILES"]),
        source="pubchem",
        matched_name=entry.get("Title") or name,
    )


@cache
def _local_names() -> dict[str, tuple[str, str]]:
    """pref_name (lowercase) -> (name, SMILES) for the local ChEMBL approved drugs; {} without the file."""
    try:
        with CHEMBL_TSV.open(encoding="utf-8", newline="") as fh:
            return {
                row["pref_name"].lower(): (row["pref_name"].title(), row["smiles"])
                for row in csv.DictReader(fh, delimiter="\t")
                if row.get("pref_name") and row.get("smiles")
            }
    except OSError:
        return {}


# International (INN/BAN) names whose ChEMBL preferred name is the US one.
_ALIASES = {
    "paracetamol": "acetaminophen", "salbutamol": "albuterol", "adrenaline": "epinephrine",
    "noradrenaline": "norepinephrine", "lignocaine": "lidocaine", "glibenclamide": "glyburide",
    "pethidine": "meperidine", "rifampicin": "rifampin", "frusemide": "furosemide",
    "amoxycillin": "amoxicillin", "aciclovir": "acyclovir", "sulphasalazine": "sulfasalazine",
    "thyroxine": "levothyroxine", "bendrofluazide": "bendroflumethiazide",
    "colecalciferol": "cholecalciferol",
}


def _lookup_name(name: str) -> Resolution:
    """A name -> structure: approved drugs locally (offline, instant), anything else via PubChem."""
    key = name.strip().lower()
    hit = _local_names().get(_ALIASES.get(key, key))
    if hit:
        try:
            return Resolution(query=name, canonical_smiles=service.canonicalize(hit[1]),
                              source="chembl", matched_name=hit[0])
        except service.InvalidSmilesError:
            pass
    return _lookup_pubchem(name)


def _extract_candidates(text: str) -> list[str]:
    """Extract candidate molecule names or SMILES from freeform user queries."""
    import re
    candidates: list[str] = []

    stopwords = {
        "investigate", "propose", "synthesize", "synthesis", "check", "search",
        "analyze", "route", "target", "molecule", "verify", "routes", "acid",
        "green", "reaction", "feasibility", "pathway", "screening", "disconnections",
        "intermediates", "solubility", "evidence", "catalytic", "compound",
        "structure", "chemical", "drugs", "active", "precursor", "precursors",
    }

    # 1. Quoted terms, e.g. 'paracetamol' or "aspirin"
    for match in re.findall(r'["\']([A-Za-z0-9@+\-\[\]()=#/\\]+)["\']', text):
        clean = match.strip()
        if clean.lower() not in stopwords:
            candidates.append(clean)

    # 2. Terms inside parentheses, e.g. Aspirin (Acetylsalicylic Acid)
    for match in re.findall(r'\(([A-Za-z0-9@+\-\[\]()=#/\\]+)\)', text):
        clean = match.strip()
        if clean.lower() not in stopwords:
            candidates.append(clean)

    # 3. Explicit keywords: target molecule: X, route for X, synthesize X
    for match in re.findall(
        r'(?:target\s+molecule|route\s+for|synthesize|synthesis\s+of|investigate\s+molecule|investigate)\s*[:\s]+([A-Za-z0-9@+\-\[\]()=#/\\]+)',
        text,
        re.IGNORECASE,
    ):
        clean = match.strip()
        if clean.lower() not in stopwords:
            candidates.append(clean)

    # 4. Any words or tokens that look like SMILES or capitalized chemical names
    tokens = re.split(r'[\s,;:!?]+', text)
    for token in tokens:
        clean = token.strip("().,;:\"'")
        if not clean or len(clean) < 3:
            continue
        # SMILES syntax markers
        if any(c in clean for c in "=@#()[]/\\"):
            candidates.append(clean)
        # Capitalized words (e.g. Paracetamol, Ibuprofen, Aspirin)
        elif clean[0].isupper() and clean.lower() not in stopwords:
            candidates.append(clean)

    # De-duplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for c in candidates:
        low = c.lower()
        if low not in seen and low not in stopwords and len(c) >= 2:
            seen.add(low)
            unique.append(c)
    return unique


def resolve(query: str) -> Resolution:
    """Text -> canonical SMILES. Tries to parse as a structure before any lookup."""
    text = (query or "").strip()
    if not text:
        raise ResolutionError("query must be a non-empty string")

    # 1. Is the whole input directly a valid SMILES?
    try:
        return Resolution(
            query=text, canonical_smiles=service.canonicalize(text), source="smiles"
        )
    except service.InvalidSmilesError:
        pass

    # 2. In cache already?
    cached = _cache.get(text.lower())
    if cached is not None:
        return cached

    # 3. If multi-word phrase, extract molecule candidates first
    if " " in text:
        candidates = _extract_candidates(text)
        for cand in candidates:
            # Maybe candidate is a valid SMILES
            try:
                can_smiles = service.canonicalize(cand)
                res = Resolution(query=text, canonical_smiles=can_smiles, source="smiles", matched_name=cand)
                _cache[text.lower()] = res
                return res
            except service.InvalidSmilesError:
                pass

            # Check cache for candidate
            cand_cached = _cache.get(cand.lower())
            if cand_cached is not None:
                res = Resolution(
                    query=text,
                    canonical_smiles=cand_cached.canonical_smiles,
                    source=cand_cached.source,
                    matched_name=cand_cached.matched_name,
                )
                _cache[text.lower()] = res
                return res

            # Try looking the candidate up by name
            try:
                cand_res = _lookup_name(cand)
                _cache[cand.lower()] = cand_res
                res = Resolution(
                    query=text,
                    canonical_smiles=cand_res.canonical_smiles,
                    source=cand_res.source,
                    matched_name=cand_res.matched_name,
                )
                _cache[text.lower()] = res
                return res
            except ResolutionError:
                continue

    # 4. Fall back to whole query lookup
    resolution = _lookup_name(text)
    _cache[text.lower()] = resolution
    return resolution
