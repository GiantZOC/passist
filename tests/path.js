import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { pathPose, pathSamples } from '../src/lib/path.mjs';

// A key: a place on the floor, the point the juggler looks at, and `time` beats into the path.
const key = (time, x, z = 0, lookAt = [x, 0, z + 1]) => ({ time, position: [x, 0, z], lookAt });

const close = (actual, expected, at) => assert.ok(
	Math.abs(actual - expected) < 1e-9, `${at}: ${actual} is not ${expected}`);

const facingKey = (time, degrees) => ({
	time,
	position: [0, 0, 0],
	lookAt: [Math.sin(degrees * Math.PI / 180), 0, Math.cos(degrees * Math.PI / 180)],
});

test('a path with no keys has no pose', () => {
	assert.is(pathPose({ period: 2, keys: [] }, 0), null);
	assert.is(pathPose({ period: 2 }, 0.5), null);
	assert.is(pathPose(null, 0), null);
});

test('one key stands still, facing where it looks', () => {
	const path = { period: 2, keys: [key(0, 1, 2, [1, 0, 3])] };
	for (const t of [0, 0.5, 2, -3]) {
		const pose = pathPose(path, t);
		assert.equal(pose.position, [1, 0, 2]);
		close(pose.heading, 0, `heading at ${t}`);
	}
});

test('the walk closes: the period is the first key again', () => {
	const path = { period: 4, keys: [key(0, 0, 0), key(1, 2, 0), key(2, 2, 2), key(3, 0, 2)] };
	const first = pathPose(path, 0);
	for (const t of [4, 8, -4]) {
		const again = pathPose(path, t);
		close(again.position[0], first.position[0], `x at ${t}`);
		close(again.position[2], first.position[2], `z at ${t}`);
		close(again.heading, first.heading, `heading at ${t}`);
	}
});

test('a time outside the period wraps into it, either way', () => {
	const path = { period: 4, keys: [key(0, 0), key(1, 2), key(2, 0), key(3, -2)] };
	assert.equal(pathPose(path, 2.5).position, pathPose(path, -1.5).position);
	assert.equal(pathPose(path, 5.25).position, pathPose(path, 1.25).position);
});

test('a station held for a beat is a stop; a key passed through is walked through', () => {
	const held = { period: 4, keys: [key(0, 0), key(1, 0), key(2, 1), key(3, 1)] };
	const through = { period: 3, keys: [key(0, 0), key(1, 1), key(2, 2)] };
	const leave = (path, from) => pathPose(path, from + 0.05).position[0] - pathPose(path, from).position[0];
	assert.ok(leave(held, 1) < 0.02, `leaving a held station starts slowly (${leave(held, 1)})`);
	assert.ok(leave(through, 1) > 0.04, `passing a station keeps walking (${leave(through, 1)})`);
});

test('a key at an uneven time gets the share of the walk it asks for', () => {
	// Four beats with keys at 0 and 3: three beats of walking out, one beat of walking back.
	const path = { period: 4, keys: [key(0, 0), key(3, 2)] };
	close(pathPose(path, 1.5).position[0], 1, 'halfway in time is halfway in space');
	close(pathPose(path, 3.5).position[0], 1, 'the last beat walks back the same way');
	close(pathPose(path, 3).position[0], 2, 'the key is reached on its own beat');
	let last = -Infinity;
	for (let n = 0; n < 30; n++) {
		const x = pathPose(path, n / 10).position[0];
		assert.ok(x > last - 1e-9, `the walk out never turns back (${x} after ${last})`);
		last = x;
	}
});

test('the facing turns the short way round, not the long way', () => {
	// Facing 170 degrees, then -170: the turn is 20 degrees through 180, not 340 through 0.
	const path = { period: 2, keys: [facingKey(0, 170), facingKey(1, -170)] };
	const between = pathPose(path, 0.5).heading * 180 / Math.PI;
	assert.ok(Math.abs(between) > 175 && Math.abs(between) <= 180, `halfway is behind, not in front (${between})`);
	close(pathPose(path, 1).heading * 180 / Math.PI, -170, 'the second key is faced exactly');
});

test('a pirouette is facing keys all the way round', () => {
	const path = { period: 4, keys: [0, 90, 180, 270].map((degrees, beat) => facingKey(beat, degrees)) };
	// The heading is the key's angle plus the turn so far, so it is not kept inside half a turn: a juggler who
	// passes 180 keeps counting up, and only the direction — the sine and cosine of it — is continuous.
	const at = (t) => pathPose(path, t).heading * 180 / Math.PI;
	let last = at(0), turned = 0;
	for (let n = 1; n <= 40; n++) {
		const degrees = at(n / 10);
		const step = ((degrees - last) % 360 + 360) % 360;
		assert.ok(step < 45, `the facing never jumps (${step} degrees from ${last} to ${degrees})`);
		turned += step;
		last = degrees;
	}
	close(turned, 360, 'one turn of the whole cycle');
	// At the period the facing is the first key's again, in the same direction however it is written.
	const start = pathPose(path, 0).heading, again = pathPose(path, 4).heading;
	close(Math.sin(again), Math.sin(start), 'the facing at the period');
	close(Math.cos(again), Math.cos(start), 'the facing at the period');
});

