/**
 * Where a moving juggler is, and which way they face, at a time — from the path a JIF gives them.
 *
 *   jugglers[i].path = { period, keys: [{ time, position: [x, y, z], lookAt: [x, y, z] }] }
 *
 * Times are beats, repeating every `period`. Between keys the juggler moves along a Hermite curve: a key the
 * juggler arrives at and stays on (the next or the previous key is the same place) is a stop, so a juggler who
 * holds a spot for a beat and then walks eases off it and back onto the next; a key passed through on the way
 * (a point on a figure-eight) is crossed at the speed its neighbours give it, Catmull-Rom style, without a stop.
 * The facing turns the short way round between keys, eased the same.
 *
 * A key can say two more things about the walk that leaves it:
 *
 *   via: [x, y, z]   a point the walk passes through on its way to the next key, for a curve round something
 *                    standing in the way. It replaces the Hermite segment with the quadratic through the point
 *                    at the segment's middle, so the walk bulges out and comes back rather than cutting across.
 *   spin: 1          turns made getting to the next key, on top of the facing turning to wherever the next key
 *                    looks — a pirouette while walking, and 0.5 ends facing the other way.
 *
 * Pure arithmetic and no three.js, so the site that writes these paths can check them with the same code
 * (web/lib/pattern/stage.mjs keeps a copy, and a test there holds the two to the same answers).
 */

const EPS = 1e-6;

function same(a, b) {
	return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS;
}

/** The heading a key faces: the angle about the vertical of the direction from its position to its lookAt. */
function headingOf(key) {
	const dx = key.lookAt[0] - key.position[0];
	const dz = key.lookAt[2] - key.position[2];
	return Math.atan2(dx, dz);
}

function shortest(from, to) {
	let d = (to - from) % (2 * Math.PI);
	if (d > Math.PI) d -= 2 * Math.PI;
	if (d < -Math.PI) d += 2 * Math.PI;
	return d;
}

/**
 * The pose at `time` beats: `{ position: [x, y, z], heading }`, where the juggler faces `(sin heading, 0,
 * cos heading)`. A path with no keys answers null.
 */
export function pathPose(path, time) {
	const keys = path && path.keys ? path.keys : [];
	if (!keys.length)
		return null;
	if (keys.length == 1)
		return { position: keys[0].position.slice(), heading: headingOf(keys[0]) };

	const period = path.period;
	const t = ((time % period) + period) % period;
	const n = keys.length;

	// The key at or before t, wrapping to the last one before the period's start.
	let i = n - 1;
	for (let k = 0; k < n; k++) {
		if (keys[k].time <= t)
			i = k;
	}
	const at = (k) => keys[((k % n) + n) % n];
	// A neighbour's time, unwrapped by whole periods so the segment's two ends and their neighbours run forward.
	const unwrap = (k) => {
		const wraps = Math.floor(k / n);
		return at(k).time + wraps * period;
	};
	let t0 = unwrap(i);
	let t1 = unwrap(i + 1);
	let now = t;
	if (now < t0)
		now += period;
	if (t1 <= t0)
		t1 += period;
	const dt = t1 - t0;
	const s = dt > 0 ? (now - t0) / dt : 0;

	const p0 = at(i).position, p1 = at(i + 1).position;
	// A `via` on the key the segment leaves bends it through that point; without one the walk is the Hermite.
	const via = at(i).via;
	const through = Array.isArray(via) && via.length == 3 && via.every(Number.isFinite) ? via : null;
	const tangent = (k) => {
		const here = at(k).position, before = at(k - 1).position, after = at(k + 1).position;
		if (same(here, before) || same(here, after))
			return [0, 0, 0];
		const span = unwrap(k + 1) - unwrap(k - 1);
		return [0, 1, 2].map((c) => (after[c] - before[c]) / span);
	};

	const s2 = s * s, s3 = s2 * s;
	let position;
	if (through) {
		// The quadratic through `through` at s = 1/2: its control point is that point's reflection of the
		// segment's middle.
		const q = [0, 1, 2].map((c) => 2 * through[c] - (p0[c] + p1[c]) / 2);
		position = [0, 1, 2].map((c) => (1 - s) * (1 - s) * p0[c] + 2 * (1 - s) * s * q[c] + s2 * p1[c]);
	} else {
		const m0 = tangent(i), m1 = tangent(i + 1);
		const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
		position = [0, 1, 2].map((c) => h00 * p0[c] + h10 * dt * m0[c] + h01 * p1[c] + h11 * dt * m1[c]);
	}

	const ease = s2 * (3 - 2 * s);
	const a0 = headingOf(at(i));
	const spin = Number.isFinite(at(i).spin) ? at(i).spin : 0;
	const heading = a0 + shortest(a0, headingOf(at(i + 1))) * ease + spin * 2 * Math.PI * s;

	return { position, heading };
}

/** Every key's position, and the path sampled between them — for framing a camera round a moving pattern. */
export function pathSamples(path, count = 64) {
	if (!path || !path.keys || !path.keys.length)
		return [];
	const out = [];
	for (let k = 0; k < count; k++)
		out.push(pathPose(path, (k / count) * path.period));
	return out;
}
