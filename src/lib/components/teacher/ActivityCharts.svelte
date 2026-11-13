<script lang="ts">
	type DailyStat = { date: string; activeMinutes: number; tasksTotal: number; tasksCorrect: number };
	type MasteryPoint = { date: string; cumulativeMastered: number };

	let { dailyStats, masteryTimeline }: { dailyStats: DailyStat[]; masteryTimeline: MasteryPoint[] } =
		$props();

	let range = $state<7 | 30 | 90>(30);

	let visibleDaily = $derived(dailyStats.slice(-range));
	let visibleMastery = $derived(masteryTimeline.slice(-range));

	// 90 days of daily bars is too dense to read; bucket into weeks instead.
	let bucketed = $derived(
		range === 90 ? bucketWeekly(visibleDaily) : visibleDaily.map((d) => ({ label: shortDate(d.date), ...d }))
	);

	function bucketWeekly(daily: DailyStat[]): { label: string; activeMinutes: number; tasksTotal: number; tasksCorrect: number }[] {
		const weeks: { label: string; activeMinutes: number; tasksTotal: number; tasksCorrect: number }[] = [];
		for (let i = 0; i < daily.length; i += 7) {
			const chunk = daily.slice(i, i + 7);
			weeks.push({
				label: shortDate(chunk[0].date),
				activeMinutes: chunk.reduce((s, d) => s + d.activeMinutes, 0),
				tasksTotal: chunk.reduce((s, d) => s + d.tasksTotal, 0),
				tasksCorrect: chunk.reduce((s, d) => s + d.tasksCorrect, 0)
			});
		}
		return weeks;
	}

	// The tooltip is centered over its bar by default; near either edge of the
	// scrollable chart that would clip it, so pin it to that edge instead.
	function tooltipAlign(i: number, total: number): 'start' | 'end' | 'center' {
		if (i < 2) return 'start';
		if (i > total - 3) return 'end';
		return 'center';
	}

	function shortDate(iso: string): string {
		const d = new Date(iso + 'T00:00:00Z');
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
	}

	let maxMinutes = $derived(Math.max(1, ...bucketed.map((d) => d.activeMinutes)));
	let maxTasks = $derived(Math.max(1, ...bucketed.map((d) => d.tasksTotal)));
	let maxMastered = $derived(Math.max(1, ...visibleMastery.map((d) => d.cumulativeMastered)));

	let hoveredIdx = $state<number | null>(null);
	let hoveredMasteryIdx = $state<number | null>(null);

	const totalMinutes = $derived(visibleDaily.reduce((s, d) => s + d.activeMinutes, 0));
	const totalTasks = $derived(visibleDaily.reduce((s, d) => s + d.tasksTotal, 0));
	const totalCorrect = $derived(visibleDaily.reduce((s, d) => s + d.tasksCorrect, 0));

	function fmtMinutes(min: number): string {
		if (min < 60) return `${min} Min.`;
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
	}

	// Line path for the mastery chart (viewBox 0..100 wide, 0..40 tall)
	let masteryPath = $derived(
		visibleMastery.length > 1
			? visibleMastery
					.map((p, i) => {
						const x = (i / (visibleMastery.length - 1)) * 100;
						const y = 40 - (p.cumulativeMastered / maxMastered) * 38;
						return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
					})
					.join(' ')
			: ''
	);
</script>

