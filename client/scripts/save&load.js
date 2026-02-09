import { setFrames } from "/scripts/timeline.js"

export function savePath(frames) {
	let data = []
	
	for (let frame of frames) {
		data.push({
			timestamp : frame.timestamp,
			pos : frame.pos,
			quat : frame.quat
		})
	}
	
	const json = JSON.stringify(data, null, 2)
	const blob = new Blob([json], { type: "application/json" })
	const a = document.createElement("a")
	
	a.href = URL.createObjectURL(blob)
	a.download = "pathfile.json"
	document.body.appendChild(a)
	
	a.click()
	a.remove()
	URL.revokeObjectURL(a.href)
}

export async function loadPath(file) {
	try {
		const text = await file.text()
		const data = JSON.parse(text)
		
		if (!Array.isArray(data)) {
			throw new Error("Invalid JSON format")
		}
		setFrames(data)
	} catch (err) {
		alert("Invalid path file: " + err)
	}
}
