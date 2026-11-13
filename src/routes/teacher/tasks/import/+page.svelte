<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let jsonText = $state('');
	let preview = $state<{ count: number; firstRow: string } | null>(null);
	let parseError = $state('');

	function handleInput() {
		preview = null;
		parseError = '';
		const raw = jsonText.trim();
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			const rows = Array.isArray(parsed) ? parsed : [parsed];
			preview = {
				count: rows.length,
				firstRow: JSON.stringify(rows[0], null, 2)
			};
		} catch (e) {
			parseError = 'Ungültiges JSON.';
		}
	}

	async function loadFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		jsonText = await file.text();
		handleInput();
	}

	const EXAMPLE = JSON.stringify([
		{
			atom_id: 'arithmetik__brueche_add_sub_gleichnamig',
			prompt: '3/7 + 2/7 = ?',
			answer_type: 'fraction',
			correct_answer: '5/7',
			hint: 'Bei gleichnamigen Brüchen die Zähler addieren.',
			difficulty: 0.3
		}
	], null, 2);
</script>

<svelte:head><title>Anemo – Aufgaben importieren</title></svelte:head>

<div class="page">
	<div class="page-header"><div><h1 class="page-title">Aufgaben importieren</h1><span class="page-sub">Eigene Aufgaben als JSON hinzufügen</span></div></div>

	{#if form?.success}
		<div class="alert alert-success" role="status">
			Import erfolgreich: <strong>{form.inserted}</strong> neue Aufgaben eingefügt,
			{form.skipped} übersprungen (bereits vorhanden).
		</div>
	{/if}

	{#if form?.importError}
		<div class="alert alert-error" role="alert">{form.importError}</div>
	{/if}

	<div class="import-grid">
		<div class="main-col">
			<div class="card">
				<h2>JSON eingeben oder hochladen</h2>

				<div class="file-row">
					<input
						id="fileInput"
						type="file"
						accept=".json,application/json"
						class="hidden-file"
						onchange={loadFile}
					/>
					<label class="btn btn-outline file-label" for="fileInput">JSON-Datei öffnen</label>
				</div>

				<form method="POST" action="?/import" use:enhance>
					<textarea
						name="json"
						bind:value={jsonText}
						oninput={handleInput}
						placeholder="JSON hier einfügen…"
						rows="14"
						class="json-area"
						spellcheck="false"
					></textarea>

					{#if parseError}
						<div class="parse-error" role="alert">{parseError}</div>
					{/if}

					{#if preview}
						<div class="preview-box">
							<strong>{preview.count} Aufgabe{preview.count === 1 ? '' : 'n'} erkannt.</strong>
							Erste Zeile:
							<pre>{preview.firstRow}</pre>
						</div>
					{/if}

					<div class="form-actions">
						<button
							type="submit"
							class="btn btn-primary"
							disabled={!jsonText.trim() || !!parseError}
						>
							Importieren
						</button>
						<button type="button" class="btn btn-outline" onclick={() => { jsonText = ''; preview = null; parseError = ''; }}>
							Leeren
						</button>
					</div>
				</form>
			</div>
		</div>

		<div class="side-col">
			<div class="card format-card">
				<h2>Format</h2>
				<p>JSON-Array mit Aufgaben-Objekten:</p>
				<ul class="field-list">
					<li><code>atom_id</code> <span class="req">Pflicht</span></li>
					<li><code>prompt</code> <span class="req">Pflicht</span></li>
					<li><code>answer_type</code> <span class="req">Pflicht</span> <span class="vals">integer | number | fraction | text</span></li>
					<li><code>correct_answer</code> <span class="req">Pflicht</span></li>
					<li><code>hint</code> optional</li>
					<li><code>why</code> optional – kurze Begründung der Lösung, erscheint nach dem Antworten hinter „Warum?“</li>
					<li><code>difficulty</code> optional (0–1)</li>
					<li><code>tolerance</code> optional (erlaubte Abweichung bei Zahlen, z. B. 0.05)</li>
					<li><code>distractors</code> optional (Array)</li>
				</ul>

				<p class="hint-label">Beispiel:</p>
				<pre class="example-pre">{EXAMPLE}</pre>

				<p class="idempotent-note">
					Import ist <strong>idempotent</strong> – dieselbe Aufgabe wird nicht doppelt eingefügt (Prüfung per SHA-256-Hash).
				</p>
			</div>
		</div>
	</div>
</div>
