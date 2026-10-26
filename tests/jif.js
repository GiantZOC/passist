import { test } from 'uvu';
import * as assert from 'uvu/assert';
import Jif from '../src/lib/jif.mjs';
import * as fs from 'fs';

function testName(input) {
	return (typeof input) + ' ' + (typeof input == 'string' ? input : JSON.stringify(input));
}

function completeSuccess(input, options, jif, warnings = []) {
	test(testName(input) + ' expecting success', () => {
		const res = Jif.complete(input, options);
		assert.equal(
			{ jif: res.jif, warnings: res.warnings },
			{ jif, warnings }
		);
	});
}

function completeFail(input, expects) {
	test(testName(input) + ' expecting exception', () => {
		assert.throws(
			() => Jif.complete(input),
			expects
		);
	});
}

function read(path) {
	return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const emptyJif = {
	meta: {},
	jugglers: [],
	limbs:  [],
	props:  [],
	throws: [],
	repetition:  {},
	"timeStretchFactor": 1
};

completeSuccess('{}', {}, emptyJif);
completeSuccess({},   {}, emptyJif);
completeSuccess({
	meta: 'invalid',
	jugglers: 'invalid',
}, {}, emptyJif, [
	"meta is not an object",
	"jugglers is not an array"
]);

completeFail('{'); // Unexpected end of JSON input
completeFail('"foo"');
completeFail('[]');
completeFail([]);
completeFail(null);

completeSuccess(
	read('tests/jif/holygrail_in.jif'),
	{},
	read('tests/jif/holygrail_out.jif'),
	[],
);

completeSuccess(
	read('tests/jif/holygrail_in.jif'),
	{ "expand": 1 },
	read('tests/jif/holygrail_expanded.jif'),
	[],
);

completeSuccess(
	read('tests/jif/6x4_in.jif'),
	{},
	read('tests/jif/6x4_out.jif'),
	[],
);

completeSuccess(
	read('tests/jif/swinging_door_in.jif'),
	{},
	read('tests/jif/swinging_door_out.jif'),
	[],
);

completeSuccess(
	read('tests/jif/4px_in.jif'),
	{},
	read('tests/jif/4px_out.jif'),
	[],
);

completeSuccess(
	read('tests/jif/5ball_split_multiplex_in.jif'),
	{ propType: 'ball' },
	read('tests/jif/5ball_split_multiplex_out.jif'),
	[],
);

completeSuccess(
	read('tests/jif/mild_madness_sync_in.jif'),
	{},
	read('tests/jif/mild_madness_sync_out.jif'),
	[],
);

completeSuccess(
	read('tests/jif/4count_vs_3count_in.jif'),
	{},
	read('tests/jif/4count_vs_3count_out.jif'),
	[],
);

// A solo cascade to hang paths off: one juggler, two hands, one club.
function solo3(overwrite = {}) {
        return Object.assign({
                meta: {},
                jugglers: [{ name: 'A', position: [0, 0, 0], lookAt: [0, 0, 1] }],
                limbs: [{ juggler: 0, type: 'right hand' }, { juggler: 0, type: 'left hand' }],
                props: [{ type: 'club', color: '#ffffff' }],
                throws: [
                        { time: 0, duration: 1, from: 0, to: 1, prop: 0 },
                        { time: 1, duration: 1, from: 1, to: 0, prop: 0 },
                ],
                repetition: { period: 2, limbPermutation: [0, 1], propPermutation: [0] },
                timeStretchFactor: 1,
        }, overwrite);
}

const key = (time, position, lookAt = [0, 0, 0]) => ({ time, position, lookAt });

test('a path is put in time order, and starts where the juggler stands', () => {
        const { jif, warnings } = Jif.complete(solo3({
                jugglers: [{
                        name: 'A',
                        position: [0, 0, 0],
                        lookAt: [0, 0, 1],
                        path: { period: 2, keys: [key(1, [1, 0, 0], [1, 0, 1]), key(0.5, [0.5, 0, 0], [0.5, 0, 1])] },
                }],
        }));
        assert.equal(warnings, []);
        assert.equal(jif.jugglers[0].path, {
                period: 2,
                keys: [
                        key(0, [0, 0, 0], [0, 0, 1]),
                        key(0.5, [0.5, 0, 0], [0.5, 0, 1]),
                        key(1, [1, 0, 0], [1, 0, 1]),
                ],
        });
        assert.equal(jif.meta.passistExtensions, ['path']);
});

test('a two-number path key is a place on the floor, as a position is', () => {
        const { jif } = Jif.complete(solo3({
                jugglers: [{ name: 'A', position: [0, 0, 0], lookAt: [0, 0, 1], path: { period: 2, keys: [key(0, [1, 2]), key(1, [2, 1])] } }],
        }));
        assert.equal(jif.jugglers[0].path.keys.map((one) => one.position), [[1, 0, 2], [2, 0, 1]]);
});

test('the juggler stands at the path\'s first key, not where the jif put them', () => {
        const { jif } = Jif.complete(solo3({
                jugglers: [{ name: 'A', position: [9, 0, 9], lookAt: [9, 0, 9], path: { period: 2, keys: [key(0, [1, 0, 0], [1, 0, 1])] } }],
        }));
        assert.equal(jif.jugglers[0].position, [1, 0, 0]);
        assert.equal(jif.jugglers[0].lookAt, [1, 0, 1]);
});

test('a key on the beat the path repeats at closes it, or is reported', () => {
        const closes = Jif.complete(solo3({
                jugglers: [{ name: 'A', position: [1, 0, 0], lookAt: [1, 0, 1], path: { period: 2, keys: [key(0, [1, 0, 0], [1, 0, 1]), key(2, [1, 0, 0], [1, 0, 1])] } }],
        }));
        assert.equal(closes.warnings, []);
        assert.equal(closes.jif.jugglers[0].path.keys.length, 1);

        const jumps = Jif.complete(solo3({
                jugglers: [{ name: 'A', position: [1, 0, 0], lookAt: [1, 0, 1], path: { period: 2, keys: [key(0, [1, 0, 0], [1, 0, 1]), key(2, [3, 0, 0], [1, 0, 1])] } }],
        }));
        assert.equal(jumps.warnings, ['jugglers[0].path ends at [3,0,0], not where it starts, [1,0,0]']);
});

test('a path written over one round repeats when the repetition is expanded', () => {
        const { jif, warnings } = Jif.complete(solo3({
                // A limb permutation of two puts the hands back where they started after two rounds.
                repetition: { period: 2, limbPermutation: [1, 0], propPermutation: [0] },
                jugglers: [{
                        name: 'A',
                        position: [0, 0, 0],
                        lookAt: [0, 0, 1],
                        path: { period: 2, keys: [key(0, [0, 0, 0], [0, 0, 1]), key(1, [1, 0, 0], [1, 0, 1])] },
                }],
        }), { expand: true });
        assert.equal(warnings, []);
        assert.equal(jif.repetition.period, 4);
        assert.equal(jif.jugglers[0].path, {
                period: 4,
                keys: [
                        key(0, [0, 0, 0], [0, 0, 1]),
                        key(1, [1, 0, 0], [1, 0, 1]),
                        key(2, [0, 0, 0], [0, 0, 1]),
                        key(3, [1, 0, 0], [1, 0, 1]),
                ],
        });
});

test('a path over a different round than the pattern is reported, and kept', () => {
        const { jif, warnings } = Jif.complete(solo3({
                jugglers: [{ name: 'A', position: [0, 0, 0], lookAt: [0, 0, 1], path: { period: 3, keys: [key(0, [0, 0, 0], [0, 0, 1]), key(1, [1, 0, 0], [1, 0, 1])] } }],
        }));
        assert.equal(warnings, ['jugglers[0].path runs 3 beats, which does not divide the 2 the pattern repeats over']);
        assert.equal(jif.jugglers[0].path.period, 3);
});

test('a path that cannot be read is dropped, so the juggler still animates where they stand', () => {
        const broken = Jif.complete(solo3({
                jugglers: [{ name: 'A', position: [0, 0, 0], lookAt: [0, 0, 1], path: { period: 2, keys: [key(0, [0, 0, 0]), { time: 'one', position: [1, 0, 0] }] } }],
        }));
        assert.equal(broken.warnings, ['jugglers[0].path.keys[1] needs a time and a position, dropping it']);
        assert.equal(broken.jif.jugglers[0].path.keys.length, 1);

        const noKeys = Jif.complete(solo3({ jugglers: [{ name: 'A', path: { keys: [] } }] }));
        assert.equal(noKeys.warnings, ['jugglers[0].path has no usable keys, removing it']);
        assert.equal(noKeys.jif.jugglers[0].path, undefined);
        assert.equal(noKeys.jif.meta.passistExtensions, undefined);

        const noPeriod = Jif.complete(solo3({
                repetition: {},
                jugglers: [{ name: 'A', path: { keys: [key(0, [0, 0, 0])] } }],
        }));
        assert.equal(noPeriod.jif.jugglers[0].path, undefined);
});

test('a still jif keeps no path and names no extension', () => {
        const { jif } = Jif.complete(solo3());
        assert.equal(jif.jugglers[0].path, undefined);
        assert.equal(jif.meta.passistExtensions, undefined);
});

test.run();
