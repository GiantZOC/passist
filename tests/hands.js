import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { fromBody, handSteps, toBody } from '../src/lib/hands.mjs';

const dwell = (start, duration) => ({ start, duration });

// What animation.mjs built before hands.mjs: every dwell, with an empty move to it from the one before.
function oldSteps(dwells, period) {
	const steps = [];
	let last = dwells.length - 1;
	dwells.forEach((curve, i) => {
		const start = dwells[last].start + dwells[last].duration;
		const end = curve.start;
		steps.push({ gap: true, before: last, after: i, start, duration: end - start + (end > start ? 0 : period) });
		steps.push({ dwell: i, from: 0 });
		last = i;
	});
	return steps;
}

/** The stretches of the period the steps cover, which must tile it exactly once. */
function covered(steps, dwells, period) {
	let total = 0;
	for (const step of steps)
		total += step.gap ? step.duration : (1 - step.from) * dwells[step.dwell].duration;
	return total / period;
}

test('dwells that take turns are what they always were', () => {
	const period = 4;
	for (const dwells of [
		[dwell(0, 1)],
		[dwell(0, 1), dwell(2, 1)],
		[dwell(0.5, 1), dwell(2.5, 1)],
		[dwell(1, 1), dwell(3, 1.5)], // the last one runs past the period's end
	]) {
		assert.equal(handSteps(dwells, period), oldSteps(dwells, period));
		assert.ok(Math.abs(covered(handSteps(dwells, period), dwells, period) - 1) < 1e-12);
	}
});

test('a hand still holding a carried club takes up the next one only once it throws', () => {
	// A club held from 13 to 18 (round the period's end, at 2), the next caught at 1 and thrown at 6.
	const period = 16;
	const dwells = [dwell(1, 5), dwell(5, 5), dwell(13, 5)];
	const steps = handSteps(dwells, period);
	assert.equal(steps, [
		{ dwell: 0, from: 0.2 },
		{ dwell: 1, from: 0.2 },
		{ gap: true, before: 1, after: 2, start: 10, duration: 3 },
		{ dwell: 2, from: 0 },
	]);
	assert.ok(Math.abs(covered(steps, dwells, period) - 1) < 1e-12);
});

test('a dwell wholly inside another is left to the club, not the hand', () => {
	const steps = handSteps([dwell(0, 3), dwell(1, 1), dwell(3, 1)], 4);
	assert.equal(steps.filter(step => !step.gap).map(step => step.dwell), [0, 2]);
});

test('a point goes into a juggler\'s coordinates and back unchanged', () => {
	const pose = { position: [1.5, 0, -2], heading: 0.7 };
	const point = [0.3, 1.2, -0.4];
	const back = fromBody(pose, toBody(pose, point));
	point.forEach((v, i) => assert.ok(Math.abs(back[i] - v) < 1e-12));
	// Straight ahead of a juggler facing along heading h is (sin h, 0, cos h) in the world.
	const ahead = fromBody({ position: [0, 0, 0], heading: 0.7 }, [0, 0, 1]);
	assert.ok(Math.abs(ahead[0] - Math.sin(0.7)) < 1e-12 && Math.abs(ahead[2] - Math.cos(0.7)) < 1e-12);
});

test.run();
