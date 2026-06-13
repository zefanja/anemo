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
	<h1 class="page-title">Erklärungen importieren</h1>

	{#if form?.success}
		<div class="alert alert-success">
			✅ Import erfolgreich: <strong>{form.updated}</strong> Erklärungen aktualisiert,
			{form.skipped} übersprungen.
		</div>
	{/if}

	{#if form?.importError}
		<div class="alert alert-error">{form.importError}</div>
	{/if}

	<div class="two-col">
		<div class="main-col">
			<div class="card">
				<h2>JSON eingeben oder hochladen</h2>

				<div class="file-row">
					<label class="btn btn-outline file-label" for="fileInput">
						📂 JSON-Datei öffnen
					</label>
					<input
						id="fileInput"
						type="file"
						accept=".json,application/json"
						class="hidden-file"
						onchange={loadFile}
					/>
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
						<div class="parse-error">{parseError}</div>
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
					ℹ️ Bestehende Erklärungen werden überschrieben (last-write-wins).
				</p>

				<p class="idempotent-note" style="margin-top:.5rem">
					💡 Erklärungen mit dem Script <code>scripts/generate-explanations.ts</code> per Claude API generieren lassen.
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.alert { padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; }
	.alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
	.alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

	.two-col { display: grid; grid-template-columns: 1fr 360px; gap: 1.25rem; align-items: start; }
	@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

	.card { background: #fff; border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
	.card h2 { font-size: 1rem; font-weight: 700; margin: 0 0 1rem; }

	.file-row { margin-bottom: 0.75rem; }
	.file-label { cursor: pointer; display: inline-flex; }
	.hidden-file { display: none; }

	.json-area {
		width: 100%;
		padding: 0.75rem;
		font-family: 'Courier New', monospace;
		font-size: 0.8rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		resize: vertical;
		outline: none;
		line-height: 1.5;
	}
	.json-area:focus { border-color: #16a34a; }

	.parse-error { font-size: 0.8rem; color: #dc2626; margin-top: 0.25rem; }

	.preview-box {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-size: 0.8rem;
		margin-top: 0.5rem;
	}
	.preview-box pre { margin: 0.35rem 0 0; font-size: 0.75rem; overflow-x: auto; }

	.form-actions { display: flex; gap: 0.5rem; margin-top: 0.875rem; }

	.format-card p { font-size: 0.85rem; color: #4b5563; margin-bottom: 0.5rem; }
	.field-list { list-style: none; display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; padding: 0; }
	.field-list li { font-size: 0.8rem; display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap; }
	.field-list code { font-family: monospace; background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 0.25rem; font-size: 0.8rem; }
	.req { font-size: 0.65rem; font-weight: 700; color: #dc2626; text-transform: uppercase; }
	.hint-label { font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem !important; }
	.example-pre {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		padding: 0.6rem;
		font-size: 0.7rem;
		overflow-x: auto;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}
	.idempotent-note { font-size: 0.78rem; color: #6b7280; background: #f9fafb; border-radius: 0.375rem; padding: 0.5rem 0.75rem; }
</style>
