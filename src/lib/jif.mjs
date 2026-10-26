import { Heap } from 'heap-js';

function _enforceType({jif, warnings, key, type })
{
	if (type != 'object' && type != 'array')
		throw `type ${type} not implemented`;

	const empty = type == 'object' ? {} : [];

	if (jif[key] === undefined)
		jif[key] = empty;

	if (!(
		typeof jif[key] == 'object'
		&& ((type == 'array') == Array.isArray(jif[key]))
	)) {
		warnings.push(`${key} is not an ${type}`);

		jif[key] = empty;
	}

	if (type == 'array') {
		for (let i = 0; i < jif[key].length; i++) {
			const val = jif[key][i];
			if (typeof val != 'object' || Array.isArray(val)) {
				warnings.push(`${key}[${i}] is not an object`);
				jif[key][i] = {};
			}
		}
	}
}

function _ensureEnoughLimbs({ jif, warnings })
{
	const minLimbs = Math.max(
		...jif.throws.map(t => t.from),
		...jif.throws.map(t => t.to)
	) + 1;

	if (jif.limbs.length < minLimbs) {
		if (jif.limbs.length)
			warnings.push(`not enough limbs specified - needing ${minLimbs}`);
		const missing = minLimbs - jif.limbs.length;
		for (let i = 0; i < missing; i++)
			jif.limbs.push({});
	}
}

/**
 * ensure juggler array is big enough
 * assumes two hands per juggler if no assignments given
 */
function _ensureEnoughJugglers({ jif, warnings })
{
	const maxJuggler = Math.max(...jif.limbs.map(l => l.juggler));
	const minJugglers = isNaN(maxJuggler) ? Math.ceil(jif.limbs.length / 2) : maxJuggler + 1;

	if (jif.jugglers.length < minJugglers) {
		if (jif.jugglers.length)
			warnings.push(`not enough jugglers specified - needing ${minJugglers}`);
		const missing = minJugglers - jif.jugglers.length;
		for (let i = 0; i < missing; i++)
			jif.jugglers.push({});
	}
}

/**
 * complete limb details
 * assumes two hands per juggler if no assignments given
 */
function _completeLimbDetails({ jif, warnings, nJugglers })
{
	jif.limbs.forEach((limb, index) => {
		if (typeof limb.juggler != 'number') {
			if (limb.juggler !== undefined)
				warnings.push(`limb[${index}].juggler is not a number`);
			limb.juggler = index % nJugglers;
		} else if (limb.juggler < 0) {
			warnings.push(`limb[${index}].juggler needs to be positive`);
			limb.juggler = index % nJugglers;
		}

		if (typeof limb.type != 'string') {
			if (limb.type !== undefined)
				warnings.push(`limb[${index}].type is not a string`);
			limb.type = (index < nJugglers ? "right" : "left") + " hand";
		}
	});
}

function _completeJugglerDetails({ jif, warnings, nJugglers })
{
	// excel column name as default name
	const defaultName = i => {
		i++;
		let name = '';
		do {
			let mod = (i - 1) %26;
			name = String.fromCharCode(65 + mod) + name;
			i = Math.floor((i - mod)/ 26);
		} while (i);
		return name;
	};

	jif.jugglers.forEach((juggler, index) => {
		// name
		if (typeof juggler.name != 'string') {
			if (juggler.name !== undefined)
				warnings.push(`jugglers[${index}].juggler is not a string`);

			juggler.name = defaultName(index);
		}

		// position
		const circleRadius = 1.2 + nJugglers * 0.2;
		const a = Math.PI * 2 * index / nJugglers;
		const round = x => Math.round(x * 1000) / 1000;
		const defaultPosition = nJugglers == 1 ? [0, 0, 0] : [round(circleRadius * Math.cos(a)), 0, round(circleRadius * Math.sin(a))];
		let pos = juggler.position;
		if (!Array.isArray(pos)) {
			if (pos !== undefined)
				warnings.push(`jugglers[${index}].position is not an array`);
			juggler.position = defaultPosition;
		} else if (!pos.every(v => typeof v == 'number')) {
			warnings.push(`jugglers[${index}].position should contain numbers only`);
			juggler.position = defaultPosition;
		} else if (pos.length < 2) {
			juggler.position = defaultPosition;
		} else if (pos.length == 2) {
			// only two coordinates are given, take them as x/z and put them on height zero
			pos[2] = pos[1];
			pos[1] = 0;
		}

		// lookAt
		const defaultLookAt = nJugglers == 1 ? [0, 0, 1] : [0, 0, 0];
		let lookAt = juggler.lookAt;
		if (!Array.isArray(lookAt)) {
			if (lookAt !== undefined)
				warnings.push(`jugglers[${index}].lookAt is not an array`);
			juggler.lookAt = defaultLookAt;
		} else if (!lookAt.every(v => typeof v == 'number')) {
			warnings.push(`jugglers[${index}].lookAt should contain numbers only`);
			juggler.lookAt = defaultLookAt;
		} else if (lookAt.length < 2) {
			juggler.lookAt = defaultLookAt;
		} else if (lookAt.length == 2) {
			// only two coordinates are given, take them as x/z and put them on height zero
			lookAt[2] = lookAt[1];
			lookAt[1] = 0;
		}
	});
}