<div class="activity-charts">
	<div class="charts-header">
		<h3 class="card-title">Aktivität</h3>
		<div class="seg" role="group" aria-label="Zeitraum">
			<button class:active={range === 7} aria-pressed={range === 7} onclick={() => (range = 7)}>7 Tage</button>
			<button class:active={range === 30} aria-pressed={range === 30} onclick={() => (range = 30)}>30 Tage</button>
			<button class:active={range === 90} aria-pressed={range === 90} onclick={() => (range = 90)}>90 Tage</button>
		</div>
	</div>

	<div class="summary-row">
		<div class="summary-item">
			<span class="summary-value">{fmtMinutes(totalMinutes)}</span>
			<span class="summary-label">Aktive Zeit</span>
		</div>
		<div class="summary-item">
			<span class="summary-value">{totalTasks}</span>
			<span class="summary-label">Aufgaben</span>
		</div>
		<div class="summary-item">
			<span class="summary-value">{totalTasks > 0 ? Math.round((totalCorrect / totalTasks) * 100) : 0}%</span>
			<span class="summary-label">Richtig</span>
		</div>
	</div>

	<div class="chart-block">
		<div class="chart-title">Aktive Zeit {range === 90 ? '(pro Woche)' : '(pro Tag)'}</div>
		{#if bucketed.every((d) => d.activeMinutes === 0)}
			<p class="chart-empty">Keine Aktivität im gewählten Zeitraum.</p>
		{:else}
			<div class="bar-chart">
				{#each bucketed as d, i}
					<div
						class="bar-col"
						role="img"
						aria-label="{d.label}: {fmtMinutes(d.activeMinutes)}"
						onmouseenter={() => (hoveredIdx = i)}
						onmouseleave={() => (hoveredIdx = null)}
					>
						{#if hoveredIdx === i}
							<div class="bar-tooltip align-{tooltipAlign(i, bucketed.length)}">
								{d.label}: {fmtMinutes(d.activeMinutes)}
							</div>
						{/if}
						<div class="bar-track">
							<div
								class="bar-fill minutes-fill"
								style="height: {(d.activeMinutes / maxMinutes) * 100}%"
							></div>
						</div>
						<span class="bar-label">{d.label}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="chart-block">
		<div class="chart-title">Aufgaben {range === 90 ? '(pro Woche)' : '(pro Tag)'}</div>
		<div class="legend-row">
			<span class="legend-item"><span class="legend-dot dot-correct"></span>Richtig</span>
			<span class="legend-item"><span class="legend-dot dot-wrong"></span>Falsch</span>
		</div>
		{#if bucketed.every((d) => d.tasksTotal === 0)}
			<p class="chart-empty">Keine Aufgaben im gewählten Zeitraum.</p>
		{:else}
			<div class="bar-chart">
				{#each bucketed as d, i}
					{@const wrong = d.tasksTotal - d.tasksCorrect}
					<div
						class="bar-col"
						role="img"
						aria-label="{d.label}: {d.tasksCorrect} richtig, {wrong} falsch"
						onmouseenter={() => (hoveredIdx = i + 1000)}
						onmouseleave={() => (hoveredIdx = null)}
					>
						{#if hoveredIdx === i + 1000}
							<div class="bar-tooltip align-{tooltipAlign(i, bucketed.length)}">
								{d.label}: {d.tasksCorrect} richtig · {wrong} falsch
							</div>
						{/if}
						<div class="bar-track">
							<div class="bar-fill tasks-wrong" style="height: {(wrong / maxTasks) * 100}%"></div>
							<div
								class="bar-fill tasks-correct"
								style="height: {(d.tasksCorrect / maxTasks) * 100}%"
							></div>
						</div>
						<span class="bar-label">{d.label}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="chart-block">
		<div class="chart-title">Gemeisterte Atome (kumulativ)</div>
		{#if visibleMastery.length < 2 || maxMastered === 0}
			<p class="chart-empty">Noch nicht genug Daten für einen Verlauf.</p>
		{:else}
			<svg class="line-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
				<path d={masteryPath} fill="none" stroke="var(--c-primary)" stroke-width="1" vector-effect="non-scaling-stroke" />
			</svg>
			<div class="line-labels">
				<span>{shortDate(visibleMastery[0].date)}</span>
				<span class="line-labels-end">
					{shortDate(visibleMastery[visibleMastery.length - 1].date)} · {visibleMastery[visibleMastery.length - 1].cumulativeMastered} gesamt
				</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.activity-charts {
		background: #fff;
		border-radius: var(--t-card-radius, 20px);
		box-shadow: var(--shadow-sm);
		padding: 1.25rem 1.375rem;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem 1.5rem;
	}
	.charts-header, .summary-row { grid-column: 1 / -1; }
	.charts-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
	.card-title { font-size: 1.05rem; font-weight: 900; margin: 0; color: var(--c-navy); }

	.summary-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
	.summary-item { display: flex; flex-direction: column; background: var(--c-ground); border-radius: 14px; padding: 0.6rem 0.875rem; }
	.summary-value { font-size: 1.3rem; font-weight: 900; color: var(--c-navy); }
	.summary-label { font-size: 0.78rem; color: var(--c-ink-2); font-weight: 800; }

	.chart-block { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
	.chart-title { font-size: 0.85rem; font-weight: 900; color: var(--c-navy); }
	.chart-empty { font-size: 0.85rem; font-weight: 700; color: var(--c-ink-2); margin: 0.25rem 0; }

	.legend-row { display: flex; gap: 0.75rem; }
	.legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--c-ink-2); font-weight: 800; }
	.legend-dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
	.dot-correct { background: var(--c-primary); }
	.dot-wrong { background: var(--c-orange); }

	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 96px;
		overflow-x: auto;
		padding-top: 1.25rem; /* room for tooltip */
	}
	.bar-col {
		position: relative;
		flex: 1 0 auto;
		min-width: 8px;
		max-width: 28px;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
	}
	.bar-track {
		width: 100%;
		max-width: 16px;
		height: 70px;
		display: flex;
		flex-direction: column-reverse;
		border-radius: 4px;
		overflow: hidden;
		background: var(--c-track);
	}
	.bar-fill { width: 100%; transition: height 0.2s; }
	.minutes-fill { background: var(--c-sky); border-radius: 4px 4px 0 0; }
	.tasks-correct { background: var(--c-primary); }
	.tasks-wrong { background: var(--c-orange); }
	.bar-label {
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--c-ink-2);
		margin-top: 0.2rem;
		white-space: nowrap;
		writing-mode: vertical-rl;
		text-orientation: mixed;
		max-height: 2.2rem;
	}
	.bar-tooltip {
		position: absolute;
		top: -0.1rem;
		background: var(--c-navy);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 800;
		padding: 0.15rem 0.45rem;
		border-radius: 0.4rem;
		white-space: nowrap;
		z-index: 2;
		pointer-events: none;
	}
	.bar-tooltip.align-center { left: 50%; transform: translateX(-50%); }
	.bar-tooltip.align-start { left: 0; }
	.bar-tooltip.align-end { right: 0; }

	.line-chart { width: 100%; height: 96px; }
	.line-labels { display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 700; color: var(--c-ink-2); }
	.line-labels-end { text-align: right; font-weight: 900; color: var(--c-primary-dark); }

	@media (max-width: 1100px) {
		.activity-charts { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 899px) {
		.activity-charts { padding: 1rem; }
		.summary-value { font-size: 1.1rem; }
		.summary-item { padding: 0.5rem 0.65rem; }
	}
</style>
