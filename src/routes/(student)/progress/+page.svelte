<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const BADGE_LABELS: Record<string, string> = {
		first_atom: '🏅 Erstes Atom',
		atoms_10: '⭐ 10 Atome',
		atoms_50: '🌟 50 Atome',
		atoms_all: '🏆 Alle Atome',
		streak_7: '🔥 7-Tage-Streak',
		streak_30: '🔥 30-Tage-Streak',
		cluster_complete: '📦 Bereich fertig'
	};

	function masteryColor(mastery: number, isMastered: boolean): string {
		if (isMastered) return 'mastered';
		if (mastery > 0.5) return 'partial-high';
		if (mastery > 0) return 'partial-low';
		return 'untouched';
	}

	let overallPct = $derived(
		data.totalAtoms > 0 ? Math.round((data.masteredAtoms / data.totalAtoms) * 100) : 0
	);
</script>

<div class="progress-page">
	<!-- ── Overall stats ── -->
	<div class="stats-card">
		<div class="stats-row">
			<div class="stat">
				<span class="stat-value">{data.masteredAtoms}</span>
				<span class="stat-label">Gemeistert</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{data.totalAtoms}</span>
				<span class="stat-label">Gesamt</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{overallPct}%</span>
				<span class="stat-label">Fortschritt</span>
			</div>
		</div>
		<div class="overall-track">
			<div class="overall-fill" style="width: {overallPct}%"></div>
		</div>
	</div>

	<!-- ── Badges ── -->
	{#if data.badges.length > 0}
		<div class="section-title">Abzeichen</div>
		<div class="badges-row">
			{#each data.badges as badge}
				<span class="badge-chip">{BADGE_LABELS[badge] ?? badge}</span>
			{/each}
		</div>
	{/if}

	<!-- ── Active atoms by domain ── -->
	{#if data.domains.length === 0}
		<div class="empty-state">Alle aktuell erreichbaren Themen gemeistert!</div>
	{:else}
		<div class="section-title">Aktuelle Themen</div>
		{#each data.domains as domain}
			<div class="domain-section">
				<div class="domain-title">{domain.name}</div>

				{#each domain.groups as group}
					{#if group.name}
						<div class="subdomain-title">{group.name}</div>
					{/if}
					<div class="atom-list">
						{#each group.atoms as atom}
							{@const colorClass = masteryColor(atom.mastery, atom.isMastered)}
							<div
								class="atom-row {colorClass}"
								class:is-cluster={atom.level === 'cluster'}
								title="{atom.label} – {Math.round(atom.mastery * 100)}%"
							>
								<div class="atom-row-left">
									<div class="atom-status-dot {colorClass}"></div>
									<span class="atom-row-label">{atom.label}</span>
								</div>
								<div class="atom-row-right">
									{#if atom.mastery > 0}
										<div class="mini-track">
											<div class="mini-fill" style="width: {Math.round(atom.mastery * 100)}%"></div>
										</div>
										<span class="pct-label">{Math.round(atom.mastery * 100)}%</span>
									{:else}
										<span class="not-started">–</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	{/if}

	<!-- ── Mastered atoms ── -->
	{#if data.masteredDomains.length > 0}
		<div class="section-title">Gemeistert</div>
		{#each data.masteredDomains as domain}
			<div class="domain-section mastered-section">
				<div class="domain-title mastered-title">{domain.name}</div>

				{#each domain.groups as group}
					{#if group.name}
						<div class="subdomain-title">{group.name}</div>
					{/if}
					<div class="atom-list">
						{#each group.atoms as atom}
							<div class="atom-row mastered" title={atom.label}>
								<div class="atom-row-left">
									<div class="atom-status-dot mastered"></div>
									<span class="atom-row-label">{atom.label}</span>
								</div>
								<div class="atom-row-right">
									<span class="mastered-check">✓</span>
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	{/if}

	<div style="height: 1.5rem"></div>
</div>

<style>
	.progress-page {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* ── Stats card ── */
	.stats-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 1.25rem;
		box-shadow: var(--shadow-sm);
		margin-bottom: 0.5rem;
	}
	.stats-row {
		display: flex;
		align-items: center;
		justify-content: space-around;
		margin-bottom: 0.75rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--c-primary);
	}
	.stat-label {
		font-size: 0.7rem;
		color: var(--c-gray-600);
		text-transform: uppercase;
		letter-spacing: .05em;
	}
	.stat-divider {
		width: 1px;
		height: 32px;
		background: var(--c-gray-200);
	}
	.overall-track {
		height: 10px;
		background: var(--c-gray-200);
		border-radius: 999px;
		overflow: hidden;
	}
	.overall-fill {
		height: 100%;
		background: var(--c-primary);
		border-radius: 999px;
		transition: width .4s ease;
	}

	/* ── Badges ── */
	.badges-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}
	.badge-chip {
		background: var(--c-primary-light);
		color: var(--c-primary-dark);
		border-radius: 999px;
		padding: 0.3rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
	}

	/* ── Domain sections ── */
	.section-title {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: .08em;
		color: var(--c-gray-600);
		padding: 0.5rem 0 0.25rem;
	}
	.domain-section {
		background: #fff;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}
	.domain-title {
		padding: 0.75rem 1rem;
		font-size: 1rem;
		font-weight: 700;
		background: var(--c-primary);
		color: #fff;
	}
	.subdomain-title {
		padding: 0.4rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--c-gray-600);
		background: var(--c-gray-50);
		border-bottom: 1px solid var(--c-gray-100);
	}

	/* ── Atom rows ── */
	.atom-list { display: flex; flex-direction: column; }
	.atom-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--c-gray-100);
		gap: 0.5rem;
	}
	.atom-row:last-child { border-bottom: none; }
	.atom-row.is-cluster {
		background: var(--c-gray-50);
		padding-left: 1rem;
	}
	.atom-row-left {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.atom-status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.atom-status-dot.mastered { background: var(--c-success); }
	.atom-status-dot.partial-high { background: #facc15; }
	.atom-status-dot.partial-low { background: #fb923c; }
	.atom-status-dot.untouched { background: var(--c-gray-200); }
	.atom-row-label {
		font-size: 0.875rem;
		color: var(--c-gray-900);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.is-cluster .atom-row-label { font-weight: 600; color: var(--c-gray-700); }
	.atom-row-right {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}
	.mastered-check { color: var(--c-success); font-weight: 700; font-size: 1rem; }
	.not-started { color: var(--c-gray-400); font-size: 0.85rem; }
	.pct-label { font-size: 0.7rem; color: var(--c-gray-600); min-width: 28px; text-align: right; }
	.cluster-badge {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: .04em;
		color: var(--c-gray-600);
		background: var(--c-gray-200);
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
	}
	.mastered-section { opacity: 0.75; }
	.mastered-title {
		background: var(--c-success);
	}
	.empty-state {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--c-gray-600);
		font-size: 0.95rem;
	}
	.mini-track {
		width: 48px;
		height: 5px;
		background: var(--c-gray-200);
		border-radius: 999px;
		overflow: hidden;
	}
	.mini-fill {
		height: 100%;
		background: var(--c-primary);
		border-radius: 999px;
	}
</style>