test('a via point bends the walk through it, at the segment\'s middle', () => {
        const path = { period: 2, keys: [{ ...key(0, 0, 0), via: [0, 0, 2] }, key(1, 2, 0)] };
        const half = pathPose(path, 0.5);
        close(half.position[0], 0, 'x at the middle is the via point, not the chord\'s middle');
        close(half.position[2], 2, 'z at the middle is the via point');
        const straight = pathPose({ period: 2, keys: [key(0, 0, 0), key(1, 2, 0)] }, 0.5);
        assert.ok(Math.abs(straight.position[2]) < 1e-9, `a walk with no via stays on the line (${straight.position[2]})`);
        close(pathPose(path, 1).position[0], 2, 'and the walk still reaches the next key');
});

test('a spin turns the juggler on the way round, on top of the facing', () => {
        const path = { period: 2, keys: [{ ...key(0, 0), spin: 1 }, key(1, 2)] };
        close(pathPose(path, 0).heading, 0, 'the key faces where it looks at its own time');
        close(pathPose(path, 0.5).heading, Math.PI, 'half a turn at the segment\'s middle');
        // Just before the next key, which is where the spin's whole turn has been made.
        assert.ok(Math.abs(pathPose(path, 0.999).heading - 2 * Math.PI) < 0.02, 'a whole turn by the end');
        close(pathPose(path, 2).heading, 0, 'and the cycle closes on the first key again');

        // A spin adds to the turn to the next key's facing: facing +z then -z is half a turn already.
        const both = { period: 2, keys: [{ ...key(0, 0, 0), spin: 0.5 }, facingKey(1, 180)] };
        const end = pathPose(both, 0.999).heading;
        assert.ok(Math.abs(Math.cos(end) - 1) < 0.02 && Math.abs(Math.sin(end)) < 0.02,
                `half a turn to face the other way and half a spin is a whole turn (${end})`);
});

// How fast a pose changes either side of a time, so a test can say a walk or a turn does not jerk there.
const headingOf = (pose) => pose.heading;
const rate = (path, t, read, side) => {
	const h = 1e-5;
	// An angle is only a direction: a heading counted from a different key may differ by whole turns.
	const turn = (d) => d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
	const step = (a, b) => (read === headingOf ? turn(read(b) - read(a)) : read(b) - read(a)) / h;
	return side < 0 ? step(pathPose(path, t - h), pathPose(path, t)) : step(pathPose(path, t), pathPose(path, t + h));
};

test('a juggler turning as they walk through a key keeps turning, at the same rate', () => {
	// Walking a square and facing the way round: every key is passed through, and so is every turn.
	const corner = (time, x, z, degrees) => ({ ...key(time, x, z), lookAt: [x + Math.sin(degrees * Math.PI / 180), 0, z + Math.cos(degrees * Math.PI / 180)] });
	const path = { period: 4, keys: [corner(0, 0, 0, 0), corner(1, 1, 0, 90), corner(2, 1, 1, 180), corner(3, 0, 1, 270)] };
	const heading = headingOf;
	for (const t of [1, 2, 3]) {
		const into = rate(path, t, heading, -1), out = rate(path, t, heading, 1);
		assert.ok(Math.abs(into) > 0.5, `still turning into the key at ${t} (${into})`);
		assert.ok(Math.abs(into - out) < 1e-3, `the turn does not jerk at ${t} (${into} then ${out})`);
	}
});

test('a walk through a via point meets the walks either side of it at the same speed', () => {
	const path = { period: 4, keys: [key(0, 0, 0), { ...key(1, 1, 0), via: [1.5, 0, 0.5] }, key(2, 2, 0), key(3, 1, -1)] };
	for (const read of [(pose) => pose.position[0], (pose) => pose.position[2]]) {
		for (const t of [1, 1.5, 2]) {
			const into = rate(path, t, read, -1), out = rate(path, t, read, 1);
			assert.ok(Math.abs(into - out) < 1e-3, `no jump in speed at ${t} (${into} then ${out})`);
		}
	}
});

test('a key marked stop is a standstill on the way round, not a beat stood still', () => {
	const round = { period: 4, keys: [key(0, 0, 0), { ...key(1, 1, 0), stop: true }, key(2, 2, 0), key(3, 1, -1)] };
	const x = (pose) => pose.position[0];
	assert.ok(Math.abs(rate(round, 1, x, -1)) < 1e-3, `slowed to a standstill arriving (${rate(round, 1, x, -1)})`);
	assert.ok(Math.abs(rate(round, 1, x, 1)) < 1e-3, `and sets off from one (${rate(round, 1, x, 1)})`);
	assert.ok(Math.abs(rate(round, 1.5, x, 1)) > 0.5, 'walking again half a beat later');
	const through = { period: 4, keys: [key(0, 0, 0), key(1, 1, 0), key(2, 2, 0), key(3, 1, -1)] };
	assert.ok(Math.abs(rate(through, 1, x, 1)) > 0.5, 'the same key unmarked is walked through');
});

test('samples walk the cycle and stop before the repeat', () => {
	const path = { period: 4, keys: [key(0, 0), key(1, 2), key(2, 2), key(3, 0)] };
	const samples = pathSamples(path, 8);
	assert.is(samples.length, 8);
	assert.equal(samples[0].position, [0, 0, 0]);
	assert.equal(samples[4].position, [2, 0, 0]);
	assert.is(pathSamples({ period: 2, keys: [] }, 8).length, 0);
});

test.run();
