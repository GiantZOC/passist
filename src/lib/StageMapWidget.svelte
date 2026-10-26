<!--
	A stage map: the floor plan seen from above, every juggler's walk drawn as the path the JIF gives them, and a
	scrubber that moves them along it.

	The JIF's paths are in metres, in the animation's world: x across the stage, z away from the audience. Seen
	from above, z runs up the drawing, so a juggler walking towards the audience comes down it. Each walk is
	sampled with `pathPose` (path.mjs) rather than read off its keys, so the line drawn here is the curve the
	animation follows — through a station passed on the way, eased off a stop.

	`edit` is for the submission editor: dragging a juggler at the scrub time dispatches `move` with
	`{ juggler, time, position: [x, y, z], lookAt }` — a key to add to that juggler's path, facing the way they
	already face.
-->

<script>
	import { createEventDispatcher } from 'svelte';
	import { pathPose } from './path.mjs';

	export let jif;
	/** Where the scrubber is, in beats. Settable from outside with `$set({ time })`. */
	export let time = 0;
	/** Beats in one cycle of the walk; the paths' own when left at 0. */
	export let period = 0;
	/** One colour per juggler, in the animation's colours when the page passes them. */
	export let colours = [];
	export let names = true;
	export let edit = false;
	export let width = 640;
	export let height = 420;

	const PAD = 34;
	const SAMPLES = 96;
	const R = 10;
	// A, B, then the six the animation dresses the rest of a group in (web/app/app/composables/jugglerModels.ts).
	const FALLBACK = ['#1f3a68', '#7a1f3d', '#2f6b3a', '#8a5a14', '#5b3f86', '#1f6f73', '#8c2f1f', '#3d4f7a'];

	const dispatch = createEventDispatcher();
	const letter = (index) => String.fromCharCode(65 + index);

	let bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
	let scale = 60;
	let cycle = 0;
	let walks = [];
	let standing = [];
	/** The marker a drag has moved off its path: `{ juggler, x, y, position, lookAt }`. */
	let ghost = null;

	// The floor's (x, z) to the drawing, z upwards: the side away from the audience is the top of the map.
	const px = (x) => PAD + (x - bounds.minX) * scale;
	const py = (z) => PAD + (bounds.maxZ - z) * scale;
	const wx = (x) => bounds.minX + (x - PAD) / scale;
	const wz = (y) => bounds.maxZ - (y - PAD) / scale;

	$: {
		const jugglers = jif && jif.jugglers ? jif.jugglers : [];
		const paths = jugglers.map((one) => (one.path && one.path.keys && one.path.keys.length ? one.path : null));
		const first = paths.find((one) => one);
		cycle = period || (first ? first.period : 0);

		// The floor is what the walks cover, so a pattern that stands in a ring is framed as the ring.
		const xs = [], zs = [];
		for (const path of paths) {
			for (const key of path ? path.keys : []) {
				xs.push(key.position[0]);
				zs.push(key.position[2]);
			}
		}
		if (xs.length) {
			bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
		}
		scale = Math.min(
			(width - PAD * 2) / Math.max(bounds.maxX - bounds.minX, 0.5),
			(height - PAD * 2) / Math.max(bounds.maxZ - bounds.minZ, 0.5),
			110,
		);

		walks = jugglers.map((one, j) => {
			const path = paths[j];
			const colour = colours[j] || FALLBACK[j % FALLBACK.length];
			const walk = { juggler: j, name: one.name || letter(j), colour, points: '', keys: [] };
			if (!path || !cycle) return walk;
			const points = [];
			for (let k = 0; k <= SAMPLES; k++) {
				const pose = pathPose(path, (k / SAMPLES) * cycle);
				points.push(px(pose.position[0]).toFixed(1) + ',' + py(pose.position[2]).toFixed(1));
			}
			walk.points = points.join(' ');
			walk.keys = path.keys.map((key) => ({ x: px(key.position[0]), y: py(key.position[2]) }));
			return walk;
		});

		standing = walks.filter((one) => one.points).map((one) => {
			const pose = pathPose(jif.jugglers[one.juggler].path, time);
			return {
				juggler: one.juggler,
				name: one.name,
				colour: one.colour,
				x: px(pose.position[0]),
				y: py(pose.position[2]),
				position: pose.position,
				lookAt: [pose.position[0] + Math.sin(pose.heading) * 0.4, 0, pose.position[2] + Math.cos(pose.heading) * 0.4],
				facing: [Math.sin(pose.heading) * 20, -Math.cos(pose.heading) * 20],
			};
		});
	}

	// A dragged marker is drawn where the pointer left it, without moving the walk under it.
	$: markers = standing.map((one) => (ghost && ghost.juggler === one.juggler ? { ...one, ...ghost } : one));

	function down(event, one) {
		if (!edit) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		ghost = { juggler: one.juggler, x: one.x, y: one.y, position: one.position, lookAt: one.lookAt };
	}
	function move(event, one) {
		if (!ghost || ghost.juggler !== one.juggler) return;
		const svg = event.currentTarget.ownerSVGElement;
		const box = svg.getBoundingClientRect();
		const k = width / box.width;
		const x = wx((event.clientX - box.left) * k);
		const z = wz((event.clientY - box.top) * k);
		ghost = { ...ghost, x: px(x), y: py(z), position: [x, 0, z] };
	}
	function up(one) {
		if (!ghost || ghost.juggler !== one.juggler) return;
		const key = { juggler: ghost.juggler, name: one.name, time: Number(time), position: ghost.position, lookAt: ghost.lookAt };
		ghost = null;
		dispatch('move', key);
	}
