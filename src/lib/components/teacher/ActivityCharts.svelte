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
		<div class="range-toggle">
			<button class="range-btn" class:active={range === 7} onclick={() => (range = 7)}>7 Tage</button>
			<button class="range-btn" class:active={range === 30} onclick={() => (range = 30)}>30 Tage</button>
			<button class="range-btn" class:active={range === 90} onclick={() => (range = 90)}>90 Tage</button>
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
				<path d={masteryPath} fill="none" stroke="#16a34a" stroke-width="1" vector-effect="non-scaling-stroke" />
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
		border-radius: 0.75rem;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
		padding: 1rem 1.25rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.charts-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
	.card-title { font-size: 0.95rem; font-weight: 700; margin: 0; color: #111827; }
	.range-toggle { display: flex; gap: 0.3rem; }
	.range-btn {
		padding: 0.3rem 0.65rem;
		border: 1.5px solid #e5e7eb;
		border-radius: 0.4rem;
		background: #fff;
		font-size: 0.75rem;
		font-weight: 600;
		color: #6b7280;
		cursor: pointer;
	}
	.range-btn:hover { border-color: #d1d5db; background: #f9fafb; }
	.range-btn.active { background: #f0fdf4; border-color: #16a34a; color: #15803d; }

	.summary-row { display: flex; gap: 1.5rem; flex-wrap: wrap; }
	.summary-item { display: flex; flex-direction: column; gap: 0.1rem; }
	.summary-value { font-size: 1.1rem; font-weight: 800; color: #111827; }
	.summary-label { font-size: 0.68rem; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }

	.chart-block { display: flex; flex-direction: column; gap: 0.4rem; }
	.chart-title { font-size: 0.78rem; font-weight: 700; color: #374151; }
	.chart-empty { font-size: 0.8rem; color: #9ca3af; margin: 0.25rem 0; }

	.legend-row { display: flex; gap: 0.75rem; }
	.legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: #6b7280; font-weight: 600; }
	.legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
	.dot-correct { background: #16a34a; }
	.dot-wrong { background: #dc2626; }

	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 90px;
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
		height: 66px;
		display: flex;
		flex-direction: column-reverse;
		border-radius: 3px;
		overflow: hidden;
		background: #f3f4f6;
	}
	.bar-fill { width: 100%; transition: height 0.2s; }
	.minutes-fill { background: #16a34a; border-radius: 3px 3px 0 0; }
	.tasks-correct { background: #16a34a; }
	.tasks-wrong { background: #dc2626; }
	.bar-label {
		font-size: 0.6rem;
		color: #9ca3af;
		margin-top: 0.2rem;
		white-space: nowrap;
		writing-mode: vertical-rl;
		text-orientation: mixed;
		max-height: 2.2rem;
	}
	.bar-tooltip {
		position: absolute;
		top: -0.1rem;
		background: #111827;
		color: #fff;
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border-radius: 0.3rem;
		white-space: nowrap;
		z-index: 2;
		pointer-events: none;
	}
	.bar-tooltip.align-center { left: 50%; transform: translateX(-50%); }
	.bar-tooltip.align-start { left: 0; }
	.bar-tooltip.align-end { right: 0; }

	.line-chart { width: 100%; height: 90px; }
	.line-labels { display: flex; justify-content: space-between; font-size: 0.68rem; color: #9ca3af; }
	.line-labels-end { text-align: right; font-weight: 600; color: #15803d; }
</style>
