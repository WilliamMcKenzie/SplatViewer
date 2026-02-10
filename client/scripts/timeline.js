import * as THREE from "three"
import { exportVideo } from "/scripts/export.js"
import { savePath, loadPath } from "/scripts/save&load.js"

export let frames = []
let currentTime = 0
let playing = false

// Timeline element
let timelineSlider = null
let scrubbing = false

// Keyframe selection
let gizmos = new THREE.Group()
let selected

const getTimelineDuration = () => {
	const max = timelineSlider ? Number(timelineSlider.max) : 20
	return Number.isFinite(max) && max > 0 ? max : 20
}

class Frame {
	constructor(timestamp, pos, quat) {
		this.timestamp = timestamp
		this.pos = pos
		this.quat = quat
		
		const key = document.createElement("button")
		this.key = key
		this.configureKey()
		this.createGizmo()
	}
	
	createGizmo(pos = this.pos, quat = this.quat) {
		const color = "#5fcde4"
		const gizmo = new THREE.Group()
		const coneGeo = new THREE.ConeGeometry(0.05, 0.15, 8)
		const coneMat = new THREE.MeshBasicMaterial({ color, wireframe: true })
		const cone = new THREE.Mesh(coneGeo, coneMat)
		
		cone.rotation.x = -Math.PI / 2
		cone.position.z = -0.08

		const lineGeom = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(0, 0, -0.3),
		])
		const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color }))

		gizmo.add(cone, line)
		gizmo.position.copy(pos)
		gizmo.quaternion.copy(quat)
		
		gizmos.add(gizmo)
		this.gizmo = gizmo
	}
	
	select() {
		selected = this
		this.gizmo.traverse(mesh => {
			if (mesh.material) {
				mesh.material.color.set("#fff")
			}
		})
		this.key.classList.add("selected")
	}
	
	deSelect() {
		selected = null
		this.gizmo.traverse(mesh => {
			if (mesh.material) {
				mesh.material.color.set("#5fcde4")
			}
		})
		this.key.classList.remove("selected")
	}
	
	configureKey(key = this.key) {
		key.className = "key"
		key.style.left = `${100 * (this.timestamp / 20)}%`
		key.onclick = () => {
			if (selected == this) {
				this.deSelect()
			}
			else if (selected) {
				selected.deSelect()
				this.select()
			}
			else {
				this.select()
			}
		}
		
		key.style.touchAction = "none"
		key.addEventListener("pointerdown", (e) => {
			if (playing) return
			if (e.button !== 0) return
			e.preventDefault()
			const container = document.getElementById("timeline_container")
			if (!container) return

			if (key.setPointerCapture) {
				key.setPointerCapture(e.pointerId)
			}

			const onMove = (ev) => {
				const rect = container.getBoundingClientRect()
				const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left))
				const duration = getTimelineDuration()
				const nextTime = (x / rect.width) * duration
				this.timestamp = nextTime
				this.key.style.left = `${100 * (this.timestamp / duration)}%`
				sortFrames()
			}
			const onUp = () => {
				document.removeEventListener("pointermove", onMove)
				document.removeEventListener("pointerup", onUp)
			}

			document.addEventListener("pointermove", onMove)
			document.addEventListener("pointerup", onUp)
			onMove(e)
		})
		
		document.getElementById("timeline_container").appendChild(key)
	}

	setTime(timestamp) {
		this.timestamp = timestamp
		const duration = getTimelineDuration()
		this.key.style.left = `${100 * (this.timestamp / duration)}%`
	}

	updateTime(delta) {
		this.setTime(this.timestamp + delta)
		sortFrames()
	}
	
	destroy() {
		this.gizmo.removeFromParent()
		this.gizmo = null
		this.key.remove()
		this.key = null
		
		if (selected == this) {
			selected = null
		}
		
		frames.splice(frames.indexOf(this), 1)
	}
}

function importKeyframe(frame) {
	let idx = 0
	
	for (let i = 0; i < frames.length; i++) {
		if (frames[i].timestamp >= currentTime) {
			break
		}
		idx = i + 1
	}
	frames.splice(idx, 0, frame)
}

function addKeyframe(viewer) {
	let frame = new Frame(
		currentTime,
		viewer.camera.position.clone(),
		viewer.camera.quaternion.clone()
	)
	let idx = 0
	
	for (let i = 0; i < frames.length; i++) {
		if (frames[i].timestamp >= currentTime) {
			break
		}
		idx = i + 1
	}
	frames.splice(idx, 0, frame)
}

export function setFrames(_frames) {
	for (let frame of [...frames]) {
		frame.destroy()
	}
	
	for (let frame of _frames) {
		let p = frame.pos
		let q = frame.quat
		importKeyframe(new Frame(
			frame.timestamp,
			new THREE.Vector3(p.x, p.y, p.z),
			new THREE.Quaternion(
				q[0], q[1], q[2], q[3]
			)
		))
	}
	
	sortFrames()
}

