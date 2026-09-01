import { test } from 'uvu';
import * as assert from 'uvu/assert';
import AsyncSiteswap from '../src/lib/async-siteswap.mjs';
import Jif from '../src/lib/jif.mjs';
import Siteswap from '../src/lib/siteswap.mjs';

/*
 * Every pattern here is a row in the database, or an explicit rejection case. Period-2 group 0
 * (partner group 2): 03 07 0B 25 29 34 38 3C 47 4B 56 5A ...; group 2: 05 09 23 27 2B 36 3A 45 49
 * 58 5C 67 6B ...; group 1 (its own partner): 33 37 3B 55 59 77 7B 99 BB; group 3 (its own
 * partner): 00 04 08 0C 22 26 2A 44 48 4C 66 6A ...
 *
 * The throw heights generated are 0 and 2..C. There is no 1 anywhere in the dataset, which is why
 * "441" and "51" below are rejection cases rather than patterns.
 */

// Why this class exists: the synchronous checker rejects these patterns. It applies
// (j + height) % period, which is the wrong frame for a passing pattern.
test('siteswap.mjs cannot speak async', () => {
	assert.is(new Siteswap('30').isValid(), false);
	assert.is(new AsyncSiteswap('30').isValid(), true);
	assert.is(new AsyncSiteswap('444').isValid(), true);
});

test('validity is the landing slots filling the frame', () => {
	for (const pattern of ['03', '23', '44', '99', '444', '333'])
		assert.is(new AsyncSiteswap(pattern).isValid(), true, pattern);

	assert.is(new AsyncSiteswap('42').isValid(), false, 'both throws land on the same slot');
	assert.is(new AsyncSiteswap('3').isValid(), false, 'period 1 is not a pattern');
	assert.is(new AsyncSiteswap('3G').isValid(), false, 'a height of 16 does not fit the packing');
	assert.is(new AsyncSiteswap('3Z').isValid(), false, 'letters are digits up to 35, so this needs bounding too');
});

test('1 is not a throw height here', () => {
	for (const pattern of ['441', '51', '1', '31', '10'])
		assert.is(new AsyncSiteswap(pattern).isValid(), false, pattern + ' names a height that is never thrown');
});

test('heights above 9 are written as letters', () => {
	assert.is(new AsyncSiteswap('0b').heightsToString(), '0B');
	assert.is(new AsyncSiteswap('0B').throwSum, 11);
	assert.is(new AsyncSiteswap('0C').maxThrow, 12);
});

test('facet values', () => {
	const p = new AsyncSiteswap('25');
	assert.is(p.period, 2);
	assert.is(p.throwSum, 7);
	assert.is(p.maxThrow, 5);
	assert.is(p.minThrow, 2);
	assert.is(p.hasZero, false);
	assert.is(p.nPasses, 1, 'the 5 is odd so it arrives on the partner\'s beat; the 2 stays home');

	const z = new AsyncSiteswap('03');
	assert.is(z.minThrow, 3, 'an empty hand is not the shortest throw');
	assert.is(z.hasZero, true);
	assert.is(z.nPasses, 1);

	const none = new AsyncSiteswap('00');
	assert.is(none.minThrow, 0, 'nothing is ever thrown');
	assert.is(none.throwSum, 0);
	assert.is(none.nPasses, 0);
});

test('a rotation class is named after its smallest rotation', () => {
	assert.is(new AsyncSiteswap('30').canonicString(), '03');
	assert.is(new AsyncSiteswap('774').canonicString(), '477');
	assert.is(new AsyncSiteswap('630').canonicString(), '063');
	assert.is(new AsyncSiteswap('063').canonicString(), '063');
	assert.is(new AsyncSiteswap('5A').canonicString(), '5A', 'already canonical');
});

