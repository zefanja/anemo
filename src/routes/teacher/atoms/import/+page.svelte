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
			preview = { count: rows.length, firstRow: JSON.stringify(rows[0], null, 2) };
		} catch {
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

	const EXAMPLE = JSON.stringify(
		[
			{
				atom_id: 'arithmetik__brueche_add_sub_gleichnamig',
				explanation:
					'Gleichnamige Brüche haben denselben Nenner. Um sie zu addieren, addierst du nur die Zähler und behältst den Nenner bei.\n\nBeispiel: $\\frac{3}{7} + \\frac{2}{7} = \\frac{3+2}{7} = \\frac{5}{7}$'
			}
		],
		null,
		2
	);
</script>

<svelte:head><title>Anemo – Erklärungen importieren</title></svelte:head>

<div class="page">
	<div class="page-header"><div><h1 class="page-title">Erklärungen importieren</h1><span class="page-sub">Erklärtexte pro Atom als JSON hinzufügen</span></div></div>

	{#if form?.success}
		<div class="alert alert-success" role="status">
			Import erfolgreich: <strong>{form.updated}</strong> Erklärungen aktualisiert,
			{form.skipped} übersprungen.
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
							<strong>{preview.count} Eintrag{preview.count === 1 ? '' : 'einträge'} erkannt.</strong>
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
						<button
							type="button"
							class="btn btn-outline"
							onclick={() => {
								jsonText = '';
								preview = null;
								parseError = '';
							}}
						>
							Leeren
						</button>
					</div>
				</form>
			</div>
		</div>

		<div class="side-col">
			<div class="card format-card">
				<h2>Format</h2>
				<p>JSON-Array mit Erklärungen pro Atom:</p>
				<ul class="field-list">
					<li><code>atom_id</code> <span class="req">Pflicht</span></li>
					<li><code>explanation</code> <span class="req">Pflicht</span> – Freitext mit LaTeX (<code>$…$</code>)</li>
					<li><code>illustration_config</code> optional – JSON-Objekt</li>
				</ul>

				<p class="hint-label">Beispiel:</p>
				<pre class="example-pre">{EXAMPLE}</pre>

				<p class="idempotent-note">
					Bestehende Erklärungen werden überschrieben (last-write-wins).
				</p>

				<p class="idempotent-note" style="margin-top:.5rem">
					Erklärungen mit dem Script <code>scripts/generate-explanations.ts</code> per Claude API generieren lassen.
				</p>
			</div>
		</div>
	</div>
</div>