</script>

<div class=stageMap data-stage-map>
	<svg {width} {height} viewBox="0 0 {width} {height}" role=img aria-label="Where the jugglers walk">
		<rect class=floor x=0 y=0 {width} {height} rx=8 />

		{#each walks as one}
			{#if one.points}
				<polyline class=walk points={one.points} stroke={one.colour} />
			{/if}
		{/each}

		{#if edit}
			{#each walks as one}
				{#each one.keys as key}
					<rect class=key x={key.x - 3} y={key.y - 3} width=6 height=6 stroke={one.colour} />
				{/each}
			{/each}
		{/if}

		{#each markers as one}
			<g
				class=marker
				class:grab={edit}
				on:pointerdown={(event) => down(event, one)}
				on:pointermove={(event) => move(event, one)}
				on:pointerup={() => up(one)}
				on:pointercancel={() => up(one)}
			>
				<line class=facing x1={one.x} y1={one.y} x2={one.x + one.facing[0]} y2={one.y + one.facing[1]} stroke={one.colour} />
				<circle cx={one.x} cy={one.y} r={R} fill={one.colour} />
				<text class=letter x={one.x} y={one.y + 4} text-anchor=middle>{one.name}</text>
				{#if names}
					<text class=name x={one.x + R + 4} y={one.y + 4}>{one.name}</text>
				{/if}
			</g>
		{/each}
	</svg>

	{#if cycle}
		<div class=scrub style="max-width:{width}px">
			<input
				type=range
				min=0
				max={cycle}
				step=0.05
				bind:value={time}
				aria-label="Walk the jugglers round"
				data-stage-scrub
			/>
			<span class=readout>beat {Math.floor(time) + 1} of {cycle}</span>
		</div>
	{/if}
</div>

<style>
	.stageMap { display:inline-block; max-width:100%; }
	svg      { display:block; max-width:100%; height:auto; touch-action:none; }
	.floor   { fill:#f8f9fa; stroke:#dee2e6; }
	.walk    { fill:none; stroke-width:2.5; stroke-opacity:0.55; stroke-linecap:round; stroke-linejoin:round; }
	.marker  { cursor:default; }
	.marker.grab { cursor:grab; }
	.facing  { stroke-width:2; stroke-opacity:0.8; }
	.letter  { fill:white; font-size:11px; font-weight:600; }
	.name    { fill:#343a40; font-size:12px; }
	.key     { fill:white; stroke-width:1.5; }
	.scrub   { display:flex; align-items:center; gap:12px; margin-top:8px; }
	.scrub input { flex:1; }
	.readout { color:#6c757d; font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; }
</style>
