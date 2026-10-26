<svelte:options namespace=svg />

<!--
	A ladder diagram: one rail per hand, every juggler's right hand above their left, and every throw drawn
	from the hand and beat it leaves to the hand and beat it lands. Where the causal diagram answers "whose
	throw am I answering", this answers "what does each hand do when", so it shows sync throws, multiplexes,
	holds and half beats exactly as they are timed.

	It lays beats out as the causal diagram does — beat 0 at x = 55, 70 px a beat over the JIF's own
	timeStretchFactor — so a page that scrolls one strip can scroll the other with the same arithmetic, and
	`steps` is a number of throws drawn, the sequence repeated on by whole periods, as there.
-->

<script>
	export let jif;
	export let steps = jif.throws ? jif.throws.length : 0;

	const xoff = 55;
	const yoff = 46;
	const rail = 38;   // between a juggler's right and left hands
	const band = 116;  // from one juggler's right hand to the next juggler's
	const r = 11;
	const arrowLength = 9;

	let dx;
	let width, height;
	let rails = [];
	let nodes = [];

	function x(time) { return xoff + time * dx; }
	function railOf(limb) {
		const l = jif.limbs[limb];
		return { y: yoff + l.juggler * band + (l.type && l.type.match(/left/) ? rail : 0), left: !!(l.type && l.type.match(/left/)), juggler: l.juggler };
	}

	// From a point on one rail to a point on another, both pulled back off their nodes so the line starts
	// at the thrower's circle and its head stops at the catcher's.
	function line(x1, y1, x2, y2) {
		const len = Math.hypot(x2 - x1, y2 - y1) || 1;
		const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
		return 'M' + (x1 + r * ux) + ',' + (y1 + r * uy) + ' L' + (x2 - (r + arrowLength) * ux) + ',' + (y2 - (r + arrowLength) * uy);
	}

	// A throw back to the hand it left bows away from the juggler's other hand: up off a right hand, down off
	// a left one, and higher the longer it flies.
	function arc(x1, x2, y, up) {
		const lift = Math.min(band / 2 - 6, 14 + (x2 - x1) / 6) * (up ? -1 : 1);
		const xm = (x1 + x2) / 2;
		return 'M' + (x1 + r * 0.6) + ',' + (y + lift * 0.4) + ' Q' + xm + ',' + (y + lift * 1.6) + ' ' + (x2 - r * 0.6) + ',' + (y + Math.sign(lift) * (r + arrowLength * 0.6));
	}

	$: {
		dx = 70 / (jif.timeStretchFactor || 1);
		const throws = jif.throws ? jif.throws : [];
		const period = jif.repetition && jif.repetition.period ? jif.repetition.period : 0;
		const nJugglers = jif.jugglers.length;

		rails = jif.limbs.map((_, limb) => railOf(limb));
		nodes = [];
		let last = 0;
		for (let i = 0; i < steps && throws.length; i++) {
			const th = throws[i % throws.length];
			const time = th.time + Math.floor(i / throws.length) * period;
			const from = railOf(th.from);
			const to = railOf(th.to);
			const x1 = x(time), x2 = x(time + th.duration);
			last = Math.max(last, x2);
			nodes.push({
				x: x1,
				y: from.y,
				class: from.left ? 'left' : 'right',
				label: th.label,
				pass: from.juggler !== to.juggler,
				path: th.from === th.to ? arc(x1, x2, from.y, !from.left) : line(x1, from.y, x2, to.y),
			});
		}
		width = Math.max(last, x(steps)) + 30;
		height = yoff * 2 + (nJugglers - 1) * band + rail;
	}
</script>

<style>
	.rail      { stroke:#ced4da }
	.self      { stroke:#6c757d }
	.pass      { stroke:#007bff }
	.selfFill  {   fill:#6c757d }
	.passFill  {   fill:#007bff }
	circle     { stroke:#343a40 }
	circle.right { fill:white }
	circle.left  { fill:#b7c8d5 }
	.nodeLabel { fill:#343a40 }
</style>

<svg {width} {height} data-ladder>
	<defs>
		<marker id=ladderSelf markerWidth=10 markerHeight=10 refX=0 refY=3 orient=auto markerUnits=strokeWidth>
			<path class=selfFill d='M0,0 L0,6 L9,3 z' />
		</marker>
		<marker id=ladderPass markerWidth=10 markerHeight=10 refX=0 refY=3 orient=auto markerUnits=strokeWidth>
			<path class=passFill d='M0,0 L0,6 L9,3 z' />
		</marker>
	</defs>

	{#each rails as rl}
		<line class=rail x1=0 y1={rl.y} x2={width} y2={rl.y} stroke-width=2 />
	{/each}

	{#each nodes as n}
		<path
			class={n.pass ? 'pass' : 'self'}
			d={n.path}
			stroke-width=2px
			fill=none
			marker-end={n.pass ? 'url(#ladderPass)' : 'url(#ladderSelf)'}
		/>
	{/each}

	{#each nodes as n}
		<circle cx={n.x} cy={n.y} r={r} class={n.class} stroke-width=2 />
		<text x={n.x} y={n.y + 4} class=nodeLabel font-size=12 stroke-width=0px text-anchor=middle>{n.label}</text>
	{/each}
</svg>
