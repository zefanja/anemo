# Mathematik-Knowledge-Graph (Sachsen) – Atome v1 (Draft)

Knowledge-Graph für eine App zum gezielten Füllen von Mathematik-Lücken,
auf Basis der sächsischen Lehrpläne im Projekt:

- `lp_gs_mathematik_2025_kommentiert.pdf` (Grundschule, Kl. 1–4)
- `lp_gy_mathematik_2021.pdf` (Gymnasium, Kl. 5–12; Jg. 11/12: Grundkurs)

## Umfang

- **369 Atome** (296 übbare Atome, 73 Cluster), **993 gewichtete
  prerequisites-Kanten** (877 required, 114 helpful, 2 deepens; azyklisch, geprüft)
- Domänenverteilung: arithmetik 109, algebra 89, geometrie 55, analysis 40,
  stochastik 40, analytische_geometrie 31, lineare_algebra 3, logik_und_mengen 2

### Graph-Review (v4): Schlüssigkeit, Schrittgrößen, fehlende Atome

Der gesamte Graph wurde auf Schlüssigkeit geprüft und überarbeitet
(78 neue Atome, 140 geänderte Atome, Version jeweils +1).

**Zu strenge Abhängigkeiten gelöst.** Eine `required`-Kante von einem Cluster
auf ein übbares Atom lässt dieses auf *alle* Teilfertigkeiten des Clusters
warten. Wo nur eine Teilfertigkeit gebraucht wird, zeigt die Kante jetzt auf
genau diese, u. a.:

| Atom | wartete unnötig auf | jetzt |
|---|---|---|
| Äquivalenzumformung | Ausklammern/Ausmultiplizieren | `terme_zusammenfassen` |
| Negative Zahlen addieren, Vorzeichenregeln | gesamte Bruch-/Dezimalrechnung | `betrag_gegenzahl` (Brüche `helpful`) |
| Monotonie/Extrema | Ableitung von ln/sin (→ Logarithmus, Höhensatz …) | `potenz_summen_faktorregel` |
| sin/cos/tan-Definition | Höhen-/Kathetensatz, Umkehrung | `pythagoras_hypotenuse` |
| Pythagoras Hypotenuse | Wurzelterme, irrationale Zahlen | `quadratwurzel_begriff` |
| Prozentwert/-satz/Grundwert | antiproportionale Zuordnung | `proportionale_zuordnung` |
| Division Grundverständnis | Einmaleins-Automatisierung | `einmaleins_ableiten` |
| Bernoulli-Kette | rationale Exponenten | `potenzieren_natuerliche_zahlen` |
| Erwartungswert | Boxplot/Streumaße | `arithmetisches_mittel` |

Künstlich linearisierte Ketten wurden entkoppelt (Kosinussatz ← Sinussatz,
Kugel ← Zylinder, Additions- ← Einsetzungsverfahren, Nullstelle ← Gleichung
aufstellen, Lösungsformel ← Faktorisieren, Parabel-Nullstellen ← Scheitelform
umwandeln, Integral als Fläche ← Stammfunktion: jeweils `helpful` statt
`required`). Fehlende Kanten wurden ergänzt (z. B. Strahlensätze ←
Verhältnisgleichungen, σ der Binomialverteilung ← Varianz, Steckbriefaufgaben
← Gauß, Bruch → Dezimalzahl ← Dezimalzahl durch natürliche Zahl, Zahlbereiche
← negative Zahlen, Flächenformeln ← Vierecksarten/Höhen).

**Fehlende Atome ergänzt** (Feld `notes` vermerkt, dass der Lehrplanbezug noch
nicht gegen das PDF verifiziert ist; daher ohne `lehrplan_ref`):

- Arithmetik: Zahlen bis 10, ZE ± E mit Übergang, Zehnereinmaleins,
  halbschriftliches Multiplizieren/Dividieren, Bruch als Quotient, Brüche
  gleichnamig machen, Bruch durch natürliche Zahl, Dezimalzahl mal natürliche
  Zahl, Grundwert/Prozentwert/Prozentsatz zuordnen, Maßstab.
- Algebra: Produkte von Termen, Summen multiplizieren, Formeln umstellen,
  Verhältnisgleichungen, Gleichungen aus Sachtexten, quadratische Ergänzung,
  Steigung aus zwei Punkten, Grenzwert von Folgen.
- Geometrie: senkrecht/parallel, Kreis-Grundbegriffe, Dreiecksarten, Höhen
  erkennen, Kegel, Kreisbogen/Kreissektor.
- Stochastik: Diagramme lesen/erstellen, Gegenereignis, relative Häufigkeit als
  Schätzwert, Satz von Bayes.
- Analysis: e-Funktion und ln, Potenzregel für negative/rationale Exponenten,
  Tangentengleichung, Integral als rekonstruierter Bestand.