/**
 * A moving juggler's `path`, tidied: the keys put in time order, a key on beat 0 seeded from the juggler's
 * `position`, the end of the period checked against the start, and the whole path repeated when the repetition
 * is expanded — a path is written over one round, and an expanded JIF runs several.
 *
 * The path is left out entirely when it cannot be read, with a warning, so a still juggler animates where they
 * stand rather than nowhere.
 */
function _completeJugglerPath({ jif, warnings })
{
	const round = jif.repetition && typeof jif.repetition.period == 'number' ? jif.repetition.period : undefined;

	const point = (v) => v.length >= 3 ? [v[0], v[1], v[2]] : [v[0], 0, v[1]];
	const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

	jif.jugglers.forEach((juggler, index) => {
		const path = juggler.path;
		if (typeof path == 'undefined')
			return;

		if (typeof path != 'object' || path === null || !Array.isArray(path.keys)) {
			warnings.push(`jugglers[${index}].path is not an object with keys, removing it`);
			delete juggler.path;
			return;
		}

		const keys = [];
		path.keys.forEach((key, k) => {
			const wellFormed = typeof key == 'object' && key !== null
				&& typeof key.time == 'number' && isFinite(key.time)
				&& Array.isArray(key.position) && key.position.length >= 2
				&& key.position.every((v) => typeof v == 'number' && isFinite(v));
			if (!wellFormed) {
				warnings.push(`jugglers[${index}].path.keys[${k}] needs a time and a position, dropping it`);
				return;
			}
			const lookAt = Array.isArray(key.lookAt) && key.lookAt.length >= 2 && key.lookAt.every((v) => typeof v == 'number')
				? point(key.lookAt)
				: juggler.lookAt.slice();
			keys.push({ time: key.time, position: point(key.position), lookAt });
		});
		if (!keys.length) {
			warnings.push(`jugglers[${index}].path has no usable keys, removing it`);
			delete juggler.path;
			return;
		}
		keys.sort((a, b) => a.time - b.time);

		const period = typeof path.period == 'number' && path.period > 0 ? path.period : round;
		if (!(period > 0)) {
			warnings.push(`jugglers[${index}].path has no period and the jif no repetition, removing it`);
			delete juggler.path;
			return;
		}
		if (typeof round == 'number' && Math.abs(round / period - Math.round(round / period)) > 1e-9)
			warnings.push(`jugglers[${index}].path runs ${period} beats, which does not divide the ${round} the pattern repeats over`);

		if (keys[0].time < 0) {
			warnings.push(`jugglers[${index}].path starts at beat ${keys[0].time}, before the pattern, so it starts at 0`);
			while (keys.length && keys[0].time < 0)
				keys.shift();
			if (!keys.length) {
				warnings.push(`jugglers[${index}].path is all before the pattern, removing it`);
				delete juggler.path;
				return;
			}
		}
		if (keys[0].time > 0)
			keys.unshift({ time: 0, position: juggler.position.slice(), lookAt: juggler.lookAt.slice() });

		// The path wraps to its first key on the period's beat, so a key written there is never reached.
		while (keys.length > 1 && keys[keys.length - 1].time >= period - 1e-9) {
			const last = keys.pop();
			if (!same(last.position, keys[0].position))
				warnings.push(`jugglers[${index}].path ends at ${JSON.stringify(last.position)}, not where it starts, ${JSON.stringify(keys[0].position)}`);
		}

		juggler.path = { period, keys };
		// The juggler is where the path starts, whatever position they were given.
		juggler.position = keys[0].position.slice();
		juggler.lookAt = keys[0].lookAt.slice();
	});

	// Expanded, a path written over one round repeats with the throws.
	if (typeof round == 'number') {
		for (const juggler of jif.jugglers) {
			const path = juggler.path;
			if (!path)
				continue;
			const rounds = Math.round(round / path.period);
			if (rounds < 2 || Math.abs(rounds * path.period - round) > 1e-9)
				continue;
			const keys = [];
			for (let r = 0; r < rounds; r++)
				for (const key of path.keys)
					keys.push(Object.assign({}, key, { time: key.time + r * path.period }));
			juggler.path = { period: round, keys };
		}
	}

	if (jif.jugglers.some((juggler) => juggler.path)) {
		const extensions = Array.isArray(jif.meta.passistExtensions) ? jif.meta.passistExtensions : [];
		if (!extensions.includes('path'))
			jif.meta.passistExtensions = [...extensions, 'path'];
	}
}