function getFrame(i) {
	return frames[
		Math.max(
			0,
			Math.min(i, frames.length - 1)
		)
	]
}

function sortFrames() {
  frames.sort((a, b) => a.timestamp - b.timestamp);
}

export function renderFrame(viewer, time = currentTime) {
	let last = 0
	let next = 0
	
	for (let i = 1; i < frames.length; i++) {
		if (frames[i].timestamp >= time) {
			next = i
			break
		}
		last = i
	}
	
	if (next == 0) return
	if (last == next) return
	
	const t1 = frames[last].timestamp
	const t2 = frames[next].timestamp
	time = Math.min(1, Math.max(0, (time - t1) / (t2 - t1)))
	const easedTime = time * time * (3 - 2 * time)
	
	const interpolate = (n1, n2) => {
		return n1 + (n2 - n1) * easedTime
	}
	const interpolateVector = (vec1, vec2) => new THREE.Vector3(
		interpolate(vec1.x, vec2.x),
		interpolate(vec1.y, vec2.y),
		interpolate(vec1.z, vec2.z),
	)
	const splineVector = (p0, p1, p2, p3, t) => {
		const t2 = t * t
		const t3 = t2 * t
		const out = new THREE.Vector3()
		out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
		out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
		out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
		return out
	}
	
	const p0 = getFrame(last - 1).pos
	const p1 = getFrame(last).pos
	const p2 = getFrame(next).pos
	const p3 = getFrame(next + 1).pos
	let pos = null
	
	if (frames.length >= 3) {
		pos = splineVector(p0, p1, p2, p3, easedTime)
	}
	else {
		pos = interpolateVector(p1, p2)
	}
	// dont mess up depth if walking mode
	if (Math.round(p1.y) == 0 && Math.round(p2.y) == 0) {
		pos.y = 0
	}
	
	const quat = frames[last].quat.clone().slerp(frames[next].quat, easedTime)
	const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
	
	viewer.camera.position.copy(pos)
	viewer.camera.quaternion.copy(quat)
	viewer.controls.target.copy(pos).addScaledVector(forward, 1)
}

export function playFrame(viewer, delta) {
	if (!playing) return
	currentTime += delta
	timelineSlider.value = currentTime
	renderFrame(viewer)
	
	if (currentTime >= frames[frames.length - 1].timestamp) {
		currentTime = frames[0].timestamp
		playing = false
	}
}

export function toggleGizmos() {
	gizmos.visible = !gizmos.visible
}

function togglePlay() {		
	if (frames.length > 0) {
		playing = !playing
		
		if (currentTime < frames[0].timestamp) {
			currentTime = frames[0].timestamp
		}
	}
}

export function initTimeline(viewer) {
	const canvas = viewer.renderer.domElement
    const playButton = document.getElementById("play_btn")
    const keyframeButton = document.getElementById("keyframe_btn")
    const exportButton = document.getElementById("export_btn")
    const fileInput = document.getElementById("choose_file")
    const saveButton = document.getElementById("save_btn")
    const loadButton = document.getElementById("load_btn")
	
	timelineSlider = document.getElementById("timeline_slider")
	viewer.threeScene.add(gizmos)
	
	// Handle with keyframes
	document.addEventListener("keydown", (e) => {
		if (selected == null) {
			return
		}
		else if (e.key == "ArrowRight") {
			e.stopImmediatePropagation()
			selected.updateTime(0.3)
		}
		else if (e.key == "ArrowLeft") {
			e.stopImmediatePropagation()
			selected.updateTime(-0.3)
		}
		else if (e.key == "Backspace" || e.key == "Delete") {
			e.stopImmediatePropagation()
			selected.destroy()
		}
	}, { capture: true })
    
    // Dont want player to alter during playback
    const blockEvent = (e) => {
        if (playing) {
            e.stopImmediatePropagation()
        }
    }
	document.addEventListener("pointerdown", blockEvent, { capture: true })
    document.addEventListener('mousedown', blockEvent, { capture: true })
    
    playButton.addEventListener("click", togglePlay)
    keyframeButton.addEventListener("click", () => addKeyframe(viewer))
    exportButton.addEventListener("click", () => exportVideo(viewer))
    saveButton.addEventListener("click", () => savePath(frames))
    loadButton.addEventListener("click", () => fileInput.click())
    fileInput.addEventListener("change", () => {
		const file = fileInput.files[0]
		if (!file) return

		loadPath(file)
		fileInput.value = ""
	})
    
	timelineSlider.addEventListener("input", (e) => {
		playing = false
		scrubbing = true
		currentTime = Number(e.target.value)
		
		if (frames.length > 1) {
			renderFrame(viewer)
		}
	})
	timelineSlider.addEventListener("change", () => {
		scrubbing = false
	})
}
