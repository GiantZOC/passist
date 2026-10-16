import { defaults, baseUrl } from './passist.mjs';

import * as THREE from 'three';
// import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js"; # this does not work (2021-05) as vite treats it as commonjs
import { OrbitControls } from "./OrbitControls.mjs"; // <-- symlink hack to treat it like the module it actually is
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const hu = 0.21;
const jugglerHeight  = 8    * hu;
const shoudlerWidth  = 2    * hu;
const shoulderHeight = 6.67 * hu;
const crotchHeight   = 4    * hu;
const upperArmLength = 1.7  * hu;
const lowerArmLength = 1    * hu;
const handLength     = 0.8  * hu;
const footLength     = 1.5  * hu; // original: 1.14
const footWidth      = 0.8  * hu; // original: 0.46
const gravity = -9.8;

const colors = {
	sky: '#24b59f',
	horizon: '#eff9b7',
	fog: '#ffffee',
	ground1: '#937a24',
	ground2: '#987d2e',
	meeseeks: '#5fcaf6',
};

// The surroundings: Passist's own grass and teal sky, or `clean`, a plain floor under a pale sky for a
// page where the pattern is the point. The clean floor is light and neutral with a faint metre grid,
// kept for depth, and neither it nor the sky is so near white that a club's white handle is lost on it.
// Its light is white rather than the sky's teal over the grass's yellow, which tints every colour.
const sceneries = {
	passist: {
		sky: colors.sky, fog: colors.fog, lightSky: colors.sky, lightGround: colors.horizon,
		ground: { kind: 'checks', colors: [colors.ground1, colors.ground2] },
	},
	clean: {
		sky: '#9fc0de', fog: '#e9eef2', lightSky: '#ffffff', lightGround: '#cfcac0',
		ground: { kind: 'grid', base: '#d9d5cc', line: '#cbc6bb' },
	},
};

function propColor(prop, jif)
{
	return prop.color || (jif.defaults && jif.defaults.prop && jif.defaults.prop.color) || "white";
}

function sideFactor(side)
{
	// 0: right/positive, 1: left/negative
	return side ? 1 : -1;
}

function v3(x, y, z)
{
	return new THREE.Vector3(x, y, z);
}

function pirouetteGeometry()
{
	const c = [
		-0.50625,-0.39822,-0.74566,-0.8929,-0.87587,-1.8098,
		-0.0986,-0.69398,-0.73198,-3.46444,-1.4076,-6.15658,
		-1.16772,-4.65299,-1.22766,-5.07124,-1.21338,-8.46666,
		0.0135,-3.221474,0.18572,-4.506304,1.75504,-13.096884,
		1.92503,-10.53774,1.87475,-9.93831,2.57469,-30.69166,
		0.38738,-11.48576,0.35211,-14.93884,-0.15836,-15.50291,
		-0.69207,-0.76472,-0.77874,-2.3899,-0.16771,-3.1445,
		0.44666,-0.55159,0.75445,-0.64878,2.07704,-0.65584,
		1.99561,-0.0106,2.91938,0.25496,3.28905,0.94569,
		0.3975,0.74274,0.10051,2.16618,-0.64055,3.07008,
		-0.59264,0.72286,-0.59962,0.80978,-0.40963,5.10102,
		0.1063,2.40109,0.26813,9.18765,0.35962,15.08125,
		0.0915,5.89359,0.28645,12.14437,0.43324,13.89062,
		0.15121,1.79881,1.02204,6.95952,2.00909,11.90625,
		2.48978,12.47795,2.50286,14.030914,0.19489,23.133044,
		-0.64322,2.53671,-1.16949,4.80791,-1.16949,5.04711,
		0,0.23919,-0.30709,0.72355,-0.68243,1.07634,
		-0.59338,0.55773,-0.98179,0.65317,-2.97669,0.73143,
		//-2.00164,0.0785,-2.38313,0.0201,-2.99095,-0.458
	];

	const path = new THREE.Path();
	for (let i = 0; i < c.length / 6; i++) {
		const a = path.currentPoint;
		path.bezierCurveTo(
			a.x + c[i*6 + 0] - 0.2, a.y + c[i*6 + 1],
			a.x + c[i*6 + 2] - 0.2, a.y + c[i*6 + 3],
			a.x + c[i*6 + 4] - 0.2, a.y + c[i*6 + 5]
		);
	}

	const samples = 100;
	let points = [];
	for (let i = 0; i < samples; i++)
		points.push(path.getPoint(i / (samples - 1)));

	const factor = 0.52 / 79.97; // 79.97 units, 0.52m irl
	return new THREE.LatheGeometry(points)
		.scale(factor, factor, factor)
		.center();
}

function resourceUrl(url)
{
	return baseUrl + url;
}

