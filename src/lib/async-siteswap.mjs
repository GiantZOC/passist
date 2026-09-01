/**
 * Async (2-juggler passing) siteswaps.
 *
 * The synchronous siteswap in `siteswap.mjs` places throw j at beat j and tests
 * `(j + height) % period`, which does not describe a passing pattern: two jugglers throw one
 * beat apart, so the frame is twice the period and a throw fired at global beat 2j lands at
 * `(2j + height) % 2*period`. An odd height therefore lands on the other juggler's beat and is
 * a pass.
 *
 * A height of 0 is an empty hand: it throws nothing, but it still occupies its own beat, which
 * is what keeps the hands alternating across a pause.
 *
 * Landing slots are the identity of a pattern's landing group, and two patterns are compatible
 * iff their landing patterns mesh - which is a much coarser relation than "this pair can
 * actually be juggled". `isRealizable()` is the check for that, and it must run before
 * `Jif.complete()`: complete() walks the throw sequence until ball identities close, and on an
 * unrealizable pair that never happens.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The tallest throw that can be stored: 4 bits per throw, which is how the database packs a key, so
 * it is the same bound async-db.py enforces on --throws. DIGITS goes up to 35 because heights above
 * 9 are written as letters, but anything past 15 has nowhere to go.
 */
const MAX_HEIGHT = 15;

/** the limb that is due at a global beat: even beats belong to juggler 0, odd to juggler 1 */
function limbAt(beat) {
	return beat % 2 === 0 ? (beat / 2) % 2 : 2 + ((beat - 1) / 2) % 2;
}

export default class AsyncSiteswap {

	/**
	 * @param siteswap a pattern such as "30", "441" or "B4" - 10 and above written as letters
	 */
	constructor(siteswap) {
		this.siteswap = ('' + siteswap).trim().toUpperCase();
		this.heights = Array.from(this.siteswap, c => DIGITS.indexOf(c));
	}

	get period() {
		return this.heights.length;
	}

	/** the frame both jugglers share: twice the period, because they are one beat apart */
	get frame() {
		return this.heights.length * 2;
	}

	/**
	 * The shortest span after which the pair resumes on the hands it started on. An odd period does
	 * not close in `frame` beats: by then every hand has thrown one extra time, so the pattern
	 * comes back one throw out of phase and needs two turns of the frame.
	 */
	get cycleFrame() {
		return this.frame * (this.heights.length % 2 ? 2 : 1);
	}

	heightsToString() {
		return this.heights.map(h => DIGITS[h]).join('');
	}

	/**
	 * A pattern is valid when it is writable, at least period 2, names no height that is not a throw
	 * here, and its throws fill `period` distinct landing slots. Filling distinct slots is the async
	 * equivalent of the synchronous "one catch per beat" rule: two throws landing on one slot is a
	 * squeeze nobody can catch, and a slot left empty means the pattern does not cover its own frame.
	 *
	 * The throw set is 0 and 2 up to the packing limit - 1 is not a height in this dataset, so a
	 * pattern naming one is not a pattern, even though a 1 would pack.
	 */
	isValid() {
		if (this.heights.some(h => h < 0 || h > MAX_HEIGHT) || this.period < 2)
			return false;
		if (this.heights.some(h => h === 1))
			return false;
		return this.landingSlots().size === this.period;
	}

	/** the global beats this pattern's throws land on */
	landingSlots() {
		const slots = new Set();
		const frame = this.frame;
		this.heights.forEach((h, j) => slots.add((2 * j + h) % frame));
		return slots;
	}

	get throwSum() {
		return this.heights.reduce((a, b) => a + b, 0);
	}

	get maxThrow() {
		return Math.max(...this.heights);
	}

	/** the smallest actual throw: an empty hand is not a short one */
	get minThrow() {
		const thrown = this.heights.filter(h => h);
		return thrown.length ? Math.min(...thrown) : 0;
	}

	get hasZero() {
		return this.heights.some(h => h === 0);
	}

	/** odd throws land on the partner's beat, so they are passes */
	get nPasses() {
		return this.heights.filter(h => h % 2).length;
	}

	/**
	 * A rotation class is named after its smallest rotation, which is what a database keyed by
	 * pattern stores. Looking a pattern up therefore means canonicalising the string first:
	 * "306", "063" and "630" are one pattern, and "063" is the row that exists.
	 */
	canonic() {
		const s = this.siteswap;
		let min = s;
		for (let i = 1; i < s.length; i++) {
			const rotated = s.slice(i) + s.slice(0, i);
			if (rotated < min)
				min = rotated;
		}
		return new AsyncSiteswap(min);
	}

