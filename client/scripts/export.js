import { renderFrame, toggleGizmos, frames } from "/scripts/timeline.js"

const token = crypto.randomUUID().replace("-", "")

async function startExport(frames) {
	await fetch("http://localhost:67/start", {
		method: "POST",
		headers: {
			"token" : token,
			"frames": String(frames)
		}
	})
}

async function sendFrame(canvas, time, index) {
	let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
	await fetch("http://localhost:67/frame", {
		method: "POST",
		headers: {
			"token" : token,
			"index": String(index),
			"Content-Type": "image/png"
		},
		body: blob
	})
}

async function finishExport() {
	let res = await fetch("http://localhost:67/finish", {
		method: "POST",
		headers: {
			"token" : token
		}
	})
	
	const url = await res.text()
	const data = await fetch(url)
	const blob = await data.blob()

	const a = document.createElement("a")
	a.href = URL.createObjectURL(blob)
	a.download = "output.mp4"
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(a.href)
}

function hideExportModal() {
	const exportModal = document.getElementById("export_modal")
	exportModal.classList.add("hidden")
}

async function setAspectRatio(viewer, width = window.innerWidth, height = window.innerHeight) {
	const root = viewer.rootElement
	
	viewer.renderer.setPixelRatio(1)
	viewer.renderer.setSize(width, height, false)
	
	if (viewer.camera.isPerspectiveCamera) {
		viewer.camera.aspect = width / height
		viewer.camera.updateProjectionMatrix()
	}
	
	await new Promise(requestAnimationFrame)
}

export async function exportVideo(viewer) {
	if (frames.length < 2) {
		return
	}
	
	const canvas = viewer.renderer.domElement
	const exportModal = document.getElementById("export_modal")
	const exportLabel = document.getElementById("export_label")
	const exportProgress = document.getElementById("export_progress")
	exportModal.classList.remove("hidden")
	exportProgress.value = 0
	exportLabel.innerHTML = "Exporting..."
	
	await setAspectRatio(viewer, 1280, 720)
	toggleGizmos()
	
	// process frames
	const fps = 30
	const startTime = frames[0].timestamp
	const endTime = frames[frames.length - 1].timestamp
	let time = startTime
	let index = 0
	
	let frameCount = 0
	while (time < endTime) {
		time += 1/fps
		frameCount += 1
	}
	await startExport(frameCount)
	
	time = startTime
	while (time < endTime) {
		time += 1/fps
		renderFrame(viewer, time)
		viewer.update()
		viewer.render()
		
		await new Promise(requestAnimationFrame)
		
		sendFrame(canvas, time, index)
		index += 1
		
		exportProgress.value = index/frameCount
	}
	exportLabel.innerHTML = "Processing..."
	
	await finishExport()
	await setAspectRatio(viewer)
	
	hideExportModal()
	toggleGizmos()
}
