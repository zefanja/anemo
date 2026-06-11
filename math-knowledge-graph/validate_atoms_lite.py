#!/usr/bin/env python3
"""
validate_atoms_lite.py – Dependency-armer Validator (nur pyyaml nötig).

Hintergrund: Dieser Validator wurde geschrieben, weil in der Erstellungs-
umgebung jsonschema und networkx nicht installierbar waren. Er bildet die
Kernregeln aus atom.schema.json manuell nach und prüft zusätzlich
Referenz-Integrität und Zyklenfreiheit (eigene DFS statt networkx).

WICHTIG: Dies ersetzt NICHT die Validierung mit dem Original-Schema.
Auf einem Rechner mit Internetzugang bitte zusätzlich ausführen:
    pip install jsonschema pyyaml networkx
    python validate_atoms.py --atoms ./atoms --schema ./atom.schema.json --stats

Verwendung:
    python3 validate_atoms_lite.py --atoms ./atoms
"""

import argparse
import re
import sys
from pathlib import Path

import yaml

ID_PATTERN = re.compile(r"^[a-z][a-z0-9]*(__[a-z][a-z0-9_]*)+$")
TAG_PATTERN = re.compile(r"^[a-zäöüß_0-9]+$")

DOMAINS = {
    "arithmetik", "algebra", "geometrie", "analysis", "stochastik",
    "lineare_algebra", "analytische_geometrie", "logik_und_mengen",
    "diskrete_mathematik", "numerik",
}
SCHULFORMEN = {"GS", "MS", "OS", "GY", "FOS", "BOS", "BS", "FGY", "SFZ"}
LEVELS = {"atom", "cluster", "domain"}
STATUS = {"draft", "review", "validated", "deprecated"}
PREREQ_TYPES = {"required", "helpful", "deepens"}
ENABLES_TYPES = {"required_for", "helpful_for", "applied_in", "formalizes"}
RELATED_TYPES = {
    "analogous_to", "dual_to", "conflicts_with",
    "commonly_confused_with", "generalizes", "special_case_of",
}
REPRESENTATIONS = {"enaktiv", "ikonisch", "symbolisch", "verbal", "graphisch", "tabellarisch"}
MISCONCEPTION_FREQ = {"selten", "häufig", "sehr_häufig"}

REQUIRED_FIELDS = ["id", "label", "domain", "granularity", "schulformen", "jahrgangsstufen", "weight"]
ALLOWED_FIELDS = set(REQUIRED_FIELDS) | {
    "description", "subdomain", "level", "prerequisites", "enables", "related",
    "lehrplan_ref", "representations", "misconceptions", "assessment_ideas",
    "tags", "status", "created_by", "reviewed_by", "version", "notes",
}
WEIGHT_REQUIRED = ["mastery_required", "curriculum_centrality", "transfer_value"]
WEIGHT_ALLOWED = set(WEIGHT_REQUIRED) | {"cognitive_load", "notes"}