	canonicString() {
		return this.canonic().siteswap;
	}

	/**
	 * Every throw of the pair as {time, duration, from, to}, across the whole cycle. `this` throws on
	 * the even beats, the partner on the odd - the phase offset is exactly one beat.
	 *
	 * Odd periods are written out over both of their 2p turns rather than compressed into one with a
	 * residual limb permutation, because JIF applies that permutation to a throw as a whole: a throw
	 * whose catch falls in the next turn would be handed to whichever limb the permutation picks for
	 * the thrower, which is not the limb that is actually standing there. Writing the cycle out keeps
	 * every limb an absolute hand, at the cost of twice as many throws on odd periods.
	 */
	pairThrows(partner) {
		partner = AsyncSiteswap.from(partner);
		const frame = this.frame;
		const cycle = this.cycleFrame;
		const throws = [];
		for (let turn = 0; turn < cycle / frame; turn++) {
			[[this, 0], [partner, 1]].forEach(([juggler, offset]) => {
				juggler.heights.forEach((h, j) => {
					if (!h) return;                   // an empty hand throws nothing
					const time = 2 * j + offset + turn * frame;
					throws.push({ time, duration: h, from: limbAt(time), to: limbAt((time + h) % cycle) });
				});
			});
		}
		return throws.sort((a, b) => a.time - b.time);
	}

	/**
	 * Can this pair be juggled? Four things have to hold, and the fourth is the one that is easy
	 * to miss: no two throws may aim at the same catch, which is a squeeze even when every throw
	 * individually lands on a beat where that hand is free.
	 */
	isRealizable(partner) {
		const throws = this.pairThrows(partner);
		if (!throws.length)
			return false;                             // nothing is ever thrown, so it is not a pattern

		const due = new Set();
		for (const t of throws) {
			const k = t.time + ',' + t.from;
			if (due.has(k))
				return false;                         // two throws leave the same hand at the same beat
			due.add(k);
		}

		const aimed = new Map();
		for (const t of throws) {
			const k = (t.time + t.duration) % this.cycleFrame + ',' + t.to;
			if (!due.has(k))
				return false;                         // a catch with no throw due at it
			aimed.set(k, (aimed.get(k) || 0) + 1);
		}
		for (const n of aimed.values())
			if (n > 1)
				return false;                         // two throws aimed at one catch

		return true;
	}

	/** balls in the pair: over the shared 2p frame every ball is thrown once per throw-sum */
	props(partner) {
		return (this.throwSum + AsyncSiteswap.from(partner).throwSum) / this.frame;
	}

	/**
	 * The pair as JIF, ready for `Jif.complete()`.
	 *
	 * `limbs[].juggler` is stated explicitly because jif.mjs defaults it to `index % nJugglers`,
	 * which interleaves the two jugglers' hands rather than pairing them. `props` is left empty so
	 * that complete() assigns ball identities and reports how many there are. The repetition carries
	 * no limb permutation: pairThrows() already wrote out the whole cycle, so the pattern resumes on
	 * the same limbs and there is nothing left to permute.
	 */
	toPairJif(partner) {
		return {
			meta: { pattern: this.siteswap + ' ' + AsyncSiteswap.from(partner).siteswap },
			jugglers: [{ name: 'A' }, { name: 'B' }],
			limbs: [
				{ juggler: 0, type: 'right hand' },
				{ juggler: 0, type: 'left hand' },
				{ juggler: 1, type: 'right hand' },
				{ juggler: 1, type: 'left hand' },
			],
			props: [],
			throws: this.pairThrows(partner),
			repetition: {
				period: this.cycleFrame,
				limbPermutation: [0, 1, 2, 3],
			},
		};
	}

	/**
	 * The first pattern in `pool` this one can be juggled with. Compatibility between landing
	 * groups narrows the pool a lot but does not guarantee any member of it works, so this scans.
	 */
	findPartner(pool) {
		for (const candidate of pool)
			if (this.isRealizable(candidate))
				return AsyncSiteswap.from(candidate).siteswap;
		return null;
	}

	/**
	 * Ground state is deliberately not computed here: it is `jif.repetition.propPermutation` being
	 * the identity, which `Jif.complete()` already works out from the ball identities it assigns.
	 * Deriving it a second time here means two implementations of ball identity that can disagree -
	 * and measured over 257 compatible pairs, they did.
	 */

	static from(value) {
		return value instanceof AsyncSiteswap ? value : new AsyncSiteswap(value);
	}
}