class Juggler extends THREE.Group
{

constructor(faceTexture)
{
	super();
	const pirouette = pirouetteGeometry();

	const bodyMaterial = new THREE.MeshToonMaterial({
		color: new THREE.Color(colors.meeseeks),
	});
	const headMaterial = bodyMaterial.clone();
	this.headMaterial = headMaterial;
	(new THREE.TextureLoader()).load(
		faceTexture,
		function( texture ) {
			texture.anisotropy = 8;
			texture.encoding = THREE.sRGBEncoding;
			headMaterial.map = texture;
			headMaterial.color = undefined;
			headMaterial.needsUpdate = true;
		}
	);
	(new THREE.TextureLoader()).load(
		resourceUrl('/images/meeseeks_blue.png'),
		function( texture ) {
			texture.encoding = THREE.sRGBEncoding;
			bodyMaterial.map = texture;
			bodyMaterial.color = undefined;
			bodyMaterial.needsUpdate = true;
		}
	);

	const pirouetteSize = new THREE.Vector3();
	pirouette.computeBoundingBox();
	pirouette.boundingBox.getSize(pirouetteSize);

	const head = new THREE.Mesh(
		pirouette
			.clone()
			.scale(
				1 * hu / pirouetteSize.x,
				3 * hu / pirouetteSize.y,
				1 * hu / pirouetteSize.z)
			.rotateY(Math.PI)
			.center()
			.translate(0, shoulderHeight + 0.5 * hu, 0),
		headMaterial
	);
	this.add(head);

	const torso = new THREE.Mesh(
		new THREE.TubeGeometry(
			new THREE.LineCurve3(
				v3(0, shoulderHeight, 0),
				v3(0, crotchHeight, 0)
			), 2, hu, 16, false
		),
		bodyMaterial
	);
	torso.scale.z = 0.6;
	this.add(torso);

	const sphere = new THREE.SphereGeometry(0.5, 16, 10);

	const upperArmGeometry = new THREE.TubeGeometry(
		new THREE.LineCurve3(
			v3(0, 0, 0),
			v3(0, 0, upperArmLength)
		), 2, 0.3 * hu, 16, false
	);
	const lowerArmGeometry = new THREE.TubeGeometry(
		new THREE.LineCurve3(
			v3(0, 0, 0),
			v3(0, 0, lowerArmLength)
		), 2, 0.3 * hu, 16, false
	);
	this.shoulders = [];
	this.upperArms = [];
	this.lowerArms = [];
	for (let side = 0; side < 2; side++) {
		const shoulder = new THREE.Object3D().rotateX(Math.PI / 2).rotateY(sideFactor(side) * Math.PI / 20);
		shoulder.position.set(sideFactor(side) * hu, shoulderHeight, 0);
		this.shoulders.push(shoulder);
		this.add(shoulder);
		const upperArm = new THREE.Mesh(upperArmGeometry, bodyMaterial);
		this.upperArms.push(upperArm);
		shoulder.add(upperArm);

		const elbow = new THREE.Object3D();
		elbow.position.z = upperArmLength;
		upperArm.add(elbow);

		elbow.add(new THREE.Mesh(
			sphere.clone().scale(0.6 * hu, 0.6 * hu, 0.6 * hu),
			bodyMaterial
		));

		const lowerArm = new THREE.Mesh(lowerArmGeometry, bodyMaterial);
		this.lowerArms.push(lowerArm);
		elbow.add(lowerArm);

		lowerArm.add(new THREE.Mesh(
			sphere.clone().scale(0.6 * hu, 0.6 * hu, 0.6 * hu).translate(0, 0, lowerArmLength),
			bodyMaterial
		));

		// hand
		lowerArm.add(new THREE.Mesh(
			sphere.clone().scale(0.4 * hu, 0.5 * hu, handLength).rotateZ(-sideFactor(side) * Math.PI / 4).translate(0, 0, lowerArmLength + handLength / 2),
			bodyMaterial
		));
	}

	const rightLeg = new THREE.Mesh(
		new THREE.TubeGeometry(
			new THREE.LineCurve3(
				v3(- hu / 2, crotchHeight, 0),
				v3(- hu, 0, 0)
			), 2, 0.4 * hu, 16, false),
		bodyMaterial
	);
	const leftLeg = rightLeg.clone();
	leftLeg.scale.x *= -1;
	this.add(rightLeg);
	this.add(leftLeg);

	let shoulder = new THREE.Mesh(
		sphere.clone().scale(1.4 * shoudlerWidth, 0.4 * shoudlerWidth, 0.6 * shoudlerWidth).translate(0, shoulderHeight, 0),
		bodyMaterial
	);
	this.add(shoulder);
	let crotch = new THREE.Mesh(
		sphere.clone().scale(shoudlerWidth, 0.2 * shoudlerWidth, 0.5 * shoudlerWidth).translate(0, crotchHeight, 0),
		bodyMaterial
	);
	this.add(crotch);

	let rightFoot = new THREE.Mesh(
		sphere.clone().scale(footWidth, footWidth / 2, footLength).translate(- hu, 0, 0.2 * footLength),
		bodyMaterial
	);
	let leftFoot = rightFoot.clone();
	leftFoot.scale.x *= -1;
	this.add(rightFoot);
	this.add(leftFoot);
}

get facing()
{
	return v3(0, 0, 1).applyQuaternion(this.quaternion);
}

throwCatchBasePosition(side)
{
	const forwardDistance = lowerArmLength + handLength;
	const sideDistance = shoudlerWidth / 2;

	return this.position.clone().add(
		this.facing.clone()
		.multiplyScalar(forwardDistance)
	).add(
		this.facing.clone()
		.cross(v3(0, -sideFactor(side), 0))
		.multiplyScalar(sideDistance)
	);
}

throwPosition(side)
{
	return this.throwCatchBasePosition(side)
		.add(
			v3(0, shoulderHeight - 2 * hu, 0)
		).add(
			this.facing.clone()
			.cross(v3(0, sideFactor(side), 0))
			.multiplyScalar(0.1)
		);
}

catchPosition(side)
{
	return this.throwCatchBasePosition(side)
		.add(
			v3(0, shoulderHeight, 0)
		).add(
			this.facing.clone()
			.cross(v3(0, -sideFactor(side), 0))
			.multiplyScalar(0.1)
		);
}

zipCatchPosition(side)
{
	return this.throwCatchBasePosition(side)
		.add(
			v3(0, shoulderHeight - 2 * hu, 0)
		).add(
			this.facing.clone()
			.cross(v3(0, sideFactor(side), 0))
			.multiplyScalar(0.2)
		);
}

setHandPosition(side, handPos)
{
	// calculate elbow
	// s: shoulder
	// e: ellbow
	// h: hand
	// b: base point
	//
	// s--b--h
	//  \ | /
	//   \|/
	//    e

	const shoulder = this.shoulders[side];
	const shoulderPos = new THREE.Vector3();
	shoulder.getWorldPosition(shoulderPos);

	const sh = handPos.distanceTo(shoulderPos);
	const se = upperArmLength;
	const eh = lowerArmLength + handLength;
	const obtuseAtS = Math.pow(eh, 2) > Math.pow(sh, 2) + Math.pow(se, 2);

	if (sh <= se + eh) {
		// calculate radius (height of triangle)
		// area = 1/2 * sh * be   (area formula)
		// area = sqrt(s * (s - sh) * (s - se) * (s - eh)) (herons formula)
		const s = (sh + se + eh) / 2;
		const be = 2 * Math.sqrt(s * (s - sh) * (s - se) * (s - eh)) / sh; // TODO: handle case sh == 0
		const sb = Math.sqrt(Math.pow(se, 2) - Math.pow(be, 2));

		const sToh = handPos.clone().sub(shoulderPos).normalize();
		const basePosRel = sToh.clone().multiplyScalar((obtuseAtS ? -1 : 1) * sb);
		const basePosWorld = shoulderPos.clone().add(basePosRel);

		const jugglerQuaternion = this.quaternion; // already in reference to world
		const elbowPos = basePosWorld.clone().add(
			sToh.clone()
			.cross(
				v3(-1, 0.3 * -sideFactor(side), 0).normalize()
				.applyQuaternion(jugglerQuaternion)
			).multiplyScalar(be)
		);
		this.upperArms[side].lookAt(elbowPos);
		this.lowerArms[side].lookAt(handPos);
	} else {
		// prop not reachable, reach as far as we can
		this.upperArms[side].lookAt(handPos);
		this.lowerArms[side].lookAt(handPos);
	}
}

panic()
{
	for (let side = 0; side < 2; side++) {
		this.upperArms[side].lookAt(
			this.position.clone().add(
				this.facing.clone()
				.cross(v3(0, -sideFactor(side), 0))
				.multiplyScalar(2 * hu)
			).add(v3(0, jugglerHeight, 0))
		);
		this.lowerArms[side].lookAt(
			this.position.clone().add(
				v3(0, jugglerHeight + 0.5 * hu, 0)
			)
		);
	}
}


} // end Juggler


/**
 * Models for ModelJuggler, by url: the loads, and the scenes that have arrived. A failed load resolves
 * to null, and that juggler is drawn as a Juggler instead.
 */
const loadedModels = {};
const readyModels = {};

function loadModel(url)
{
	loadedModels[url] ??= new GLTFLoader().loadAsync(url).then(
		gltf => readyModels[url] = gltf.scene,
		error => {
			console.warn('juggler model ' + url + ' did not load, drawing the default juggler', error);
			return null;
		}
	);
	return loadedModels[url];
}

// Where a club is held: this far down its axis from its middle, on the handle (the knob is at -0.26).
const clubGrip = 0.16;
// How long the fingers take to close round a club caught, and to open after one is thrown, seconds.
const gripCloseSeconds = 0.08;
const gripOpenSeconds = 0.1;
// How long an empty hand takes to relax after a throw, and to turn to the next club before a catch.
const gripReadySeconds = 0.12;
// The angle a gripping juggler lets go of a club at, about the throw's spin axis: Passist's 1.5 pi
// is level and pointing where it goes, 2 pi upright; this is half way.
const gripReleaseAngle = 1.75 * Math.PI;
// A handle's centre, out from the palm, metres: its radius and the palm's own flesh.
const gripDepth = 0.03;
// How far each finger joint turns to close round a handle, knuckle first, and the thumb's two, radians.
const fingerCurl = [1.05, 1.3, 0.8];
const thumbCurl = [0.5, 0.6];
// The furthest a wrist bends from straight, radians.
const maxWristBend = 1.2;