**Zu große Schritte zerlegt** (Eltern bleiben als `level: cluster`, gleiche
Mechanik wie v2): Größen Geld/Länge/Zeit; Kl.-10-Funktionen (Potenz-,
ganzrationale, Exponential-, Logarithmus-, Sinusfunktion inkl. Einheitskreis
und Bogenmaß); Analysis (Ableitung e/ln/sin, Monotonie/Extrema,
Extremwertprobleme, Stammfunktion); Stochastik (Median/Quartile/Boxplot,
beurteilende Statistik); Analytische Geometrie (Betrag/Kollinearität,
Koordinaten-/Normalenform, Lage Gerade–Ebene/Ebene–Ebene, Abstände).

Bewusst **nicht** in eigene Atome zerlegt wurden Atome, deren Generator die
Teilschritte bereits als Stufen (`stage`) nacheinander übt: Rechteck
Fläche/Umfang, Flächen-/Volumeneinheiten, Volumen/Oberfläche (Quader,
Zylinder, Kugel), schriftliche Multiplikation, Zahlenfolgen.

**Gewichte konsistent gemacht** (Regeln werden vom Validator geprüft bzw. sind
unten dokumentiert): `transfer_value` wurde bei Atomen mit wenigen oder keinen
Folge-Atomen abgesenkt; `mastery_required` hat die Untergrenze 0,7;
`mastery_level_needed` liegt nie über dem `mastery_required` des Quellatoms.

**Technik:** `edges.csv` wird jetzt mit `build_edges.py` aus den YAMLs erzeugt
(zuvor wichen zwei laut README herabgestufte Kanten in der CSV ab). Die App
berechnet die Graph-Tiefe nur noch über `required`-Kanten, der Import löscht
Kanten, die es in `edges.csv` nicht mehr gibt, und ein Test stellt sicher, dass
kein übbares Atom hinter einer Voraussetzung ohne Aufgaben-Generator liegt.
Für alle neuen Atome auf solchen Pfaden (Arithmetik, Algebra bis Kl. 9,
Geometrie, Logik) wurden Generatoren ergänzt.

**Hinweis für bestehende Lernstände:** Wird ein bereits gemeistertes Atom zum
Cluster (z. B. Größen Geld/Länge/Zeit), zählt es für Folge-Atome weiterhin als
beherrscht; seine neuen Teilfertigkeiten erscheinen aber als neue Atome.

### Feinatomisierung Geometrie, Stochastik, Analysis, Analytische Geometrie, Lineare Algebra (v2) + Gesamtreview

30 weitere Cluster wurden in 72 Mikrofertigkeiten zerlegt (gleiche Mechanik):
Geometrie (u. a. Flächenformeln einzeln, Pythagoras in 4 Teilfertigkeiten,
Trigonometrie in 3, Flächen-/Volumeneinheiten getrennt von Längeneinheiten),
Stochastik (Laplace, Baumdiagramm/Pfadregeln, Kenngrößen, Zufallsgrößen,
Kombinatorik, Vierfeldertafel/Bayes, Bernoulli/Binomialverteilung),
Analysis (Änderungsraten → Ableitungsbegriff → Regeln → Kurvenuntersuchung;
Integral → Hauptsatz → Flächen), Analytische Geometrie (Vektoren, Geraden,
Ebenenformen, Lagebeziehungen, Skalar-/Vektorprodukt, Abstände/Winkel) und
Lineare Algebra (Koeffizientenmatrix, Gauß). logik_und_mengen blieb bewusst
grob (2 kleine Quer­schnitts-Atome).

Ein domänenübergreifender Review korrigierte dabei: 8 Cluster mit
inkonsistenter Granularität 5 → 4; zwei blockierende Kanten, deren
Voraussetzung erst später unterrichtet wird, wurden auf `helpful`
herabgestuft (Pyramide/Kegel ← Sinussatz; Größen Kl. 1 ← Rechnen bis 100).
Nicht-blockierende Rückwärtskanten vom Typ `deepens`/`helpful` sind
beabsichtigt (spätere Vertiefung früherer Themen).

### Feinatomisierung Algebra (v2)

12 zentrale Algebra-Atome wurden in 40 Mikrofertigkeiten (Granularität 5)
zerlegt; dieselbe Cluster-Mechanik wie bei der Arithmetik (Eltern bleiben
als `level: cluster`, Teilfertigkeiten als `required`-prerequisites + per
`special_case_of` rückverlinkt; externe Referenzen aus Geometrie und
Analysis bleiben gültig). Schwerpunkte:

- **Terme:** Variablenbegriff, Termwert, gleichartige Glieder zusammenfassen;
  Ausmultiplizieren/Ausklammern; binomische Formeln vorwärts (ausmultiplizieren)
  und rückwärts (faktorisieren) getrennt.
