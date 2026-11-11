#!/usr/bin/env python3
"""
build_edges.py – erzeugt edges.csv aus den prerequisites der Atom-YAMLs.

Die YAML-Dateien sind die einzige Quelle der Wahrheit; edges.csv ist ein
abgeleitetes Artefakt für den App-Import und darf nicht von Hand editiert
werden. Nach jeder Änderung an prerequisites ausführen:

    python3 build_edges.py          # schreibt edges.csv neu
    python3 build_edges.py --check  # Exit-Code 1, wenn edges.csv veraltet ist
"""

import argparse
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
HEADER = "source_id,target_id,edge_type,mastery_level_needed"


def build(atoms_dir: Path) -> str:
    lines = [HEADER]
    for path in sorted(atoms_dir.glob("*.yaml")):
        atom = yaml.safe_load(path.read_text(encoding="utf-8"))
        for p in atom.get("prerequisites") or []:
            lines.append(f"{p['id']},{atom['id']},{p['type']},{p['mastery_level_needed']}")
    # CRLF wie in der bisherigen Datei (der Import trimmt jedes Feld).
    return "\r\n".join(lines) + "\r\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--atoms", default=HERE / "atoms", type=Path)
    ap.add_argument("--out", default=HERE / "edges.csv", type=Path)
    ap.add_argument("--check", action="store_true", help="nur prüfen, nichts schreiben")
    args = ap.parse_args()

    content = build(args.atoms)
    if args.check:
        current = args.out.read_bytes().decode("utf-8") if args.out.exists() else ""
        if current != content:
            print(f"❌ {args.out.name} ist nicht synchron mit den YAML-Dateien "
                  f"(build_edges.py ausführen).")
            return 1
        print(f"✅ {args.out.name} ist synchron ({content.count(chr(10)) - 1} Kanten).")
        return 0
    args.out.write_bytes(content.encode("utf-8"))
    print(f"{args.out.name}: {content.count(chr(10)) - 1} Kanten geschrieben.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