// A ModelJuggler is scaled to stand this tall, whatever the model's own size: two models side by side
// are the same height.
const modelHeight = 1.75;

/**
 * The juggler as a rigged glTF model instead of Juggler's tubes and spheres.
 *
 * spec: { url, colors: { <material name>: <css color> }, label, labelColor }
 *
 * The model must be a skinned human facing +z with its feet at y = 0 and bones named
 * UpperArm.{L,R}, LowerArm.{L,R}, Wrist.{L,R} and Middle2.{L,R} (the knuckle), stood in its rest pose
 * with the arms hanging. Quaternius' characters are; see web/scripts/build-models.mjs.
 *
 * Juggler's hands are where its long tube arms reach, a shoulder's height up. A real arm is half as
 * long again shorter, and could not get there, so a ModelJuggler throws and catches where its own arms
 * hold a ball: forearms out in front, the elbows at the sides. The layout around that is Juggler's —
 * catch on the outside, throw on the inside, a zip crossing to the middle — and setHandPosition bends
 * the model's own bones to reach it.
 */
class ModelJuggler extends THREE.Group
{

/** A ModelJuggler grips what it holds; Animation works out where (holdAt) only for a juggler that does. */
get grips()
{
	return true;
}

constructor(source, spec)
{
	super();
	const model = cloneSkinned(source);
	source.updateMatrixWorld(true);
	const box = new THREE.Box3().setFromObject(source);
	model.scale.multiplyScalar(modelHeight / box.max.y);
	this.add(model);

	const colors = spec.colors || {};
	const materials = {};
	model.traverse(o => {
		if (!o.isMesh)
			return;
		const name = o.material.name;
		// Toon, like the props and the ground. With ColorManagement off (see Animation) a css colour is
		// taken as linear and comes out lighter than it was picked, so it is converted here; the file's
		// own colours are linear already.
		materials[name] ??= new THREE.MeshToonMaterial({
			color: colors[name] ? new THREE.Color(colors[name]).convertSRGBToLinear() : o.material.color.clone(),
		});
		o.material = materials[name];
		// The bounds are the rest pose's, and an arm raised out of them would be culled with it.
		o.frustumCulled = false;
	});

	this.updateMatrixWorld(true);
	const at = object => object.getWorldPosition(new THREE.Vector3());

	this.arms = [];
	for (let side = 0; side < 2; side++) {
		const suffix = side ? 'L' : 'R'; // three drops the '.' from a node name
		const bone = name => {
			const found = model.getObjectByName(name + suffix);
			if (!found)
				throw new Error('juggler model has no bone ' + name + suffix);
			return found;
		};
		const upper = bone('UpperArm');
		const lower = bone('LowerArm');
		const wrist = bone('Wrist');
		const fingers = ['Index', 'Middle', 'Ring', 'Pinky'].flatMap(name => [2, 3, 4].map(k => bone(name + k)));
		const thumb = [2, 3].map(k => bone('Thumb' + k));

		// A ball sits in the palm, part way from the wrist to the knuckle, and that is what the arm reaches with
		// when there is nothing to grip.
		const palm = new THREE.Object3D();
		wrist.add(palm);
		palm.position.copy(wrist.worldToLocal(at(wrist).lerp(at(bone('Middle2')), 0.6)));
		this.updateMatrixWorld(true);

		// The hand's own frame, as directions in the wrist's: along the fingers, across the knuckles from the
		// little finger to the index, and out of the palm. Hanging at the side, the palm faces the thigh.
		const fromWorld = wrist.getWorldQuaternion(new THREE.Quaternion()).invert();
		const along = at(bone('Middle2')).sub(at(wrist)).normalize();
		const across = at(bone('Index2')).sub(at(bone('Pinky2'))).projectOnPlane(along).normalize();
		const normal = along.clone().cross(across);
		if (normal.x * sideFactor(side) > 0) // pointing out, away from the thigh
			normal.negate();

		// A handle lies across the palm inside the closed fingers.
		const gripCentre = at(palm).addScaledVector(normal, gripDepth);

		const rest = [upper, lower, wrist, ...fingers, ...thumb].map(one => one.quaternion.clone());
		this.arms.push({
			upper, lower, wrist, palm, fingers, thumb, rest,
			frame: [along, across, normal].map(one => one.clone().applyQuaternion(fromWorld)),
			handedness: Math.sign(along.clone().cross(across).dot(normal)),
			gripOffset: gripCentre.clone().sub(at(wrist)).applyQuaternion(fromWorld),
			fingerAxis: ModelJuggler.curlAxis(this, fingers.slice(3, 6), bone('Middle4'), gripCentre),
			thumbAxis: ModelJuggler.curlAxis(this, thumb, bone('Thumb3'), gripCentre),
			upperLength: at(upper).distanceTo(at(lower)),
			lowerLength: at(lower).distanceTo(at(palm)),
			wristLength: at(lower).distanceTo(at(wrist)),
			shoulder: at(upper),
		});
	}

	// Where the hands work, in the juggler's own frame (x to its left, z forward), from the right arm.
	const arm = this.arms[0];
	const reach = arm.upperLength + arm.lowerLength;
	this.layout = {
		width:   Math.abs(arm.shoulder.x),
		forward: arm.shoulder.z + 0.65 * reach,
		throwY:  arm.shoulder.y - arm.upperLength - 0.06,
		catchY:  arm.shoulder.y - arm.upperLength + 0.14,
		offset:  0.08,
		top:     arm.shoulder.y,
		bottom:  0.45 * arm.shoulder.y, // the hips' height, roughly: below it the legs are narrower
	};

	if (spec.label)
		this.add(ModelJuggler.labelSprite(spec.label, spec.labelColor || colors[Object.keys(colors)[0]] || '#333'));
}

static labelSprite(text, color)
{
	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(size / 2, size / 2, size / 2 - 6, 0, 2 * Math.PI);
	ctx.fill();
	ctx.lineWidth = 8;
	ctx.strokeStyle = 'white';
	ctx.stroke();
	ctx.fillStyle = 'white';
	ctx.font = `bold ${size * 0.55}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, size / 2, size / 2 + size * 0.04);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
	sprite.scale.set(0.3, 0.3, 1);
	sprite.position.set(0, modelHeight + 0.25, 0);
	return sprite;
}

get facing()
{
	return v3(0, 0, 1).applyQuaternion(this.quaternion);
}

/**
 * A hand position moved, if it has to be, out of the body: the torso and hips as an upright elliptic
 * cylinder, from the hips' height to the shoulders', and a point inside it pushed straight out sideways
 * and back to its edge, the way an arm swings past a hip rather than through it.
 */
clearOfBody(position)
{
	const { width, top, bottom } = this.layout;
	this.updateMatrixWorld();
	const local = this.worldToLocal(position.clone());
	if (local.y > top || local.y < bottom)
		return position;
	const rx = width + 0.07;
	const rz = 0.16;
	const inside = Math.hypot(local.x / rx, local.z / rz);
	if (inside >= 1)
		return position;
	if (inside < 1e-6)
		local.z = rz;
	else
		local.multiply(v3(1 / inside, 1, 1 / inside));
	return this.localToWorld(local);
}

/** A point given in the juggler's own frame, for `side`'s hand: x is towards the body's middle. */
handPoint(side, inward, y)
{
	const { width, forward } = this.layout;
	this.updateMatrixWorld();
	return this.localToWorld(v3(sideFactor(side) * (width - inward), y, forward));
}

throwPosition(side)
{
	return this.handPoint(side, this.layout.offset, this.layout.throwY);
}

catchPosition(side)
{
	return this.handPoint(side, -this.layout.offset, this.layout.catchY);
}

zipCatchPosition(side)
{
	return this.handPoint(side, 2 * this.layout.offset, this.layout.throwY);
}

/**
 * Which way, about one of its own axes, a finger's joints turn to close the hand: the one that brings
 * its tip nearest the handle. A rig's bone axes are its own, and mirrored between the hands.
 */
static curlAxis(juggler, bones, tip, goal)
{
	const rest = bones.map(one => one.quaternion.clone());
	let best, nearest = Infinity;
	for (const axis of [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)]) {
		const turn = new THREE.Quaternion().setFromAxisAngle(axis, 0.9);
		bones.forEach((one, i) => one.quaternion.copy(rest[i]).multiply(turn));
		juggler.updateMatrixWorld(true);
		const distance = tip.getWorldPosition(new THREE.Vector3()).distanceTo(goal);
		if (distance < nearest) {
			nearest = distance;
			best = axis;
		}
	}
	bones.forEach((one, i) => one.quaternion.copy(rest[i]));
	juggler.updateMatrixWorld(true);
	return best;
}

/**
 * Put `side`'s hand at handPos. Given `hold` — what Animation.holdAt says the hand has — the hand takes
 * the club by its handle: turned so the handle lies across the palm with the club's head out past the
 * index finger, the wrist placed so the handle sits inside the fingers, and the fingers closed round
 * it as far as `hold.closure` says. Without one (the start, and panic) the palm is put there, facing up.
 */
setHandPosition(side, handPos, hold)
{
	const arm = this.arms[side];
	const bones = [arm.upper, arm.lower, arm.wrist, ...arm.fingers, ...arm.thumb];
	bones.forEach((one, i) => one.quaternion.copy(arm.rest[i]));
	this.updateMatrixWorld(true);
	this.reach(arm, side, handPos, arm.palm, arm.lowerLength);

	if (!hold) {
		const elbow = arm.lower.getWorldPosition(new THREE.Vector3());
		this.twist(arm, handPos.clone().sub(elbow).normalize(), v3(0, 1, 0));
		return;
	}

	// The hand turned to what it holds, from where the forearm points when the palm reaches for it.
	const elbow = arm.lower.getWorldPosition(new THREE.Vector3());
	const forearmDir = arm.palm.getWorldPosition(new THREE.Vector3()).sub(elbow).normalize();
	const hand = this.handRotation(arm, side, forearmDir, hold);
	if (hold.ready > 0)
		hand.slerp(this.handRotation(arm, side, forearmDir, {}), hold.ready);

	// Again, now reaching with the wrist for where it must be to put the handle in that hand.
	arm.upper.quaternion.copy(arm.rest[0]);
	arm.lower.quaternion.copy(arm.rest[1]);
	this.updateMatrixWorld(true);
	const wristTarget = handPos.clone().sub(arm.gripOffset.clone().applyQuaternion(hand));
	this.reach(arm, side, wristTarget, arm.wrist, arm.wristLength);

	// The forearm takes the turn about its own length, so the wrist only has to bend.
	const forearm = arm.wrist.getWorldPosition(new THREE.Vector3()).sub(arm.lower.getWorldPosition(new THREE.Vector3())).normalize();
	this.twist(arm, forearm, arm.frame[2].clone().applyQuaternion(hand));

	// The wrist turned the rest of the way, but no further than a wrist bends.
	const parent = arm.wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
	const local = parent.multiply(hand);
	const bend = 2 * Math.acos(Math.min(1, Math.abs(arm.rest[2].dot(local))));
	arm.wrist.quaternion.copy(arm.rest[2]).slerp(local, bend > maxWristBend ? maxWristBend / bend : 1);

	// The fingers round the handle; round a ball, only cupped.
	const closure = hold.closure * (hold.ball ? 0.4 : 1);
	arm.fingers.forEach((one, i) => one.quaternion.copy(arm.rest[3 + i])
		.multiply(new THREE.Quaternion().setFromAxisAngle(arm.fingerAxis, closure * fingerCurl[i % 3])));
	arm.thumb.forEach((one, i) => one.quaternion.copy(arm.rest[3 + arm.fingers.length + i])
		.multiply(new THREE.Quaternion().setFromAxisAngle(arm.thumbAxis, closure * thumbCurl[i])));
}

/**
 * The wrist's world rotation that turns the hand's frame to what it holds: a club across the palm with
 * its head out past the index finger, and the fingers carrying on from the forearm as nearly as that
 * allows. Holding nothing, or a ball, the palm is open and up, turned a little in.
 */
handRotation(arm, side, forearm, hold)
{
	const [alongRest, acrossRest, normalRest] = arm.frame;
	const h = arm.handedness;
	const down = v3(0, -1, 0);
	let along, across, normal;
	if (hold.rotation && !hold.ball) {
		across = v3(0, 1, 0).applyQuaternion(hold.rotation);
		// The forearm's own direction across the club, leaning on straight down as the two come into line,
		// where the forearm alone says nothing and the hand would flip.
		const fromForearm = forearm.clone().projectOnPlane(across);
		const sure = Math.min(1, fromForearm.length() / 0.5);
		along = fromForearm.normalize().multiplyScalar(sure)
			.add(down.clone().projectOnPlane(across).normalize().multiplyScalar(1 - sure));
		if (along.lengthSq() < 1e-6)
			along = this.facing.projectOnPlane(across);
		along.normalize();
		normal = along.clone().cross(across).multiplyScalar(h);
	} else {
		const inward = v3(-sideFactor(side), 0, 0).applyQuaternion(this.quaternion);
		normal = v3(0, 1, 0).addScaledVector(inward, 0.5).normalize();
		along = forearm.clone().projectOnPlane(normal);
		if (along.lengthSq() < 1e-4)
			along = this.facing.projectOnPlane(normal);
		along.normalize();
		across = normal.clone().cross(along).multiplyScalar(h);
	}
	const target = new THREE.Matrix4().makeBasis(along, across, normal);
	const rest = new THREE.Matrix4().makeBasis(alongRest, acrossRest, normalRest).transpose();
	return new THREE.Quaternion().setFromRotationMatrix(target.multiply(rest));
}

/**
 * Bend the arm so that `effector`, carried by the forearm `lowerLength` from the elbow, reaches target:
 * the elbow by the law of cosines, bent down and a little out the way Juggler bends its own. A target
 * out of reach is pointed at straight, as Juggler's are.
 */
reach(arm, side, target, effector, lowerLength)
{
	const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
	const a = arm.upperLength;
	const b = lowerLength;
	const toHand = target.clone().sub(shoulder);
	const d = THREE.MathUtils.clamp(toHand.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
	const dir = toHand.normalize();
	const reached = shoulder.clone().addScaledVector(dir, d);

	const along = (a * a - b * b + d * d) / (2 * d);
	const out = Math.sqrt(Math.max(0, a * a - along * along));
	const pole = dir.clone().cross(
		v3(-1, 0.3 * -sideFactor(side), 0).normalize().applyQuaternion(this.quaternion)
	).normalize();
	const elbow = shoulder.clone().addScaledVector(dir, along).addScaledVector(pole, out);

	ModelJuggler.aim(arm.upper, arm.lower.getWorldPosition(new THREE.Vector3()).sub(shoulder), elbow.clone().sub(shoulder));
	arm.upper.updateMatrixWorld(true);
	const elbowNow = arm.lower.getWorldPosition(new THREE.Vector3());
	ModelJuggler.aim(arm.lower, effector.getWorldPosition(new THREE.Vector3()).sub(elbowNow), reached.sub(elbowNow));
	arm.lower.updateMatrixWorld(true);
}

/** Turn the forearm about `axis`, its own length, until the palm faces as near `toward` as it can. */
twist(arm, axis, toward)
{
	const normal = arm.frame[2].clone()
		.applyQuaternion(arm.wrist.getWorldQuaternion(new THREE.Quaternion()))
		.projectOnPlane(axis);
	const goal = toward.clone().projectOnPlane(axis);
	if (normal.lengthSq() < 1e-6 || goal.lengthSq() < 1e-6)
		return;
	const angle = Math.atan2(normal.clone().cross(goal).dot(axis), normal.dot(goal));
	ModelJuggler.rotateWorld(arm.lower, new THREE.Quaternion().setFromAxisAngle(axis, angle));
	arm.lower.updateMatrixWorld(true);
}

/** Turn a bone so that `from`, a world direction it carries, points along `to`. */
static aim(bone, from, to)
{
	ModelJuggler.rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()));
}

/** Apply a rotation given in world space to a bone. */
static rotateWorld(bone, rotation)
{
	const world = bone.getWorldQuaternion(new THREE.Quaternion());
	const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
	bone.quaternion.copy(parent.invert().multiply(rotation.multiply(world)));
}

panic()
{
	this.updateMatrixWorld(true);
	for (let side = 0; side < 2; side++)
		this.setHandPosition(side, this.localToWorld(v3(sideFactor(side) * 0.35, modelHeight + 0.15, 0.1)));
}

} // end ModelJuggler


class ThrowCurve extends THREE.Curve
{

constructor(p)
{
	super();
	this.type = 'ThrowCurve';
	for (const [k, v] of Object.entries(p))
		this[k] = v;

	this.v0 = p.catchPos.clone()
		.sub(p.throwPos)
		.divideScalar(this.duration)
		.setY((p.catchPos.y - p.throwPos.y - gravity * Math.pow(p.duration, 2) / 2) / p.duration);

	this.v1 = this.v0.clone().setY(this.v0.y + gravity * p.duration);

	this.rotationSpeed = (this.catchAngle - this.throwAngle + this.nSpins * 2 * Math.PI) / this.duration;
}

getPoint(t, optionalTarget)
{
	const dt = t * this.duration;

	const point = optionalTarget || new THREE.Vector3();
	point.set(
		(1 - t) * this.throwPos.x + t * this.catchPos.x,
		this.throwPos.y + this.v0.y * dt + gravity * Math.pow(dt, 2) / 2,
		(1 - t) * this.throwPos.z + t * this.catchPos.z
	);
	return point;
}

getRotation(t, optionalTarget)
{
	const target = optionalTarget || new THREE.Quaternion();
	if (this.spinAxis && this.throwAngle && this.catchAngle)
		return target.setFromAxisAngle(
			this.spinAxis,
			this.throwAngle + t * (this.catchAngle - this.throwAngle + this.nSpins * 2 * Math.PI)
		);
	return undefined;
}

} // end class ThrowCurve


class DwellCurve extends THREE.CubicBezierCurve3
{

constructor(p)
{
	const dCatch = p.vCatch.clone().multiplyScalar( p.duration);
	const dThrow = p.vThrow.clone().multiplyScalar(-p.duration);

	// limit dwell path to be within arms length
	// approximate solution by damping to some maximal distances to the control points
	const maxDist = upperArmLength + lowerArmLength - 0.4 * hu;
	const dCatchFactor = DwellCurve.damping(dCatch.length() / maxDist) * maxDist;
	const dThrowFactor = DwellCurve.damping(dThrow.length() / maxDist) * maxDist;

	super(
		p.catchPos.clone(),
		p.catchPos.clone().add(dCatch.clone().normalize().multiplyScalar(dCatchFactor)),
		p.throwPos.clone().add(dThrow.clone().normalize().multiplyScalar(dThrowFactor)),
		p.throwPos.clone(),
	);
	this.type = 'DwellCurve';
	if (p.catchAxis && p.throwAxis && ('throwAngle' in p) && ('catchAngle' in p) && ('throwRotationSpeed' in p)) {
		const maxRotationDelta = Math.PI;
		this.rotationCurve = new THREE.CubicBezierCurve3(
			new THREE.Vector3( p.catchAngle, 0 , 0),
			new THREE.Vector3( p.catchAngle, 0 , 0),
			new THREE.Vector3( p.throwAngle - DwellCurve.damping(p.throwRotationSpeed * p.duration / maxRotationDelta) * maxRotationDelta, 0, 0 ),
			new THREE.Vector3( p.throwAngle, 0, 0 )
		);
	}

	for (const [k, v] of Object.entries(p))
		this[k] = v;
}

getRotation(t, optionalTarget)
{
	const target = optionalTarget || new THREE.Quaternion();
	if (this.rotationCurve) {
		return target.setFromAxisAngle(
			this.catchAxis.clone().multiplyScalar(1 - t)
				.add(this.throwAxis.clone().multiplyScalar(t)),
			this.rotationCurve.getPoint(t).x
		);
	}
	return undefined;
}

// damps input to a maximum of 1, from 0 to 0.5 linear
static damping(x)
{
	return x <= 0.5 ? x : 1 - Math.pow(Math.E, Math.log(0.5) + 1 - 2 * x);
}

} // end class DwellCurve

class LinearCurve extends THREE.Curve
{

constructor(p)
{
	super();
	this.type = 'LinearCurve';
	for (const [k, v] of Object.entries(p))
		this[k] = v;
}

getPoint(t, optionalTarget)
{
	const target = optionalTarget || new THREE.Vector3();
	return target.copy(
		this.fromPoint.clone().multiplyScalar(1 - t)
			.add(this.toPoint.clone().multiplyScalar(t))
	);
}

} // end class LinearCurve

/*
 * this class represents the movement of a prop position and rotation/orientation
 */
class Movement
{

constructor(p)
{
	this.periodSeconds = p.periodSeconds;
	this.positionCurves = p.positionCurves;
	this.positionCurves.sort((a, b) => a.start - b.start);
	this.nCurves = this.positionCurves.length;
	this.lastIndex = 0;
}

getCurveAndFraction(t)
{
	// Commit this.lastIndex (the search-start hint) only on a MATCH. The old code
	// reassigned it every iteration, so `index = (lastIndex + i) % nCurves` used a
	// lastIndex that grew within the loop and skipped curves: starting from
	// lastIndex 0 with 6 curves it probed 0,1,3,0,4,3 — never 2 or 5. The
	// period-wrapping curve was among those skipped, so the prop/hand froze for that
	// span and then snapped. Only advancing the hint on a hit keeps the scan honest.
	for (let i = 0; i < this.nCurves; i++) {
		const index = (this.lastIndex + i) % this.nCurves;
		const c = this.positionCurves[index];
		const end = c.start + c.duration;
		if (c.start <= t && t < end) {
			this.lastIndex = index;
			return {
				curve: c,
				fraction: (t - c.start) / c.duration,
			};
		} else if (end > this.periodSeconds && t < (end % this.periodSeconds)) { // wrap around period
			this.lastIndex = index;
			return {
				curve: c,
				fraction: (t - c.start + this.periodSeconds) / c.duration,
			};
		}
	}
	return undefined;
}

getPosition(t, optionalTarget)
{
	const cf = this.getCurveAndFraction(t);
	if (cf)
		return cf.curve.getPoint(cf.fraction, optionalTarget);
	return undefined;
}

getRotation(t, optionalTarget)
{
	const cf = this.getCurveAndFraction(t);
	if (cf && cf.curve.getRotation)
		return cf.curve.getRotation(cf.fraction, optionalTarget);
	return undefined;
}

} // end class Movement


export default class Animation {

constructor(canvas, jif, animationOptions, sizeOptions)
{
	this.renderer = new THREE.WebGLRenderer({
		canvas: canvas,
		antialias:true,
	});
	this.renderer.setClearColor(new THREE.Color(0xffffff));

	// use same colors as before threejs-152
	// documentaiton: https://threejs.org/docs/#manual/en/introduction/Color-management
	THREE.ColorManagement.enabled = false;


	this.camera = new THREE.PerspectiveCamera(45, sizeOptions.width / sizeOptions.height, 0.1, 10000);
	this.camera.position.set(0, 2, 10);
	this.camera.lookAt(v3(0, 2, 0));

	this.resize(sizeOptions);

	this.controls = new OrbitControls( this.camera, this.renderer.domElement );
	this.controls.enableKeys = false;
	this.controls.maxDistance = 100;

	this.timer = {dt: 0};
	this.paused = false;

	this.scenery = sceneries[animationOptions.scenery] || sceneries.passist;
	this.grassTileMesh = Animation.createGroundMesh(this.scenery.ground);
	this.skyMesh = Animation.createSkyMesh(this.scenery);
	this.clubGeometry = pirouetteGeometry();

	this.updateScene(jif, animationOptions);
	this.animate();
}

/**
 * Fetch the models `jugglerModels` names. updateScene builds the scene at once and draws a Juggler for
 * any model not yet here, so await this before the first one.
 */
static loadModels(jugglerModels = [])
{
	return Promise.all(jugglerModels.filter(Boolean).map(spec => loadModel(spec.url)));
}

resize(sizeOptions)
{
	const { width, height, pixelRatio } = sizeOptions;
	this.camera.aspect = width / height;
	this.camera.updateProjectionMatrix();

	this.renderer.setSize(width * pixelRatio, height * pixelRatio);
	this.renderer.domElement.style.width  = (this.renderer.domElement.width  / pixelRatio) + 'px';
	this.renderer.domElement.style.height = (this.renderer.domElement.height / pixelRatio) + 'px';

	this.positionCamera();
}

/**
 * position camera so that the whole scene is visible
 */
positionCamera()
{
	if (!this.bbox || !this.camera)
		return;

	const center = new THREE.Vector3();
	const size = new THREE.Vector3();
	this.bbox.getCenter(center);
	this.bbox.getSize(size);

	const fov = this.camera.fov * (Math.PI / 180);
	const slack = 0.5;
	const a = 2 * Math.tan(fov / 2);
	const dzWidth  = (size.x + slack) / (a * this.camera.aspect);
	const dzHeight = (size.y + slack) / a;

	this.camera.position.set(
		center.x,
		center.y,
		center.z + this.bbox.max.z + Math.max(dzHeight, dzWidth)
	);
	this.camera.lookAt(center);

	this.controls.target = center;
	this.controls.saveState();
}

/**
 * code mostly extracted from https://github.com/supermedium/aframe-environment-component
 * many thanks to the A-Frame guys!
 */
static createGroundMesh(ground)
{
	return ground.kind == 'grid' ? Animation.createGridMesh(ground) : Animation.createGrassTileMesh(ground.colors);
}

/** A plain floor ruled every metre, the lines thin enough to fade into it with distance. */
static createGridMesh({ base, line })
{
	const size = 64;
	const radius = 200;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, size, size);
	ctx.fillStyle = line;
	ctx.fillRect(0, 0, size, 2);
	ctx.fillRect(0, 0, 2, size);
	const tex = new THREE.CanvasTexture(canvas);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.repeat.set(2 * radius, 2 * radius); // a circle's uv spans its diameter: one tile a metre
	tex.anisotropy = 8;
	tex.colorSpace = THREE.SRGBColorSpace;
	return new THREE.Mesh(
		new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
		new THREE.MeshBasicMaterial({ map: tex }),
	);
}

static createGrassTileMesh([ground1, ground2])
{
	const numSquares = 32;
	const groundStretch = 10;
	const groundRepeat = 20;
	const groundRand = function(x) {
		return parseFloat('0.' + Math.sin(4 * 9999 * x).toString().substr(7));
	}
	const canvas = document.createElement('canvas');
	canvas.width  = numSquares;
	canvas.height = numSquares;
	const ctx = canvas.getContext("2d");
	const col1 = new THREE.Color(ground1);
	const col2 = new THREE.Color(ground2);
	for (let i = 0; i < numSquares * numSquares; i++) {
		const col = groundRand(i + 3) > 0.5 ? col1.clone() : col2.clone();
		col.addScalar(groundRand(i + 3) * 0.1 - 0.05);
		ctx.fillStyle = '#' + col.getHexString();
		ctx.fillRect((i % numSquares), Math.floor(i / numSquares), 1, 1);
	}
	const tex = new THREE.CanvasTexture(canvas);
	tex.wrapT = THREE.RepeatWrapping
	tex.wrapS = THREE.RepeatWrapping
	tex.repeat.set(groundRepeat, groundRepeat)
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	tex.encoding = THREE.sRGBEncoding;
	return new THREE.Mesh(
		new THREE.CircleGeometry(groundStretch * groundRepeat, 32).rotateX(-Math.PI / 2),
		new THREE.MeshToonMaterial({map:tex}),
	);
}

static createSkyMesh({ sky, fog })
{
	return new THREE.Mesh(
		new THREE.SphereGeometry( 4000, 32, 15 ),
		new THREE.ShaderMaterial({
			uniforms: {
				"topColor":    { value: new THREE.Color(sky) },
				"bottomColor": { value: new THREE.Color(fog) },
				"offset":      { value: 33 },
				"exponent":    { value: 0.6 }
			},
			vertexShader: `
				varying vec3 vWorldPosition;
				void main() {
					vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
					vWorldPosition = worldPosition.xyz;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}
			`,
			fragmentShader: `
				uniform vec3 topColor;
				uniform vec3 bottomColor;
				uniform float offset;
				uniform float exponent;
				varying vec3 vWorldPosition;
				void main() {
					float h = normalize( vWorldPosition + offset ).y;
					gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
				}
			`,
			side: THREE.BackSide
		})
	);
}

static clubTexture(clubColors = {})
{
	const darkgray = 0x2c3e50;
	clubColors = Object.assign({
		top:    darkgray,
		body:   colors.meeseeks,
		tape:   darkgray,
		handle: 0xf2f2f2,
		knob:   darkgray,
	}, clubColors);

	const canvas = document.createElement('canvas');
	canvas.width  = 1;
	canvas.height = 100;
	const ctx = canvas.getContext("2d");

	const stops = [
		[3,  clubColors.top    ],
		[25, clubColors.body   ],
		[27, clubColors.tape   ],
		[47, clubColors.handle ],
		[99, clubColors.knob   ],
	];

	let y0 = 0;
	for (const stop of stops) {
		const y1 = stop[0];
		ctx.fillStyle = '#' + (new THREE.Color(stop[1])).getHexString();
		ctx.fillRect(0, y0, 1, y1 - y0);
		y0 = y1;
	}

	const tex = new THREE.CanvasTexture(canvas);
	tex.encoding = THREE.sRGBEncoding;
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	return tex;
}

updateScene(jif, options)
{
	this.options = options = Object.assign({
		valid: true,
		jugglingSpeed: defaults.jugglingSpeed,
		animationSpeed: defaults.animationSpeed,
	}, options); // defaults

	this.jif = jif = Object.assign({
		jugglers: [],
		limbs: [],
		props: [],
	}, jif);
	const timeStretchFactor = jif.timeStretchFactor ? jif.timeStretchFactor : 1;
	this.beatsPerSecond = options.jugglingSpeed * timeStretchFactor;
	const periodSeconds = this.periodSeconds = jif.repetition.period / this.beatsPerSecond;
	const nProps = jif.props.length;

	this.cleanup();
	this.scene = new THREE.Scene();

	this.scene.background = new THREE.Color().setHSL(0.6, 0, 1);
	this.scene.fog = new THREE.Fog(this.scene.background, 50, 1000);
	this.scene.fog.color.copy( new THREE.Color(this.scenery.fog));

	const hemiLight = new THREE.HemisphereLight(this.scenery.lightSky, this.scenery.lightGround, 1);
	hemiLight.position.set(0, 50, 0);
	this.scene.add(hemiLight);

	const dirLight = new THREE.DirectionalLight(0xffe6e5, 1);
	dirLight.position.set(15, 50, 30);
	this.scene.add( dirLight );

	this.scene.add( this.skyMesh );
	this.scene.add( this.grassTileMesh);

	this.bbox = new THREE.Box3(v3(0, 0, 0), v3(0, 0, 0));

	this.jugglers = [];
	const models = options.jugglerModels || [];
	for (const [index, juggler] of jif.jugglers.entries()) {
		const spec = models[index];
		const model = spec && readyModels[spec.url];
		const j = model
			? new ModelJuggler(model, spec)
			: new Juggler(resourceUrl(options.valid ? '/images/face_texture.png' : '/images/panic_face_texture.png'));
		j.position.set(...juggler.position);
		j.lookAt(...juggler.lookAt);
		this.jugglers.push(j);
		this.scene.add(j);
		this.bbox.expandByObject(j);
	}

	if (!options.valid) {
		for (const j of this.jugglers) {
			j.lookAt(this.camera.position.clone().setY(0));
			j.panic();
		}
		this.positionCamera();
		return;
	}
	if (nProps < 1) {
		this.positionCamera();
		return;
	}

	this.props = [];
	for (const prop of jif.props) {
		const type = prop.type || "club";
		const color = propColor(prop, jif)

		const mesh = type == 'ball' ?
			new THREE.Mesh(
				new THREE.SphereGeometry( 0.04, 10, 10 ),
				new THREE.MeshToonMaterial({color: color} )
			)
			: new THREE.Mesh(
				this.clubGeometry,
				new THREE.MeshToonMaterial({
					map: Animation.clubTexture({body: color})
				})
			);
		this.props.push({
			mesh: mesh,
			type: type,
			throws: []
		});
		this.scene.add(mesh);
	}
	for (const t of jif.throws)
		if (t.duration > 0 && t.prop !== undefined)
			this.props[t.prop].throws.push(t);

	this.hands = [];

	this.throwPositions = [];
	this.catchPositions = [];
	this.zipCatchPositions = [];
	for (let limb of jif.limbs) {
		let j = limb.juggler;

		let side = ({
			'right hand': 0,
			'left hand':  1
		})[limb.type];
		if (side === undefined) {
			console.log('unable to handle limb type: ' + limb.type);
			side = limb.type.match(/right/) ? 0 : 1;
		}

		// Each juggler knows where its own hands work.
		const throwPosition = this.jugglers[j].throwPosition(side);
		this.catchPositions.push(this.jugglers[j].catchPosition(side));
		this.throwPositions.push(throwPosition);
		this.zipCatchPositions.push(this.jugglers[j].zipCatchPosition(side));
		this.jugglers[j].setHandPosition(side, throwPosition);

		this.hands.push({
			juggler: this.jugglers[j],
			positionCurves: [],
			side: side,
		});
	}

	const propThrows = Array.from(Array(jif.props.length), () => new Array());

	// calculate prop movements
	for (const t of jif.throws) {
		if (t.duration > 0) {
			const soloHeight = t.duration / timeStretchFactor;
			if (!('dwell' in t))
				t.dwell = (soloHeight > 2 ? 1 : (soloHeight < 1 ? 0 : 0.5)) * timeStretchFactor;
			if (!('spins' in t))
				t.spins = Math.max(0, Math.floor(soloHeight - 2));

			const jugglerFrom = jif.limbs[t.from].juggler;
			const jugglerTo = jif.limbs[t.to].juggler;
			const up = v3(0, 1, 0);
			t.throwPos = this.throwPositions[t.from];
			t.catchPos = this.catchPositions[t.to];
			t.throwAngle = 1.5 * Math.PI; // TODO: make this dependent on throw (type, duration, where its supposed to go)
			if (jugglerFrom == jugglerTo) { // self - TODO: improve angle for crossing selfs
				t.axis = this.jugglers[jugglerFrom].facing.cross(up);
				t.catchAngle = 1.5 * Math.PI;

				// zip like
				if (soloHeight < 2.5 && t.from != t.to)
					t.catchPos = this.zipCatchPositions[t.to];
			} else { // pass
				t.axis = t.catchPos.clone().sub(t.throwPos).normalize().cross(up);
				t.catchAngle = 2 * Math.PI;
			}
			// A juggler that grips holds a club by its handle, so the club's middle — what flies — leaves
			// and arrives a handle's length from the hand, along the club as it lies at that moment. It
			// lets go of the club pointing up and forward, not level: level, the club lies along the
			// forearm, which a hand can only hold with its wrist bent square. A self is caught the same way.
			if (t.prop !== undefined && this.props[t.prop].type != 'ball') {
				if (this.jugglers[jugglerFrom].grips)
					t.throwAngle = gripReleaseAngle;
				if (this.jugglers[jugglerTo].grips && jugglerFrom == jugglerTo)
					t.catchAngle = gripReleaseAngle;
				const gripped = (pos, angle) => pos.clone().add(
					v3(0, clubGrip, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(t.axis, angle)));
				if (this.jugglers[jugglerFrom].grips)
					t.throwPos = gripped(t.throwPos, t.throwAngle);
				if (this.jugglers[jugglerTo].grips)
					t.catchPos = gripped(t.catchPos, t.catchAngle);
			}
			t.throwCurve = new ThrowCurve({
				throwPos: t.throwPos,
				catchPos: t.catchPos,
				start:    t.time / this.beatsPerSecond,
				duration: (t.duration - t.dwell) / this.beatsPerSecond,
				from: t.from,
				to:   t.to,
				nSpins:   t.spins,
				spinAxis: t.axis,
				throwAngle: t.throwAngle,
				catchAngle: t.catchAngle,
				isSelf:   jugglerFrom == jugglerTo,
			});
			propThrows[t.prop].push(t.throwCurve);

			for (const p of t.throwCurve.getPoints(11))
				this.bbox.expandByPoint(p);

			if (options.showOrbits) {
				this.scene.add(new THREE.Mesh(
					new THREE.TubeGeometry(t.throwCurve, 32, 0.01, 16, false),
					new THREE.MeshToonMaterial({ color:propColor(jif.props[t.prop], jif) }),
				));
			}
		}
	}

	// calculate prop movements during dwell
	propThrows.forEach((throwCurves, prop) => {

		const positionCurves = [];
		let last = throwCurves[throwCurves.length - 1];
		for (const curve of throwCurves) {
			if (last.to != curve.from) {
				console.log('prop teleportation detected - should not happen!');
				continue;
			}
			const start = (last.start + last.duration) % periodSeconds;
			const end = curve.start;
			const dwellDuration = end - start + (end >= start - 1e-10 ? 0 : periodSeconds);

			if (dwellDuration > 0) {
				const dwellCurve = new DwellCurve({
					catchPos: last.catchPos,
					throwPos: curve.throwPos,
					vCatch: last.v1.clone(),
					vThrow: curve.v0.clone(),
					start: start,
					duration: dwellDuration,
					hand: curve.from,
					prop: prop,
					catchAxis: last.spinAxis.clone().multiplyScalar(last.isSelf ? 1 : -1),
					catchAngle: last.catchAngle,
					catchRotationSpeed: -last.rotationSpeed,
					throwAxis: curve.spinAxis,
					throwAngle: curve.throwAngle,
					throwRotationSpeed: curve.rotationSpeed,
				});
				this.hands[dwellCurve.hand].positionCurves.push(dwellCurve);
				if (options.showOrbits)
					this.scene.add(new THREE.Mesh(
						new THREE.TubeGeometry(dwellCurve, 32, 0.01, 16, false),
						new THREE.MeshToonMaterial({ color:propColor(jif.props[prop], jif) }),
					));
				positionCurves.push(dwellCurve);
			}
			positionCurves.push(curve);
			last = curve;
		}

		this.props[prop].movement = new Movement({
			positionCurves: positionCurves,
			periodSeconds: periodSeconds,
		});
	});

	// calculate hand movements between dwells (return to catch position)
	for (const hand of this.hands) {
		const pc = [];
		hand.positionCurves.sort((a, b) => a.start - b.start);
		let last = hand.positionCurves[hand.positionCurves.length - 1];
		for (const curve of hand.positionCurves) {
			const start = last.start + last.duration
			const end = curve.start;
			pc.push(new LinearCurve({
				fromPoint: last.throwPos,
				toPoint: curve.catchPos,
				before: last, // the dwells either side, for a ModelJuggler's grip
				after: curve,
				start: start,
				duration: end - start + (end > start ? 0 : periodSeconds),
			}));
			pc.push(curve);
			last = curve;
		}
		hand.movement = new Movement({
			positionCurves: pc,
			periodSeconds: periodSeconds,
		});
	}

	this.positionCamera();

	this.setPositions(0);
}

animate()
{
	const jif = this.jif;

	const t = performance.now(); // web page time [ms]
	let time = 0; // time since animation start [ms]
	if (t !== undefined) {
		if (this.paused) {
			time = this.timer.dt;
		} else {
			if (this.timer.starttime === undefined)
				this.timer.starttime = t - this.timer.dt;
			time = t - this.timer.starttime;
			this.timer.dt =  time;
		}
		if (this.prevTime !== undefined)
			this.fps = Math.round(1000 / (t - this.prevTime));
		this.prevTime = t;
	}

	this.animationFrameRequestId = requestAnimationFrame(this.animate.bind(this));
	this.controls.update();

	if (jif && this.props && !this.paused)
		this.setPositions((time / 1000 * this.options.animationSpeed) % this.periodSeconds);

	this.renderer.render(this.scene, this.camera);
}

/**
 * set positions of all objects
 * t: time in secons
 */
setPositions(t)
{
	for (const p of this.props) {
		let visible = false;
		if (p.movement.getPosition(t, p.mesh.position))
			visible = true;

		let quaternion = p.movement.getRotation(t);
		if (quaternion)
			p.mesh.setRotationFromQuaternion(quaternion);

		p.mesh.visible = visible;
	}

	for (const hand of this.hands) {
		if (hand.juggler.grips) {
			const hold = this.holdAt(hand, t);
			if (!hold)
				continue;
			// Passist's scoop swings a club down past the hip; a body in the way moves the hand round it,
			// and the club it holds with it.
			const clear = hand.juggler.clearOfBody(hold.position);
			if (hold.prop !== undefined)
				this.props[hold.prop].mesh.position.add(clear.clone().sub(hold.position));
			hold.position = clear;
			hand.juggler.setHandPosition(hand.side, hold.position, hold);
			continue;
		}
		const handPos = hand.movement.getPosition(t);
		if (handPos)
			hand.juggler.setHandPosition(hand.side, handPos);
	}
}

/**
 * Where a hand that grips holds what it holds at time t, for a ModelJuggler: the club by its handle
 * rather than its middle, which is where Passist moves a hand, and the way the club points, so the
 * hand can turn to it. The club's own path was moved out by the handle's length in updateScene, so at
 * a catch and a throw this is the hand's own position. Between a throw and the next catch the empty hand moves from where the last
 * handle left it to where the next will arrive, so it never jumps. `closure` is how far the fingers
 * are closed: shut over the first moments of a dwell and open again just after the throw.
 */
holdAt(hand, t)
{
	const cf = hand.movement.getCurveAndFraction(t);
	if (!cf)
		return undefined;
	const { curve, fraction } = cf;
	const ease = x => { const c = THREE.MathUtils.clamp(x, 0, 1); return c * c * (3 - 2 * c); };
	if (curve.type == 'DwellCurve') {
		const grip = this.gripOf(curve, fraction);
		return {
			position: curve.getPoint(fraction).add(grip.offset),
			prop: curve.prop,
			rotation: grip.rotation,
			ball: grip.ball,
			closure: ease(fraction * curve.duration / gripCloseSeconds),
		};
	}
	const from = this.gripOf(curve.before, 1);
	const to = this.gripOf(curve.after, 0);
	// Empty, the hand eases into a relaxed open palm, and back to the next club's angle as it arrives.
	const elapsed = fraction * curve.duration;
	const left = (1 - fraction) * curve.duration;
	return {
		ready: Math.min(ease(elapsed / gripReadySeconds), ease(left / gripReadySeconds)),
		position: curve.before.throwPos.clone().add(from.offset)
			.lerp(curve.after.catchPos.clone().add(to.offset), fraction),
		rotation: from.rotation && to.rotation ? from.rotation.clone().slerp(to.rotation, fraction) : undefined,
		ball: from.ball,
		closure: 1 - ease(fraction * curve.duration / gripOpenSeconds),
	};
}

/** The handle's offset from a club's middle, and the club's rotation, at a point of a dwell. */
gripOf(dwell, fraction)
{
	const rotation = dwell.getRotation(fraction);
	if (this.props[dwell.prop].type == 'ball' || !rotation)
		return { offset: v3(0, 0, 0), rotation: undefined, ball: true };
	return { offset: v3(0, -clubGrip, 0).applyQuaternion(rotation), rotation, ball: false };
}

togglePause()
{
	if (this.paused)
		this.timer.starttime = undefined;
	return this.paused = !this.paused;
}

cleanup()
{
	if (this.scene) {
		this.scene.remove.apply(this.scene, this.scene.children);
		this.renderer.renderLists.dispose();
	}
}

destroy()
{
	this.cleanup();
	if (this.animationFrameRequestId)
		cancelAnimationFrame(this.animationFrameRequestId);
}

} // end class Animation
