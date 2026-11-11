# Erklärungen generieren – Prompt-Sammlung

Dieser Ordner enthält alles, um Atom-Erklärungen mit einem beliebigen LLM zu generieren.
Das Ergebnis (JSON-Datei) kann direkt unter `/teacher/atoms/import` importiert werden.

## Dateien

| Datei | Zweck |
|---|---|
| `system-prompt.txt` | System-Prompt (einmal pro Sitzung) |
| `user-prompt-single.txt` | Vorlage für ein einzelnes Atom |
| `user-prompt-batch.txt` | Vorlage für mehrere Atome auf einmal (empfohlen) |
| `output-schema.json` | JSON Schema der erwarteten Ausgabe |
| `example/input-single.json` | Beispiel-Eingabe (ein Atom) |
| `example/input-batch.json` | Beispiel-Eingabe (zwei Atome) |
| `example/output.json` | Beispiel-Ausgabe (entsprechend) |

---

## Workflow

### 1. Atom-Daten aufbereiten

Relevante Felder aus den YAML-Dateien (`math-knowledge-graph/atoms/*.yaml`) extrahieren:

```json
{
  "id": "arithmetik__brueche_add_sub_gleichnamig",
  "label": "Gleichnamige Brüche addieren und subtrahieren",
  "description": "...",
  "domain": "arithmetik",
  "subdomain": "Bruchrechnung",
  "jahrgangsstufen": [6],
  "tags": ["brüche", "gleichnamig"]
}
```

Nur `level: atom` einbeziehen, Cluster (`level: cluster`) überspringen.

### 2. Prompt zusammensetzen

**Für ein einzelnes Atom** (`user-prompt-single.txt`):
- Platzhalter `{{feld}}` durch die tatsächlichen Werte ersetzen

**Für einen Batch** (`user-prompt-batch.txt`) – empfohlen:
- `{{atoms_json}}` durch ein JSON-Array (10–20 Atome) ersetzen
- Größere Batches erhöhen das Risiko von ausgelassenen oder vertauschten IDs

### 3. Ausgabe importieren

Die JSON-Ausgabe des LLM direkt unter **Lehrer → Erklärungen** hochladen.

---

## Anleitung je LLM

### ChatGPT / Claude.ai (Web-UI)

1. Neuer Chat → Modell wählen
2. **Erstnachricht**: Inhalt von `system-prompt.txt` einfügen
3. **Folgenachricht**: `user-prompt-batch.txt` mit ausgefüllten Atom-Daten senden
4. Antwort als `.json` speichern → importieren

> Tipp: In ChatGPT kann der System-Prompt über „Custom Instructions" dauerhaft gesetzt werden.

---

### OpenAI API (JSON Mode)

```python
import openai, json

client = openai.OpenAI(api_key="...")

system = open("prompts/explanations/system-prompt.txt").read()
atoms  = json.load(open("prompts/explanations/example/input-batch.json"))
user   = open("prompts/explanations/user-prompt-batch.txt").read()
user   = user.replace("{{atoms_json}}", json.dumps(atoms, ensure_ascii=False, indent=2))

response = client.chat.completions.create(
    model="gpt-4o-mini",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": system},
        {"role": "user",   "content": user}
    ]
)

result = json.loads(response.choices[0].message.content)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

---

### Anthropic API

```python
import anthropic, json

client = anthropic.Anthropic(api_key="...")

system = open("prompts/explanations/system-prompt.txt").read()
atoms  = json.load(open("prompts/explanations/example/input-batch.json"))
user   = open("prompts/explanations/user-prompt-batch.txt").read()
user   = user.replace("{{atoms_json}}", json.dumps(atoms, ensure_ascii=False, indent=2))

message = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    system=system,
    messages=[{"role": "user", "content": user}]
)

result = json.loads(message.content[0].text)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

---

### Groq / lokale Modelle (OpenAI-kompatibler Endpunkt)

Gleicher Code wie OpenAI API, nur `base_url` und `api_key` anpassen:

```python
client = openai.OpenAI(
    api_key="...",
    base_url="https://api.groq.com/openai/v1"   # oder http://localhost:11434/v1 für Ollama
)
# Modell: "llama-3.3-70b-versatile" (Groq) oder "llama3.2" (Ollama)
```

---

## JSON Schema (für Structured Output / Function Calling)

Für LLMs mit nativem Schema-Support (OpenAI Structured Outputs, Anthropic Tool Use) kann `output-schema.json` direkt übergeben werden.

**OpenAI Structured Outputs:**
```python
response = client.beta.chat.completions.parse(
    model="gpt-4o-mini",
    messages=[...],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "explanations",
            "schema": json.load(open("prompts/explanations/output-schema.json")),
            "strict": True
        }
    }
)
```

**Anthropic Tool Use:**
```python
tools = [{
    "name": "save_explanations",
    "description": "Speichert die generierten Erklärungen",
    "input_schema": json.load(open("prompts/explanations/output-schema.json"))
}]
message = client.messages.create(..., tools=tools, tool_choice={"type": "tool", "name": "save_explanations"})
result = message.content[0].input  # direkt das validierte Objekt
```

---

## Hinweise zur Qualität

- **Batch-Größe**: 10–15 Atome pro Anfrage sind ein guter Kompromiss. Zu große Batches führen zu kürzeren oder generischen Erklärungen.
- **Temperatur**: 0.3–0.5 – niedrig genug für Konsistenz, hoch genug für natürliche Sprache.
- **Nachbearbeitung**: LaTeX-Ausdrücke prüfen (Backslashes korrekt escapt: `\\frac` im JSON-String).
- **Fehlende IDs**: Wenn das LLM eine atom_id aus dem Batch weglässt, einfach erneut für das fehlende Atom anfragen.
