// How a hand gets from one club to the next, kept apart from animation.mjs so it can be tested without a
// browser.
//
// A hand's dwells are the stretches it holds a club, from the catch to the throw. In a siteswap they take
// turns: a hand throws, moves back empty, catches the next club. A pattern whose clubs are carried (a
// juggler walking with a club in each hand) breaks that. The next club can arrive while the hand still holds
// the last one, so two dwells overlap. A hand cannot be in two places, so it follows the earlier dwell until
// that club is thrown, then picks up the later one where it has got to. Where the dwells do not overlap the
// steps are exactly what animation.mjs built before: a dwell, then an empty move to the next catch.

/** Overlaps shorter than this, in seconds, are rounding, not two clubs in one hand. */
const EPS = 1e-9;

/**
 * The order a hand moves through its dwells over one period.
 *
 * `dwells` are `{ start, duration }`, sorted by `start`, with `start` in [0, period); a dwell may run past the
 * period's end. Returns a list of steps, each one either
 *
 *   { dwell: i, from }                          dwell i, followed from fraction `from` (0 unless it overlapped)
 *   { gap: true, before: i, after: k, start, duration }   empty, from dwell i's throw to dwell k's catch
 *
 * in the order the hand takes them.
 */
export function handSteps(dwells, period)
{
	const steps = [];
	const n = dwells.length;
	if (!n)
		return steps;
	let last = n - 1;
	dwells.forEach((curve, i) => {
		const before = dwells[last];
		const lastEnd = before.start + before.duration;
		// The previous dwell, round the period's end for the first of them.
		const overlap = lastEnd - (curve.start + (last >= i ? period : 0));
		if (overlap > EPS && last !== i) {
			// Still holding the previous club: take this one up only once that one is thrown.
			if (overlap < curve.duration - EPS) {
				steps.push({ dwell: i, from: overlap / curve.duration });
				last = i;
			}
			return;
		}
		const start = lastEnd;
		const end = curve.start;
		steps.push({
			gap: true,
			before: last,
			after: i,
			start,
			duration: end - start + (end > start ? 0 : period),
		});
		steps.push({ dwell: i, from: 0 });
		last = i;
	});
	return steps;
}

/**
 * A point in the world as a juggler standing at `pose` sees it, and back: `pose` is path.mjs's
 * `{ position, heading }`, with the juggler's front along (sin heading, 0, cos heading), as `lookAt` turns them.
 * A club carried while its juggler walks is moved in these coordinates, so it goes where the hand goes.
 */
export function toBody(pose, point)
{
	const [px, py, pz] = pose.position;
	const dx = point[0] - px;
	const dz = point[2] - pz;
	const c = Math.cos(pose.heading);
	const s = Math.sin(pose.heading);
	return [dx * c - dz * s, point[1] - py, dx * s + dz * c];
}

export function fromBody(pose, point)
{
	const [px, py, pz] = pose.position;
	const c = Math.cos(pose.heading);
	const s = Math.sin(pose.heading);
	return [px + point[0] * c + point[2] * s, py + point[1], pz - point[0] * s + point[2] * c];
}