def is_unit(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and 0.0 <= x <= 1.0


def validate_atom(atom, fname, errors):
    e = lambda msg: errors.append(f"[{fname}] {msg}")

    if not isinstance(atom, dict):
        e("Datei enthält kein YAML-Mapping")
        return

    for f in REQUIRED_FIELDS:
        if f not in atom:
            e(f"Pflichtfeld fehlt: {f}")
    for f in atom:
        if f not in ALLOWED_FIELDS:
            e(f"Unbekanntes Feld (additionalProperties:false): {f}")

    aid = atom.get("id")
    if aid is not None and (not isinstance(aid, str) or not ID_PATTERN.match(aid)):
        e(f"id verletzt Pattern: {aid!r}")

    label = atom.get("label")
    if label is not None and (not isinstance(label, str) or not (3 <= len(label) <= 120)):
        e("label muss String mit 3–120 Zeichen sein")

    desc = atom.get("description")
    if desc is not None and (not isinstance(desc, str) or len(desc) > 1000):
        e("description max. 1000 Zeichen")

    if "domain" in atom and atom["domain"] not in DOMAINS:
        e(f"domain nicht im Enum: {atom['domain']!r}")

    sub = atom.get("subdomain")
    if sub is not None and (not isinstance(sub, str) or len(sub) > 80):
        e("subdomain max. 80 Zeichen")

    if "level" in atom and atom["level"] not in LEVELS:
        e(f"level nicht im Enum: {atom['level']!r}")

    g = atom.get("granularity")
    if g is not None and (not isinstance(g, int) or isinstance(g, bool) or not (1 <= g <= 5)):
        e(f"granularity muss Integer 1–5 sein: {g!r}")

    sf = atom.get("schulformen")
    if sf is not None:
        if not isinstance(sf, list) or len(sf) < 1 or len(sf) != len(set(map(str, sf))):
            e("schulformen: nicht-leeres Array mit eindeutigen Einträgen erwartet")
        else:
            for s in sf:
                if s not in SCHULFORMEN:
                    e(f"schulformen: ungültiger Wert {s!r}")

    jg = atom.get("jahrgangsstufen")
    if jg is not None:
        if not isinstance(jg, list) or len(jg) < 1:
            e("jahrgangsstufen: nicht-leeres Array erwartet")
        else:
            for j in jg:
                if not isinstance(j, int) or isinstance(j, bool) or not (1 <= j <= 13):
                    e(f"jahrgangsstufen: ungültiger Wert {j!r}")

    w = atom.get("weight")
    if w is not None:
        if not isinstance(w, dict):
            e("weight muss Objekt sein")
        else:
            for k in WEIGHT_REQUIRED:
                if k not in w:
                    e(f"weight.{k} fehlt")
            for k, v in w.items():
                if k not in WEIGHT_ALLOWED:
                    e(f"weight: unbekanntes Feld {k!r}")
                elif k == "notes":
                    if not isinstance(v, str) or len(v) > 500:
                        e("weight.notes: String max. 500 Zeichen")
                elif not is_unit(v):
                    e(f"weight.{k} muss Zahl in [0,1] sein: {v!r}")

    for p in atom.get("prerequisites", []) or []:
        if not isinstance(p, dict):
            e("prerequisites: Eintrag muss Objekt sein"); continue
        extra = set(p) - {"id", "type", "mastery_level_needed", "note"}
        if extra:
            e(f"prerequisites: unbekannte Felder {sorted(extra)}")
        if "id" not in p or "type" not in p:
            e("prerequisites: id und type sind Pflicht")
        if "id" in p and not ID_PATTERN.match(str(p["id"])):
            e(f"prerequisites.id verletzt Pattern: {p['id']!r}")
        if "type" in p and p["type"] not in PREREQ_TYPES:
            e(f"prerequisites.type ungültig: {p['type']!r}")
        if "mastery_level_needed" in p and not is_unit(p["mastery_level_needed"]):
            e(f"prerequisites.mastery_level_needed außerhalb [0,1]: {p['mastery_level_needed']!r}")
        if "note" in p and (not isinstance(p["note"], str) or len(p["note"]) > 300):
            e("prerequisites.note max. 300 Zeichen")

    for en in atom.get("enables", []) or []:
        if not isinstance(en, dict):
            e("enables: Eintrag muss Objekt sein"); continue
        extra = set(en) - {"id", "type", "note"}
        if extra:
            e(f"enables: unbekannte Felder {sorted(extra)}")
        if "id" not in en or "type" not in en:
            e("enables: id und type sind Pflicht")
        if "type" in en and en["type"] not in ENABLES_TYPES:
            e(f"enables.type ungültig: {en['type']!r}")

    for r in atom.get("related", []) or []:
        if not isinstance(r, dict):
            e("related: Eintrag muss Objekt sein"); continue
        extra = set(r) - {"id", "relation", "note"}
        if extra:
            e(f"related: unbekannte Felder {sorted(extra)}")
        if "id" not in r or "relation" not in r:
            e("related: id und relation sind Pflicht")
        if "relation" in r and r["relation"] not in RELATED_TYPES:
            e(f"related.relation ungültig: {r['relation']!r}")
        if "note" in r and (not isinstance(r["note"], str) or len(r["note"]) > 400):
            e("related.note max. 400 Zeichen")

    for rep in atom.get("representations", []) or []:
        if rep not in REPRESENTATIONS:
            e(f"representations: ungültiger Wert {rep!r}")

    for t in atom.get("tags", []) or []:
        if not isinstance(t, str) or not (2 <= len(t) <= 50) or not TAG_PATTERN.match(t):
            e(f"tags: ungültiger Tag {t!r}")

    if "status" in atom and atom["status"] not in STATUS:
        e(f"status ungültig: {atom['status']!r}")

    v = atom.get("version")
    if v is not None and (not isinstance(v, int) or isinstance(v, bool) or v < 1):
        e(f"version muss Integer >= 1 sein: {v!r}")


def detect_cycles(atoms):
    """Eigene iterative DFS-Zyklensuche im prerequisites-Graphen (req → atom)."""
    graph = {aid: [] for aid in atoms}
    for aid, data in atoms.items():
        for p in data.get("prerequisites", []) or []:
            pid = p.get("id")
            if pid in atoms:
                graph[pid].append(aid)

    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in graph}
    cycles = []

    for start in graph:
        if color[start] != WHITE:
            continue
        stack = [(start, iter(graph[start]))]
        color[start] = GRAY
        path = [start]
        while stack:
            node, it = stack[-1]
            advanced = False
            for nxt in it:
                if color[nxt] == GRAY:
                    i = path.index(nxt)
                    cycles.append(" → ".join(path[i:] + [nxt]))
                elif color[nxt] == WHITE:
                    color[nxt] = GRAY
                    path.append(nxt)
                    stack.append((nxt, iter(graph[nxt])))
                    advanced = True
                    break
            if not advanced:
                color[node] = BLACK
                path.pop()
                stack.pop()
    return cycles


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--atoms", default="./atoms", type=Path)
    args = ap.parse_args()

    files = sorted(args.atoms.rglob("*.yaml"))
    atoms, errors = {}, []

    for path in files:
        try:
            atom = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as ex:
            errors.append(f"[{path.name}] YAML-Fehler: {ex}")
            continue
        validate_atom(atom, path.name, errors)
        aid = atom.get("id") if isinstance(atom, dict) else None
        if aid:
            if aid in atoms:
                errors.append(f"[{path.name}] doppelte id: {aid}")
            atoms[aid] = atom
            if path.stem != aid:
                errors.append(f"[{path.name}] Dateiname passt nicht zur id {aid!r}")

    print(f"[1/3] Schema-Kernregeln: {len(files)} Dateien geprüft")

    known = set(atoms)
    for aid, data in atoms.items():
        for field, key in (("prerequisites", "id"), ("enables", "id"), ("related", "id")):
            for ref in data.get(field, []) or []:
                rid = ref.get(key)
                if rid and rid not in known:
                    errors.append(f"[{aid}] {field}: referenziert unbekannte ID '{rid}'")
    for aid, data in atoms.items():
        for ref in data.get("prerequisites", []) or []:
            if ref.get("id") == aid:
                errors.append(f"[{aid}] prerequisites: Selbstreferenz")
    print("[2/3] Referenz-Integrität geprüft")

    cycles = detect_cycles(atoms)
    for c in cycles:
        errors.append(f"Zyklus im prerequisites-Graph: {c}")
    print("[3/3] Zyklenfreiheit geprüft (eigene DFS)")

    print()
    if errors:
        print(f"❌ {len(errors)} Problem(e):")
        for err in errors:
            print(f"  {err}")
        sys.exit(1)
    print(f"✅ Alle Prüfungen bestanden ({len(atoms)} Atome).")
    sys.exit(0)


if __name__ == "__main__":
    main()