function _completeRepetition({ jif, warnings })
{
	const rep = jif.repetition;

	const defaultLimbPermutation = [...Array(jif.limbs.length).keys()];
	const defaultPropPermutation = [...Array(jif.props.length).keys()];

	if (typeof rep == 'object') {
		if (rep.period) {
			if (!Array.isArray(rep.limbPermutation)) {
				if (typeof rep.limbPermutation != 'undefined')
					warnings.push("repetition.limbPermutation has unexpected type, setting to identity");
				rep.limbPermutation = defaultLimbPermutation;
			} else if (rep.limbPermutation.length != jif.limbs.length) {
				rep.limbPermutation = defaultLimbPermutation;
				warnings.push("invalid size of repetition.limbPermutation, setting to identity");
			}

			if (!Array.isArray(rep.propPermutation)) {
				if (typeof rep.propPermutation != 'undefined')
					warnings.push("repetition.propPermutation has unexpected type, setting to identity");
				rep.propPermutation = defaultPropPermutation;
			} else if (rep.propPermutation.length != jif.props.length) {
				rep.propPermutation = defaultPropPermutation;
				warnings.push("invalid size of repetition.propPermutation, setting to identity");
			}
		}
	} else if (typeof rep != 'undefined') {
		delete jif.repetition;
		warnings.push("repetition is not an object, removing repetition");
	}

}

function _completeThrowDetails({ jif, warnings })
{
	const nLimbs = jif.limbs.length;

	// ensure types and ranges of important values
	const filtered = jif.throws.filter(t =>
		typeof t == 'object'
		&& typeof t.time     == 'number'
		&& typeof t.duration == 'number'
		&& typeof t.from     == 'number'
		&& typeof t.to       == 'number'
		&& t.time     >= 0
		&& t.duration > 0
		&& t.from  >= 0
		&& t.to    >= 0
		&& t.from  < nLimbs
		&& t.to    < nLimbs
	);

	if (filtered.length < jif.throws.length) {
		warnings.push((jif.throws.length - filtered.length) + " throws non well-formed - skipped");
		jif.throws = filtered;
	}

	// sort by time (stable sort on modern browsers)
	jif.throws.sort((a, b) => a.time - b.time);


	jif.throws.forEach((t, index) => {
		if (typeof t.label != 'undefined' && typeof t.label != 'string') {
			delete t.label;
			warnings.push("throw @" + t.time + " has non-string label, deleted");
		}

		if (typeof t.prop != 'undefined' && !Number.isInteger(t.prop)) {
			delete t.prop;
			warnings.push("throw @" + t.time + " has non-integer prop, deleted");
		}
	});
}