- **Gleichungen:** Äquivalenzumformung (Waagemodell) → zweischrittig →
  Variablen beidseitig → Klammern/Brüche → Sonderfälle; LGS in vier Verfahren
  (grafisch, Einsetzung, Gleichsetzung, Addition); quadratische Gleichungen
  (reinquadratisch, Faktorisieren/Nullprodukt, Lösungsformel, Diskriminante).
- **Potenzen/Wurzeln:** Potenzgesetze (gleiche Basis, Potenz einer Potenz,
  negative, rationale Exponenten); Wurzelbegriff, irrationale/reelle Zahlen,
  Wurzelterme.
- **Funktionen:** Funktionsbegriff (Eindeutigkeit, Darstellungsformen,
  Def-/Wertebereich); lineare Funktionen (Steigung/Achsenabschnitt, Graph,
  Gleichung aufstellen, Nullstelle); quadratische Funktionen (Normalparabel,
  Scheitelpunktform, Formumwandlung, Nullstellen).
- **Zuordnungen:** proportional und antiproportional mit Dreisatz.

Dabei wurde eine didaktisch fragwürdige Altkante korrigiert: das Lösen
quadratischer Gleichungen hängt nicht mehr von den quadratischen Funktionen
ab (umgekehrt brauchen deren Nullstellen das Gleichungslösen) — das löst
zugleich einen sonst entstehenden Zyklus.

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
atoms/<id>.yaml          # ein Atom pro Datei, Dateiname == id (Quelle der Wahrheit)
edges.csv                # abgeleitet: source_id,target_id,edge_type,mastery_level_needed
build_edges.py           # erzeugt edges.csv aus den YAMLs (nie von Hand editieren)
validate_atoms_lite.py   # dependency-armer Validator (nur pyyaml)
```

Nach jeder Änderung an `prerequisites`:

```bash
python3 build_edges.py && python3 validate_atoms_lite.py
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
| `transfer_value` | Wie viele Folge-Atome bauen darauf auf (0 = Sackgasse, 1 = Fundament)? Obergrenze nach Zahl der übbaren Folge-Atome: 0 → 0,5; ≤ 2 → 0,7; ≤ 5 → 0,8; ≤ 12 → 0,9 |
| `cognitive_load` | Geschätzte kognitive Belastung beim Erwerb (relativ zum Jahrgang) |

`mastery_level_needed` an einer Kante wirkt nur, solange es unter dem
`mastery_required` des Quellatoms liegt (die App wertet ein gemeistertes Atom
als 1,0); es erlaubt dann, das Ziel-Atom schon vor dem vollständigen Meistern
der Voraussetzung zu beginnen. Die Reihenfolge im Lernpfad ergibt sich aus der
Tiefe im `required`-Graphen; `helpful`/`deepens` blockieren nicht und dürfen
auch rückwärts zeigen.

## Ehrliche Einordnung / Limitierungen

- **Alle Gewichte und Kanten sind didaktische Schätzungen eines LLM**
  (`status: draft`, vermerkt in `created_by`). Die Lernbereiche und Inhalte
  wurden gegen die beiden Lehrplan-PDFs verifiziert (`lehrplan_ref` nennt
  jeweils Klassenstufe und Lernbereich); die Zahlenwerte der Gewichte und die
  `mastery_level_needed`-Werte sind dagegen nicht empirisch fundiert und
  sollten fachlich reviewt werden, bevor die App sie für Diagnosen nutzt.
- **Granularität überwiegend 5**: 261 der 296 übbaren Atome sind
  Mikrofertigkeiten; die übrigen (Granularität 3–4) sind vor allem
  Grundschul-Geometrie, Größen Masse/Volumen, Sachaufgaben und einzelne
  Sammelatome (zentrische Streckung, Pyramiden, Kreissätze).
- **Ohne Aufgaben-Generator** sind weiterhin Stochastik, Analysis, Analytische
  Geometrie, Lineare Algebra und die Funktionen der Kl. 10; diese Atome sind in
  der App erst übbar, wenn Aufgaben importiert oder Generatoren ergänzt werden.
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
(Schema-Kernregeln, Referenz-Integrität, Zyklenfreiheit per eigener DFS sowie
Graph-Konsistenz: Cluster-Zugehörigkeit, Schwellenwerte, Jahrgangsreihenfolge
blockierender Kanten, Synchronität von `edges.csv`):

```
✅ Alle Prüfungen bestanden (369 Atome).
```

**Bitte zusätzlich auf deinem Rechner mit dem Original-Setup validieren**
(die Dateien `atom.schema.json` und `validate_atoms.py` liegen bereits in
deinem Projekt und sind hier bewusst nicht als rekonstruierte Kopien
beigelegt, um Abweichungen zu vermeiden):

```bash
pip install jsonschema pyyaml networkx
python validate_atoms.py --atoms ./atoms --schema ./atom.schema.json --stats
```
