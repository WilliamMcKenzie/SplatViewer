import * as THREE from "three"

let frames = []
let currentTime = 0
let playing = false
let timelineSlider = null
let isScrubbing = false

// Current keyframe selection
let selected = null

class Frame {
	constructor(timestamp, pos, target) {
		this.timestamp = timestamp
		this.pos = pos
		this.target = target
		
		const key = document.createElement("button")
		key.className = "key"
		key.style.left = `${100 * (timestamp / 20)}%`
		key.onclick = () => {
			if (selected == this) {
				selected = null
				key.classList.remove("selected")
			}
			else if (selected) {
				selected.key.classList.remove("selected")
				selected = this
				key.classList.add("selected")
			}
			else {
				selected = this
				key.classList.add("selected")
			}
		}
		
		this.key = key
		document.getElementById("timeline_container").appendChild(key)
	}
	
	updateTime(delta) {
		this.timestamp += delta
		this.key.style.left = `${100 * (this.timestamp / 20)}%`
		sortFrames()
	}
	
	destroy() {
		this.key.remove()
		this.key == null
		frames.splice(frames.indexOf(this), 1)
	}
}

function sortFrames() {
  frames.sort((a, b) => a.timestamp - b.timestamp);
}

export function initTimeline(viewer) {
	const canvas = viewer.renderer.domElement
    const playButton = document.getElementById("play_btn")
    const keyframeButton = document.getElementById("keyframe_btn")
    const exportButton = document.getElementById("export_btn")
	timelineSlider = document.getElementById("timeline_slider")
	
	// Deal with keyframes
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
    
    // Prevent default pointer events
    const blockEvent = (e) => {
        if (playing) {
            e.stopImmediatePropagation()
        }
    }
	document.addEventListener("pointerdown", blockEvent, { capture: true })
    document.addEventListener('mousedown', blockEvent, { capture: true })
    
	function addKeyframe() {
		let frame = new Frame(
			currentTime,
			viewer.camera.position.clone(),
			viewer.controls.target.clone()
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
    
    function togglePlay() {		
		if (frames.length > 0) {
			playing = !playing
			
			if (currentTime < frames[0].timestamp) {
				currentTime = frames[0].timestamp
			}
		}
	}
    
    keyframeButton.addEventListener("click", addKeyframe)
    playButton.addEventListener("click", togglePlay)
	if (timelineSlider) {
		timelineSlider.addEventListener("input", (e) => {
			playing = false
			isScrubbing = true
			currentTime = Number(e.target.value)
			
			if (frames.length > 1) {
				renderFrame(viewer)
			}
		})
		timelineSlider.addEventListener("change", () => {
			isScrubbing = false
		})
	}
}

function renderFrame(viewer) {
	let last = 0
	let next = 0
	
	for (let i = 1; i < frames.length; i++) {
		if (frames[i].timestamp >= currentTime) {
			next = i
			break
		}
		last = i
	}
	
	if (next == 0) return
	
	const pos1 = frames[last].pos
	const pos2 = frames[next].pos
	const tgt1 = frames[last].target
	const tgt2 = frames[next].target
		const time1 = frames[last].timestamp
		const time2 = frames[next].timestamp
	
	const interpolate = (n1, n2) => {
		return (
			(currentTime - time1) *
			(n2 - n1) / (time2 - time1)
		) + n1
	}
	const interpolateVector = (vec1, vec2) => {
		return new THREE.Vector3(
			interpolate(vec1.x, vec2.x),
			interpolate(vec1.y, vec2.y),
			interpolate(vec1.z, vec2.z),
		)
	}
	const splineVector = (vec1, vec2) => {
		return new THREE.Vector3(
			interpolate(vec1.x, vec2.x),
			interpolate(vec1.y, vec2.y),
			interpolate(vec1.z, vec2.z),
		)
	}
	
	let pos = interpolateVector(pos1, pos2)
	let target = interpolateVector(tgt1, tgt2)
		viewer.camera.position.copy(pos)
		viewer.controls.target.copy(target)
		viewer.controls.update()
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