function _ensureEnoughProps({ jif, warnings, nProps })
{
	if (jif.props.length < nProps) {
		if (jif.props.length)
			warnings.push(`not enough props specified - needing ${nProps}`);
		const missing = nProps - jif.props.length;
		for (let i = 0; i < missing; i++)
			jif.props.push({});
	}
}

function _completePropDetails({ jif, warnings, options })
{
	const propColors = [
		'#c0392b', // red
		'#0c0d5d', // blue
		'#f45d20', // orange
		'#ed4694', // pink
		'#6f5499', // violet
		'#00dc3c', // green
		'#ffd700', // yellow
		'#f2f2f2', // white
	];
	jif.props.forEach((prop, index) => {
		if (typeof prop.color != 'string') {
			if (prop.color !== undefined)
				warnings.push(`prop[${index}].color is not a string`);
			prop.color = propColors[index % propColors.length];
		}
		if (typeof prop.type != 'string') {
			if (prop.type !== undefined)
				warnings.push(`prop[${index}].type is not a string`);
			prop.type = options.propType;
		}
	});
}

/**
 * assign props to throws
 *
 * NOTE: if props are only partially assigned, they will be overwritten
 */
function _assignProps({ jif, warnings })
{
	if (jif.throws.every(t => typeof t.prop != 'undefined')) // TODO: in case of repetition: test prop relabelling as well..
		return 1 + Math.max(...jif.throws.map(t => t.prop)); // already assigned 

	let nProps = 0;

	const holding = jif.limbs.map(() => []);
	const initialProps = jif.limbs.map(() => []);

	// Props caught in one hand at one instant are re-thrown in the order a hand holds them: the prop that
	// arrived last lies on top and leaves first. Their landing times tie, so the throw times decide, and
	// the prop's own number keeps the order fixed where those tie too.
	const catches = new Heap((a, b) => a.time - b.time || b.thrown - a.thrown || a.prop - b.prop);

	let lastIteration = -1;
	let unassignedCount = 1;
	let index = 0;
	let propOrder = [];
	const period = jif.repetition && jif.repetition.period;
	const propPermutation = [];
	let permutationCount = 0;

	for (const throw_ of Jif.generateThrows(jif)) {
		if (throw_.iteration != lastIteration) {
			if (!unassignedCount && permutationCount == nProps)
				break;
			lastIteration = throw_.iteration;
			unassignedCount = 0;
		}
		while (catches.length && catches.peek().time <= throw_.time) {
			const catch_ = catches.pop();
			holding[catch_.to].push(catch_.prop);
		}
		const from = throw_.from;
		let prop;
		if (holding[from].length) {
			prop = holding[from].shift();
		} else {
			prop = nProps;
			initialProps[from].push(prop);
			nProps++;
			unassignedCount++;
		}
		catches.push({time: throw_.time + throw_.duration, thrown: throw_.time, to: throw_.to, prop});
		if (!throw_.iteration)
			jif.throws[index].prop = prop;
		if (period) {
			propOrder.push(prop);
			if (index >= jif.throws.length) {
				const fromProp = propOrder[index - jif.throws.length];
				if (typeof propPermutation[fromProp] == 'undefined') {
					propPermutation[fromProp] = prop;
					permutationCount++;
				} else {
					console.assert(propPermutation[fromProp] == prop);
				}
			}
		}
		index++;
	}

	if (period)
		jif.repetition.propPermutation = propPermutation;

	return { nProps, initialProps };
}

function _lcmArray(array) {
	function gcd(a, b) { return !b ? a : gcd(b, a % b); }
	function lcm(a, b) { return (a * b) / gcd(a, b); }
	let multiple = 1;
	array.forEach(function(n) {
		multiple = lcm(multiple, n);
	});
	return multiple;
}

function _permutationLoopLengths(permutation) {
	const visited = [];
	const result = [];
	for (let i = 0; i < permutation.length; i++) {
		if (visited[i] == 0)
			continue;

		const orbit = [];
		for (let j = i; !visited[j]; j = permutation[j]) {
			orbit.push(j);
			visited[j] = true;
		}
		if (orbit.length)
			result.push(orbit.length);
	}

	return result;
}

