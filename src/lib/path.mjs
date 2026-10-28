/**
 * Where a moving juggler is, and which way they face, at a time — from the path a JIF gives them.
 *
 *   jugglers[i].path = { period, keys: [{ time, position: [x, y, z], lookAt: [x, y, z] }] }
 *
 * Times are beats, repeating every `period`. Between keys the juggler moves along a Hermite curve: a key the
 * juggler arrives at and stays on (the next or the previous key is the same place) is a stop, so a juggler who
 * holds a spot for a beat and then walks eases off it and back onto the next; a key passed through on the way
 * (a point on a figure-eight) is crossed at the speed its neighbours give it, Catmull-Rom style, without a stop.
 * The facing is eased the same way, counted on round the keys the short way: a juggler who turns as they walk
 * through a key keeps turning through it, and only a key facing the way its neighbour does is a stop in the turn.
 *
 * A key can say two more things about the walk that leaves it:
 *
 *   via: [x, y, z]   a point the walk passes through on its way to the next key, for a curve round something
 *                    standing in the way. The segment becomes two Hermite halves meeting at the point half way
 *                    through, crossing it parallel to the chord, so the walk bulges out and comes back at the
 *                    same speed as the walks either side of it.
 *   spin: 1          turns made getting to the next key, on top of the facing turning to wherever the next key
 *                    looks — a pirouette while walking, and 0.5 ends facing the other way.
 *
 * And one about the key itself:
 *
 *   stop: true       the juggler comes to a standstill on the key and sets off again, without staying on it for
 *                    a beat: a brief stop to make a pass on the way round.
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

	// A key's neighbours on the walk: the `via` of the segment either side of it when there is one, so a bend and
	// the walks either side of it meet at the same speed. Each is a point and the time it is reached.
	const viaOf = (k) => {
		const via = at(k).via;
		return Array.isArray(via) && via.length == 3 && via.every(Number.isFinite) ? via : null;
	};
	const before = (k) => viaOf(k - 1)
		? { position: viaOf(k - 1), time: (unwrap(k - 1) + unwrap(k)) / 2 }
		: { position: at(k - 1).position, time: unwrap(k - 1) };
	const after = (k) => viaOf(k)
		? { position: viaOf(k), time: (unwrap(k) + unwrap(k + 1)) / 2 }
		: { position: at(k + 1).position, time: unwrap(k + 1) };
	// A key held (the juggler stays on it a beat either side) is a stop; any other is walked through at the
	// speed its neighbours give it.
	const tangent = (k) => {
		const here = at(k).position;
		if (at(k).stop || same(here, at(k - 1).position) || same(here, at(k + 1).position))
			return [0, 0, 0];
		const b = before(k), a = after(k);
		return [0, 1, 2].map((c) => (a.position[c] - b.position[c]) / (a.time - b.time));
	};
	const hermite = (s, span, p0, m0, p1, m1) => {
		const s2 = s * s, s3 = s2 * s;
		const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
		return p0.map((_, c) => h00 * p0[c] + h10 * span * m0[c] + h01 * p1[c] + h11 * span * m1[c]);
	};

	const p0 = at(i).position, p1 = at(i + 1).position;
	const m0 = tangent(i), m1 = tangent(i + 1);
	const through = viaOf(i);
	let position;
	if (through) {
		// Two Hermite halves meeting at the via point half way through the segment, crossing it along the chord.
		const half = dt / 2;
		const mid = [0, 1, 2].map((c) => (p1[c] - p0[c]) / dt);
		position = s < 0.5
			? hermite(s * 2, half, p0, m0, through, mid)
			: hermite(s * 2 - 1, half, through, mid, p1, m1);
	} else {
		position = hermite(s, dt, p0, m0, p1, m1);
	}

	// The facing, counted on from the first key's so that it never jumps: each key turns the short way from the
	// one before, plus the spin made on the way. It is eased the same way as the walk, so a juggler turning while
	// they walk through a key keeps turning, and one who stops turning (a key facing the same way as a neighbour)
	// eases in and out of it.
	const turnTo = [0];
	for (let k = 1; k <= n; k++) {
		const spin = Number.isFinite(at(k - 1).spin) ? at(k - 1).spin : 0;
		turnTo.push(turnTo[k - 1] + shortest(headingOf(at(k - 1)), headingOf(at(k))) + spin * 2 * Math.PI);
	}
	const lap = turnTo[n];
	const facing = (k) => headingOf(keys[0]) + turnTo[((k % n) + n) % n] + Math.floor(k / n) * lap;
	const turning = (k) => {
		const here = facing(k), was = facing(k - 1), next = facing(k + 1);
		if (at(k).stop || Math.abs(here - was) < EPS || Math.abs(here - next) < EPS)
			return [0];
		return [(next - was) / (unwrap(k + 1) - unwrap(k - 1))];
	};
	const a0 = facing(i);
	const heading = headingOf(at(i)) + hermite(s, dt, [0], turning(i), [facing(i + 1) - a0], turning(i + 1))[0];

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
