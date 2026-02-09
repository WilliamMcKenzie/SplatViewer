import * as THREE from "three"
import * as GaussianSplats3D from "gaussian-splats-3d"
import { initControls, move } from "/scripts/controls.js"
import { initTimeline, playFrame } from "/scripts/timeline.js"

const defaultView = {
	"initialCameraPosition": [0, 0, 0],
	"initialCameraLookAt": [0, 0, 0]
}
const viewer = new GaussianSplats3D.Viewer(defaultView)

viewer.addSplatScene("/assets/world00.ply", {
	"splatAlphaRemovalThreshold": 5,
	"showLoadingUI": false,
	"progressiveLoad": false,
	"position": [0, 0, 0],
	"rotation": [0, 0, 0, 1],
	"scale": [1.5, 1.5, 1.5],
	"onProgress" : (percent) => {
		document.getElementById("download_progress").value = percent
		
		if (percent == 100) {
			document.getElementById("download_label").innerHTML = "Processing..."
		}
	}
}).then(() => {
	document.getElementById("points").innerText = `Points: ${viewer.splatRenderCount}`;
	document.getElementById("download_modal").classList.add("hidden")
	document.getElementById("sidebar").classList.remove("hidden")
	document.getElementById("timeline").classList.remove("hidden")
	viewer.renderer.setClearColor(0x1f1f1f, 1)
	
	initControls(viewer)
	initTimeline(viewer)
	animate()
})

let lastFrame = performance.now()
function animate() {
	const now = performance.now()
	const delta = (now - lastFrame) / 1000
	const fps = (1 / delta)
	lastFrame = now
	
	playFrame(viewer, delta)
	move(viewer)
    viewer.update()
    viewer.render()
    
    document.getElementById("fps").innerText = `FPS: ${Math.round(fps)}`;
    requestAnimationFrame(animate)
}

document.getElementById("reset_btn").addEventListener("click", () => {
	viewer.camera.position.set(...defaultView["initialCameraPosition"])
	viewer.camera.lookAt(...defaultView["initialCameraLookAt"])
	viewer.controls.target.set(...defaultView["initialCameraLookAt"])
	
	viewer.camera.near = 0.05
	viewer.camera.far = 2000
	viewer.camera.updateProjectionMatrix()
    viewer.controls.update()
})

document.getElementById("frame_btn").addEventListener("click", () => {
	const mesh = viewer.splatMesh
	const stride = 500
	const bounds = getSampledBounds(mesh, stride)
	fitCameraToBox(viewer, bounds.box, bounds.center, bounds.fullSphere)
})

function getSampledBounds(mesh, stride) {
	const temp = new THREE.Vector3()
	const splatCount = mesh.getSplatCount()
	const step = Math.max(1, stride)
	const min = new THREE.Vector3(Infinity, Infinity, Infinity)
	const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)

	for (let index = 0; index < splatCount; index += step) {
		mesh.getSplatCenter(index, temp, mesh.matrixWorld)
		min.min(temp)
		max.max(temp)
	}

	const box = new THREE.Box3(min, max)
	const center = new THREE.Vector3()
	box.getCenter(center)

	const fullBox = mesh.computeBoundingBox()
	const fullSphere = new THREE.Sphere()
	fullBox.getBoundingSphere(fullSphere)

	return { box, center, fullSphere }
}

function fitCameraToBox(viewer, box, center, fullSphere, padding = 1.05) {
	const corners = [
		new THREE.Vector3(box.min.x, box.min.y, box.min.z),
		new THREE.Vector3(box.min.x, box.min.y, box.max.z),
		new THREE.Vector3(box.min.x, box.max.y, box.min.z),
		new THREE.Vector3(box.min.x, box.max.y, box.max.z),
		new THREE.Vector3(box.max.x, box.min.y, box.min.z),
		new THREE.Vector3(box.max.x, box.min.y, box.max.z),
		new THREE.Vector3(box.max.x, box.max.y, box.min.z),
		new THREE.Vector3(box.max.x, box.max.y, box.max.z),
	]

	const direction = new THREE.Vector3()
		.subVectors(viewer.camera.position, viewer.controls.target)
		.normalize()
	if (direction.lengthSq() === 0) {
		direction.set(0, 0, 1)
	}

	const temp = new THREE.Vector3()
	const fitsAt = (distance) => {
		viewer.camera.position.copy(center).addScaledVector(direction, distance)
		viewer.camera.lookAt(center)
		viewer.camera.updateMatrixWorld(true)
		for (const c of corners) {
			temp.copy(c).project(viewer.camera)
			if (Math.abs(temp.x) > 1 || Math.abs(temp.y) > 1 || Math.abs(temp.z) > 1) {
				return false
			}
		}
		return true
	}

	let low = 0
	let high = Math.max(1, viewer.camera.position.distanceTo(center))
	while (!fitsAt(high) && high < 1e7) {
		high *= 1.5
	}

	for (let i = 0; i < 24; i++) {
		const mid = (low + high) * 0.5
		if (fitsAt(mid)) {
			high = mid
		} else {
			low = mid
		}
	}

	const finalDistance = high * padding
	viewer.controls.target.copy(center)
	viewer.camera.position.copy(center).addScaledVector(direction, finalDistance)
	viewer.camera.lookAt(center)

	const fullRadius = fullSphere.radius
	const centerDelta = fullSphere.center.distanceTo(center)
	const clipRadius = fullRadius + centerDelta
	viewer.camera.near = Math.max(0.01, finalDistance - clipRadius * 2)
	viewer.camera.far = finalDistance + clipRadius * 2
	viewer.camera.updateProjectionMatrix()
	viewer.controls.update()
}
