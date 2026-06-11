<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function timeAgo(date: Date | string): string {
		const d = new Date(date);
		const diff = Math.floor((Date.now() - d.getTime()) / 1000);
		if (diff < 60) return 'gerade eben';
		if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
		if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
		return `vor ${Math.floor(diff / 86400)} Tagen`;
	}
</script>

<svelte:head><title>Anemo – Dashboard</title></svelte:head>

<div class="page">
	<h1 class="page-title">Dashboard</h1>

	<!-- Stat cards -->
	<div class="stat-grid">
		<div class="stat-card">
			<div class="stat-num">{data.stats.classCount}</div>
			<div class="stat-lbl">Klassen</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.studentCount}</div>
			<div class="stat-lbl">Schüler</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.masteredCount}</div>
			<div class="stat-lbl">Gemeisterte Atome</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.totalAtoms}</div>
			<div class="stat-lbl">Atome gesamt</div>
		</div>
	</div>

	<div class="two-col">
		<!-- Classes quick-links -->
		<section class="card">
			<div class="card-header">
				<h2>Klassen</h2>
				<a href="/teacher/classes" class="link-more">Alle anzeigen →</a>
			</div>
			{#if data.classes.length === 0}
				<p class="empty-note">Noch keine Klassen angelegt.</p>
				<a href="/teacher/classes" class="btn btn-primary">Erste Klasse anlegen</a>
			{:else}
				<ul class="class-list">
					{#each data.classes as c}
						<li>
							<a href="/teacher/classes/{c.id}" class="class-item">
								<span class="class-name">{c.name}</span>
								<span class="class-count">{c.studentCount} Schüler</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Recent activity -->
		<section class="card">
			<div class="card-header">
				<h2>Letzte Aktivitäten</h2>
			</div>
			{#if data.recentAttempts.length === 0}
				<p class="empty-note">Noch keine Versuche vorhanden.</p>
			{:else}
				<ul class="activity-list">
					{#each data.recentAttempts as a}
						<li class="activity-item">
							<span class="activity-dot" class:correct={a.isCorrect} class:wrong={!a.isCorrect}></span>
							<span class="activity-body">
								<strong>{a.studentName}</strong> – {a.atomLabel}
							</span>
							<span class="activity-time">{timeAgo(a.answeredAt)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.5rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
	}
	.stat-card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 1.25rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
		text-align: center;
	}
	.stat-num { font-size: 2rem; font-weight: 800; color: #16a34a; }
	.stat-lbl { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	@media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

	.card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 1.25rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	.card-header h2 { font-size: 1rem; font-weight: 700; margin: 0; }
	.link-more { font-size: 0.8rem; color: #16a34a; text-decoration: none; }
	.empty-note { font-size: 0.875rem; color: #9ca3af; margin-bottom: 0.75rem; }

	.class-list { list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
	.class-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 0.75rem;
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
		background: #f9fafb;
		transition: background .15s;
	}
	.class-item:hover { background: #f0fdf4; }
	.class-name { font-weight: 600; font-size: 0.9rem; }
	.class-count { font-size: 0.75rem; color: #6b7280; }

	.activity-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.activity-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.85rem;
	}
	.activity-dot {
		width: 8px; height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.activity-dot.correct { background: #16a34a; }
	.activity-dot.wrong { background: #dc2626; }
	.activity-body { flex: 1; color: #374151; }
	.activity-time { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }
</style>