test('an odd period needs two turns of the 2p frame to resume on the same hands', () => {
	assert.is(new AsyncSiteswap('03').cycleFrame, 4);
	assert.is(new AsyncSiteswap('444').cycleFrame, 12, 'period 3: two turns of 6 beats');
	assert.is(new AsyncSiteswap('4444').cycleFrame, 8, 'period 4 closes in one turn');
});

test('the pair is written in one shared frame, one beat apart', () => {
	assert.equal(new AsyncSiteswap('03').pairThrows('23'), [
		{ time: 1, duration: 2, from: 2, to: 3 },    // B's 2, thrown on the odd beat
		{ time: 2, duration: 3, from: 1, to: 2 },    // A's 3 - an odd height, so a pass
		{ time: 3, duration: 3, from: 3, to: 1 },    // B's 3, a pass back
	]);
});

test('balls in a pair depend on the partner, not on the pattern', () => {
	const a = new AsyncSiteswap('03');
	const partners = ['23', '27', '2B', '58', '67', '6B'];   // all group 2, which is group 0's partner
	assert.equal(partners.map(b => a.props(b)), [2, 3, 4, 4, 4, 5]);
});

test('odd periods are expanded, or Jif counts the balls twice', () => {
	// With the pair compressed into one 2p frame and the hand swap carried as a limb permutation -
	// the first attempt - Jif.complete() reported 8 balls for this pair instead of 4, because it
	// applies that permutation to a throw as a whole, and a throw caught in the next turn goes to
	// the limb the permutation picked for the thrower.
	const pair = new AsyncSiteswap('444');
	assert.is(pair.props('444'), 4);
	assert.is(Jif.complete(pair.toPairJif('444')).jif.props.length, 4);
});

test('realizability, and the refusals that keep Jif.complete() from running forever', () => {
	for (const [a, b] of [['03', '23'], ['03', '6B'], ['444', '444']])
		assert.is(new AsyncSiteswap(a).isRealizable(b), true, a + '+' + b);

	// Every height here is even, so nothing crosses between the jugglers: it is two solo 4-counts
	// running a beat apart. Realizable, and a pair worth catching in the UI as "not a passing
	// pattern" rather than treating as a partnership.
	assert.is(new AsyncSiteswap('44').isRealizable('44'), true);

	assert.is(new AsyncSiteswap('00').isRealizable('00'), false, 'nothing is ever thrown');
	assert.is(new AsyncSiteswap('03').isRealizable('03'), false, '1.5 balls each is not a pair');
	assert.is(new AsyncSiteswap('25').isRealizable('67'), false, 'two throws aimed at one catch');
	assert.is(new AsyncSiteswap('03').isRealizable('99'), false, 'a catch with no throw due at it');
});

test('Jif.complete() agrees on ball count and reports no warnings', () => {
	for (const [a, b] of [['03', '23'], ['03', '6B'], ['444', '444']]) {
		const pair = new AsyncSiteswap(a);
		assert.is(pair.isRealizable(b), true, a + '+' + b + ' should be realizable');

		const { jif, warnings } = Jif.complete(pair.toPairJif(b));
		assert.equal(warnings, [], a + '+' + b + ' produced warnings');
		assert.is(jif.props.length, pair.props(b), a + '+' + b + ' ball count');
		assert.is(jif.repetition.period, pair.cycleFrame, a + '+' + b + ' repetition');
	}
});

test('ground state is read from the prop permutation Jif.complete() assigns', () => {
	const still = new AsyncSiteswap('444').toPairJif('444');
	assert.ok(Jif.complete(still).jif.repetition.propPermutation.every((v, i) => v === i), '444+444');

	const moving = new AsyncSiteswap('03').toPairJif('23');
	assert.ok(Jif.complete(moving).jif.repetition.propPermutation.some((v, i) => v !== i), '03+23');
});

test('findPartner takes the first candidate that works', () => {
	assert.is(new AsyncSiteswap('03').findPartner(['00', '03', '99', '23']), '23');
	assert.is(new AsyncSiteswap('03').findPartner(['00', '03']), null);
});

test.run();
