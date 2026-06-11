# Anemo – Mathe-Lern-App

Leichtgewichtige, mobile-first PWA für Schüler zum Schließen von Lernlücken in der Mathematik. Basiert auf einem Wissensgraphen mit 179 mathematischen Atomen (davon 95 Arithmetik-Atome mit prozeduralen Aufgabengeneratoren). Lehrkräfte verwalten Klassen und Schüler über ein Desktop-Dashboard.

---

## Inhaltsverzeichnis

1. [Schnellstart (Entwicklung)](#schnellstart-entwicklung)
2. [Deployment (Docker Compose)](#deployment-docker-compose)
3. [Konfiguration](#konfiguration)
4. [Erstes Einrichten](#erstes-einrichten)
5. [Datenmodell](#datenmodell)
6. [Aufgaben-Import-Format](#aufgaben-import-format)
7. [DSGVO-Hinweise](#dsgvo-hinweise)
8. [Tests](#tests)
9. [Architektur-Überblick](#architektur-überblick)

---

## Schnellstart (Entwicklung)

**Voraussetzungen:** Node.js 20+, PostgreSQL 15+

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env
# DATABASE_URL und SESSION_SECRET anpassen

# 3. Datenbank-Schema anlegen
npm run db:push

# 4. Wissensgraphen importieren
npm run import-graph

# 5. Demo-Daten einspielen (Schule, Lehrer, Klasse, 3 Schüler)
npm run seed

# 6. Entwicklungsserver starten
npm run dev
```

Demo-Zugangsdaten nach `npm run seed`:
- **Lehrer:** `lehrer@demo.local` / `Demo1234!`
- **Schüler:** Codes werden in der Konsole ausgegeben

---

## Deployment (Docker Compose)

```bash
# .env mit Produktionswerten befüllen (siehe Konfiguration)
cp .env.example .env

docker compose up -d
```

`docker-compose.yml` startet zwei Services:
- **db** – PostgreSQL 15 (persistentes Volume `pgdata`)
- **app** – Node.js-Anwendung (Port 3000)

Beim ersten Start nach dem Deployment:

```bash
# Schema anlegen / migrieren
docker compose exec app npx drizzle-kit migrate

# Wissensgraphen importieren
docker compose exec app npx tsx scripts/import-graph.ts
```

---

## Konfiguration

Alle Einstellungen über Umgebungsvariablen (`.env`):

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `DATABASE_URL` | ✓ | – | PostgreSQL-Verbindungs-URL |
| `SESSION_SECRET` | ✓ | – | 32-Byte-Hex-String für Cookie-Signierung |
| `COGNITIVE_WEIGHT` | – | `0.5` | Gewichtung der kognitiven Last im Frontier-Score |
| `SESSION_MAX_TOTAL` | – | `20` | Max. Aufgaben pro Sitzung (serverweiter Standard) |
| `SESSION_MAX_REVIEW` | – | `10` | Max. FSRS-Wiederholungen pro Sitzung |

```dotenv
# .env.example
DATABASE_URL=postgresql://anemo:sicher@db:5432/anemo
SESSION_SECRET=ersetze-mich-mit-64-hex-zeichen-xxxxxxxx
COGNITIVE_WEIGHT=0.5
SESSION_MAX_TOTAL=20
SESSION_MAX_REVIEW=10
```

Klassen können diese Servervorgaben im Lehrer-Dashboard pro Klasse überschreiben.

---

## Erstes Einrichten

### Schüler anlegen

1. Als Lehrer anmelden (`/teacher/login`)
2. **Klassen** → Klasse auswählen → Tab **Schüler**
3. „+ Neuer Schüler" → Name eingeben → **Anlegen & Code zeigen**
4. Den angezeigten 6-stelligen Code notieren und dem Schüler mitteilen

> **Wichtig:** Der Code wird nur einmal angezeigt – er wird nicht im Klartext gespeichert (DSGVO).

### Code zurücksetzen

Im Tab **Schüler** auf das 🔑-Symbol klicken. Ein neuer Code wird einmalig angezeigt.

### Passwort-Reset (Lehrer)

```
/teacher/password-reset
```

Der Reset-Link wird in der **Serverkonsole** ausgegeben (kein E-Mail-Versand). Sichtbar in `npm run dev` bzw. `docker compose logs app`.

---

## Datenmodell

### Kerntabellen

| Tabelle | Beschreibung |
|---|---|
| `atoms` | Mathematische Konzeptatome (id, label, domain, level: atom\|cluster, Gewichtungsfelder) |
| `edges` | Gerichtete Abhängigkeiten zwischen Atomen (required \| helpful \| deepens) |
| `school` | Single-Tenant: genau ein Eintrag |
| `teachers` | Lehrkräfte (E-Mail + Passwort-Hash) |
| `classes` | Klassen (pro Lehrer, optionale Sitzungs-Limits) |
| `students` | Schüler (display_name + code_hash, kein Klarname) |
| `student_atom_status` | Mastery + FSRS-Zustand pro Schüler×Atom |
| `attempts` | Alle Antwortversuche (atomId, isCorrect, fsrsRating) |
| `gamification_state` | XP, Level, Streak pro Schüler |
| `badges` | Errungenschaften (first_atom, streak_7, …) |
| `tasks` | Importierte statische Aufgaben |
| `sessions` | DB-backed Sessions (Schüler + Lehrer) |
| `login_attempts` | Rate-Limiting (5 Fehlversuche → 15 Min. Sperre per IP) |

### Mastery-Berechnung

```
mastery = (correctAttempts / totalAttempts) × min(1, totalAttempts / 3)
```

Ein Atom gilt als gemeistert, wenn `mastery ≥ masteryRequired` (Standard: 0,8). Unterhalb von 3 Versuchen wird die Mastery gedämpft, um vorschnelle Wertungen zu vermeiden.

### Frontier-Score

```
score = transfer_value + curriculum_centrality − COGNITIVE_WEIGHT × cognitive_load
```

Der Frontier enthält Atome, die noch nicht gemeistert sind und deren alle `required`-Voraussetzungen erfüllt sind. Die Reihenfolge im Auswahlmenü entspricht dem Score.

### Sitzungsablauf

1. **Pflicht:** Alle fälligen FSRS-Wiederholungen (max. `SESSION_MAX_REVIEW`)
2. **Frei:** Unbegrenzte Übung mit Frontier-Atomen nach Wahl des Schülers

---

## Aufgaben-Import-Format

Aufgaben können als JSON-Array über `/teacher/tasks/import` oder per Script importiert werden.

```json
[
  {
    "atom_id":        "arithmetik__brueche_add_sub_gleichnamig",
    "prompt":         "3/7 + 2/7 = ?",
    "answer_type":    "fraction",
    "correct_answer": "5/7",
    "hint":           "Gleichnamige Brüche: Zähler addieren, Nenner bleibt.",
    "difficulty":     0.3,
    "distractors":    ["4/7", "6/9"]
  }
]
```

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `atom_id` | ✓ | Muss einer vorhandenen Atom-ID entsprechen |
| `prompt` | ✓ | Aufgabentext |
| `answer_type` | ✓ | `integer` \| `number` \| `fraction` \| `text` |
| `correct_answer` | ✓ | Brüche als `"3/4"`, Dezimalzahlen mit Punkt |
| `hint` | – | Hilfetext bei falscher Antwort |
| `difficulty` | – | Float 0–1 |
| `distractors` | – | Array falscher Antworten |

**Idempotenz:** Derselbe Datensatz (SHA-256 aus `atom_id + prompt + correct_answer`) wird nicht doppelt eingefügt.

### Antworttypen

| Typ | Eingabe | Vergleich |
|---|---|---|
| `integer` | Ganzzahl | exakt (float-epsilon) |
| `number` | Dezimalzahl (`.` oder `,`) | float-epsilon 1 × 10⁻⁹ |
| `fraction` | `zähler/nenner` | als gekürzter Bruch |
| `text` | Freitext | case-insensitive, getrimmt |

---

## DSGVO-Hinweise

- **Schüler-Codes** werden ausschließlich als Argon2-Hash gespeichert. Der Klartext ist nach dem Anlegen nicht mehr abrufbar.
- `display_name` ist ein Anzeigename (z.B. „Max M."), keine amtliche Identifikation.
- Keine E-Mail-Adressen von Schülern gespeichert.
- Sessions laufen nach 30 Tagen ab; im Cookie liegt nur eine signierte ID, kein JWT.
- Beim Löschen eines Schülers werden alle zugehörigen Daten kaskadierend entfernt (`ON DELETE CASCADE`).
- `login_attempts` speichert IP-Adressen für Rate-Limiting; diese werden bei erfolgreichem Login automatisch gelöscht.

---

## Tests

```bash
# Einmalig ausführen (58 Tests)
npm test

# Im Watch-Modus
npm run test:watch
```

| Datei | Geprüfte Logik |
|---|---|
| `mastery.test.ts` | `computeMastery` – Dämpfung, Schwellen, Edge-Cases |
| `answer.test.ts` | `checkAnswer` – alle Antworttypen inkl. Bruchreduktion |
| `codes.test.ts` | Code-Generierung (Alphabet, Länge) + Hash/Verify-Round-Trip |
| `fsrs.test.ts` | ts-fsrs API – Scheduling, Stabilität, Again vs. Good |
| `graph-cycle.test.ts` | DFS-Zyklenkennung – DAG, Zyklen, Diamant, Edge-Cases |
| `rate-limit.test.ts` | Rate-Limiting – Sperre, Ablauf, DB-Aufrufe (gemockt) |

---

## Architektur-Überblick

```
src/
├── app.html                    # PWA-Shell (manifest, meta-Tags)
├── app.css                     # Globale CSS-Variablen + Utilities
├── hooks.server.ts             # Session-Auflösung bei jedem Request
├── routes/
│   ├── (student)/              # Schüler-Bereich (Layout-Guard)
│   │   ├── practice/           # Übungssession (Reviews → freies Üben)
│   │   └── progress/           # Skill-Tree (Fortschrittsübersicht)
│   ├── teacher/                # Lehrer-Bereich (Layout-Guard)
│   │   ├── dashboard/          # Statistiken + Aktivitäts-Feed
│   │   ├── classes/            # Klassenverwaltung + Schülercodes
│   │   ├── tasks/import/       # Aufgaben-Import (JSON)
│   │   └── settings/           # Passwort ändern
│   ├── api/
│   │   ├── task/[atomId]/      # GET – Aufgabe laden (ohne Lösung)
│   │   └── attempt/            # POST – Antwort einreichen
│   ├── login/                  # Schüler-Login (6-stelliger Code)
│   └── logout/
└── lib/server/
    ├── db/                     # Drizzle-Schema, Relations, DB-Client
    ├── auth/                   # Session, Rate-Limit, Codes, Passwörter
    ├── learning/               # Mastery, Frontier, FSRS, Session-Builder
    ├── tasks/                  # Generator-Registry, checkAnswer, Import
    └── gamification/           # XP, Level, Streak, Badges

scripts/
├── import-graph.ts             # YAML+CSV → DB (idempotent, Zyklenprüfung)
└── seed.ts                     # Demo-Daten (Schule, Lehrer, Klasse, Schüler)

math-knowledge-graph/
├── atoms/*.yaml                # 179 Atom-Definitionen
└── edges.csv                   # Abhängigkeitskanten
```

### Technologie-Stack

| Schicht | Technologie |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (Runes-Modus) |
| Sprache | TypeScript (strict) |
| Datenbank | PostgreSQL 15 + Drizzle ORM |
| Spaced Repetition | ts-fsrs 5.4.1 |
| Passwort- / Code-Hashing | Argon2 |
| Deployment | adapter-node + Docker Compose |
| Tests | Vitest 4 |