export default class Jif
{
	/**
	 * parse jif from string or object
	 * returns deep clone in case of object
	 */
	static parse(jif) {
		if (typeof jif == 'string')
			jif = JSON.parse(jif);
		else if (typeof jif == 'object')
			jif = JSON.parse(JSON.stringify(jif)); // deep clone
		else
			throw 'failed to parse jif, unexpected type: ' + typeof jif;

		if (Array.isArray(jif))
			throw 'failed to parse jif, should be an object, not an array';

		return jif;
	}

	/**
	 * - fills in defaults
	 * - calculates props
	 *
	 * returns:
	 *  jif:          completed jif
	 *  warnings:     array of warnings
	 *  initialProps: list of props per limb to start with
	 *
	 * throws exception in case of errors
	 *
	 */
	static complete(jif, options = {}) {
		options = Object.assign({
			propType: 'club',
			expand: false,
		}, options);

		const warnings = [];
		jif = Jif.parse(jif);

		_enforceType({ jif, warnings, key: 'meta',       type: 'object' });
		_enforceType({ jif, warnings, key: 'jugglers',   type: 'array'  });
		_enforceType({ jif, warnings, key: 'limbs',      type: 'array'  });
		_enforceType({ jif, warnings, key: 'props',      type: 'array'  });
		_enforceType({ jif, warnings, key: 'throws',     type: 'array'  });
		_enforceType({ jif, warnings, key: 'repetition', type: 'object' });

		if (typeof jif.timeStretchFactor != 'number')
			jif.timeStretchFactor = 1;

		_ensureEnoughLimbs({      jif, warnings });
		_ensureEnoughJugglers({   jif, warnings });

		const nJugglers = jif.jugglers.length;
		_completeLimbDetails({    jif, warnings, nJugglers });
		_completeJugglerDetails({ jif, warnings, nJugglers });
		_completeRepetition({     jif, warnings });
		_completeThrowDetails({   jif, warnings });

		const { nProps, initialProps } = _assignProps({ jif, warnings });
		_ensureEnoughProps({   jif, warnings, nProps });
		_completePropDetails({ jif, warnings, options });

		if (options.expand && jif.repetition) {

			// TODO: enforce repetition..

			const periodCount = _lcmArray([
				..._permutationLoopLengths(jif.repetition.limbPermutation),
				..._permutationLoopLengths(jif.repetition.propPermutation),
			]);

			var throws_ = [];
			for (const throw_ of Jif.generateThrows(jif)) {

				if (throw_.iteration >= periodCount)
					break;

				throws_.push(throw_);
			}
			jif.throws = throws_;

			jif.repetition = {
				period: jif.repetition.period * periodCount,
				limbPermutation: [...Array(jif.limbs.length).keys()],
				propPermutation: [...Array(jif.props.length).keys()],
			};
		}

		_completeJugglerPath({ jif, warnings });

		return { jif, warnings, initialProps };
	}

	static * generateThrows(jif) {
		const period = jif.repetition && jif.repetition.period;
		let limbPermutation = [...Array(jif.limbs.length).keys()];
		let propPermutation;
		if (Array.isArray(jif.props) && jif.repetition && jif.repetition.propPermutation)
			propPermutation = [...Array(jif.props.length).keys()];
		let iteration = 0;
		let baseTime = 0;
		while (true) {
			for (const throw_ of jif.throws) {
				const overwrite = {
					time: baseTime + throw_.time,
					to:   limbPermutation[throw_.to],
					from: limbPermutation[throw_.from],
					iteration,
				};
				if (propPermutation && typeof throw_.prop != 'undefined') {
					overwrite.prop = propPermutation[throw_.prop];
				}
				yield Object.assign({}, throw_, overwrite);
			}
			if (!period)
				break;
			baseTime += period;
			limbPermutation = limbPermutation.map(v => jif.repetition.limbPermutation[v]);
			if (propPermutation)
				propPermutation = propPermutation.map(v => jif.repetition.propPermutation[v]);
			iteration++;
		}
	}
}
