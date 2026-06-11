# Mathematik-Knowledge-Graph (Sachsen) – Atome v1 (Draft)

Knowledge-Graph für eine App zum gezielten Füllen von Mathematik-Lücken,
auf Basis der sächsischen Lehrpläne im Projekt:

- `lp_gs_mathematik_2025_kommentiert.pdf` (Grundschule, Kl. 1–4)
- `lp_gy_mathematik_2021.pdf` (Gymnasium, Kl. 5–12; Jg. 11/12: Grundkurs)

## Umfang

- **179 Atome**, **408 gewichtete prerequisites-Kanten** (azyklisch, geprüft)
- Domänenverteilung: arithmetik 95, geometrie 27, algebra 25, stochastik 11,
  analysis 10, analytische_geometrie 8, logik_und_mengen 2, lineare_algebra 1

### Lückenschluss Arithmetik nach Curriculum-Abgleich (v3)

Abgleich gegen den sächsischen Lehrplan selbst sowie gegen internationale
Curricula (Common Core, England KS1/KS2). Ergänzt wurden:

**Im sächsischen LP enthalten, im Graph zuvor fehlend:** Zählen/Zahlwortreihe,
Verdoppeln/Halbieren, Division mit Rest, Runden natürlicher Zahlen,
Dezimalzahlen vergleichen/ordnen/runden, Vorrangregeln (Punkt vor Strich,
Klammern), Teiler/Vielfache, arithmetische Muster/Zahlenfolgen (GS),
römische Zahlen.

**Über den sächsischen LP hinaus (Tag `internationale_ergaenzung`,
ohne lehrplan_ref, Quelle im notes-Feld):** Verhältnisse a:b
(Common Core 6.RP, England KS2, Singapur) und Zehnerpotenz-Normdarstellung /
wissenschaftliche Notation (Common Core 8.EE.A.3/4).

Zehn bestehende Atome wurden dabei neu verkabelt (Version +1), u. a.
hängt die schriftliche Division jetzt an der Division mit Rest und
ggT/kgV an Teiler/Vielfache.

### Feinatomisierung Arithmetik (v2)

14 grobe Arithmetik-Atome wurden in 45 Mikrofertigkeiten (Granularität 5)
zerlegt – Schwerpunkte: Zahlenraum bis 20/100, Einmaleins, Bruchbegriff,
Kürzen/Erweitern, Teilbarkeit (inkl. ggT/kgV), Brüche und Dezimalzahlen
rechnen, Umwandeln, Prozentrechnung (Prozentwert/-satz/Grundwert/
veränderter Grundwert), negative und rationale Zahlen. Die bisherigen
groben Atome bleiben als `level: cluster` (version: 2) erhalten:

- Alle bestehenden Referenzen aus anderen Domänen bleiben gültig.
- Jedes Cluster erhält seine Teilfertigkeiten als zusätzliche
  `required`-prerequisites (Cluster beherrscht ⇔ Teilfertigkeiten beherrscht).
- Jede Teilfertigkeit verweist per `related: special_case_of` auf ihr
  Cluster (explizite Zugehörigkeit, redundant zu den Cluster-Kanten,
  aber app-freundlich).
- Bewusst NICHT weiter zerlegt: bereits feine Atome (schriftliche
  Verfahren, Stellenwert-Atome u. a.) sowie Sammel-Atome wie
  Sachaufgaben und Größen.

## Struktur

```
atoms/<id>.yaml          # ein Atom pro Datei, Dateiname == id
edges.csv                # alle prerequisites-Kanten: source_id,target_id,edge_type,mastery_level_needed
validate_atoms_lite.py   # dependency-armer Validator (nur pyyaml)
```

`edges.csv` ist für den App-Import gedacht: Kante `source → target` bedeutet
„source ist Voraussetzung für target". `edge_type` ∈ {required, helpful, deepens},
`mastery_level_needed` (0–1) gibt an, wie sicher die Voraussetzung beherrscht
sein muss, bevor das Ziel-Atom sinnvoll geübt werden kann.

## Gewichtungs-Semantik (pro Atom, Feld `weight`)

| Feld | Bedeutung |
|---|---|
| `mastery_required` | Wie sicher muss dieses Atom selbst beherrscht werden (0–1)? |
| `curriculum_centrality` | Wie zentral im sächsischen Lehrplan (0 = Randthema, 1 = zentral)? |
| `transfer_value` | Wie viele Folge-Atome bauen darauf auf (0 = Sackgasse, 1 = Fundament)? |
| `cognitive_load` | Geschätzte kognitive Belastung beim Erwerb (relativ zum Jahrgang) |

## Ehrliche Einordnung / Limitierungen

- **Alle Gewichte und Kanten sind didaktische Schätzungen eines LLM**
  (`status: draft`, vermerkt in `created_by`). Die Lernbereiche und Inhalte
  wurden gegen die beiden Lehrplan-PDFs verifiziert (`lehrplan_ref` nennt
  jeweils Klassenstufe und Lernbereich); die Zahlenwerte der Gewichte und die
  `mastery_level_needed`-Werte sind dagegen nicht empirisch fundiert und
  sollten fachlich reviewt werden, bevor die App sie für Diagnosen nutzt.
- **Granularität meist 3–4**: Die Atome entsprechen eher Lehrplan-Teilzielen
  als Barton-feinen Mikro-Skills. Eine feinere Atomisierung (Granularität 5,
  z. B. „Brüche addieren – gleicher Nenner" vs. „ungleicher Nenner") ist je
  Domäne iterativ möglich.
- **Nur GS + GY abgedeckt**, da nur diese Lehrpläne im Projekt liegen.
  Oberschule (OS) und Leistungskurs 11/12 sind nicht modelliert.
- **ID-Präfix-Workaround**: Das id-Pattern im Schema
  (`^[a-z][a-z0-9]*(__...)`) erlaubt keinen Unterstrich vor dem ersten `__`.
  Daher verwenden Atome der Domänen lineare_algebra, analytische_geometrie
  und logik_und_mengen die Präfixe `linalg__`, `ageo__`, `logik__` — das
  `domain`-Feld enthält weiterhin den vollen Enum-Wert.

## Validierung

In der Erstellungsumgebung waren `jsonschema`/`networkx` nicht installierbar
(PyPI blockiert), daher wurde mit `validate_atoms_lite.py` geprüft
(Schema-Kernregeln, Referenz-Integrität, Zyklenfreiheit per eigener DFS):

```
✅ Alle Prüfungen bestanden (179 Atome).
```

**Bitte zusätzlich auf deinem Rechner mit dem Original-Setup validieren**
(die Dateien `atom.schema.json` und `validate_atoms.py` liegen bereits in
deinem Projekt und sind hier bewusst nicht als rekonstruierte Kopien
beigelegt, um Abweichungen zu vermeiden):

```bash
pip install jsonschema pyyaml networkx
python validate_atoms.py --atoms ./atoms --schema ./atom.schema.json --stats
```
