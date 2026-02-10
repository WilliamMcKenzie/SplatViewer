import * as THREE from "three"

const speed = 0.2
const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const sensitivity = 0.002

let yaw = 0
let pitch = 0
let walking = false
let locked = false

const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
}

export function initControls(viewer) {
    const canvas = viewer.renderer.domElement
    const walkButton = document.getElementById("first_person_btn")
    
    // Prevent default pointer events
    const stopWalk = (e) => {
        if (walking) {
            e.stopImmediatePropagation()
            toggleWalking()
        }
    }
	canvas.addEventListener("pointerdown", stopWalk, { capture: true })
    canvas.addEventListener("mousedown", stopWalk, { capture: true })
    document.addEventListener("pointerlockchange", (e) => {
		if (document.pointerLockElement === null) {
			stopWalk(e)
		}
	})
    
	function toggleWalking() {
		if (walking) {
			document.exitPointerLock()
			walkButton.classList.remove("selected")
		}
		else {
			canvas.requestPointerLock()
			walkButton.classList.add("selected")
			
			const euler = new THREE.Euler().setFromQuaternion(viewer.camera.quaternion, 'YXZ')
            yaw = euler.y
            pitch = euler.x
		}
		
        walking = !walking
        viewer.controls.enabled = !walking
    }
    
    document.addEventListener("keydown", (e) => { keys[e.key] = true })
    document.addEventListener("keyup", (e) => { keys[e.key] = false })
    
    document.addEventListener("mousemove", (e) => {
        if (walking) {
            yaw -= e.movementX * sensitivity
            pitch -= e.movementY * sensitivity
            pitch = Math.min(0.8, pitch)
            pitch = Math.max(-0.8, pitch)
            
            const halfPi = Math.PI / 2
            pitch = Math.max(-halfPi, Math.min(halfPi, pitch))
            
            const euler = new THREE.Euler(pitch, yaw, 0, "YXZ")
            viewer.camera.quaternion.setFromEuler(euler)
        }
    })
    walkButton.addEventListener("click", toggleWalking)
}

export function move(viewer) {
    if (!walking) return

    viewer.camera.getWorldDirection(forward)
    forward.normalize()
    
    right.crossVectors(forward, viewer.camera.up).normalize()

    if (keys.w) viewer.camera.position.addScaledVector(forward, speed)
    if (keys.s) viewer.camera.position.addScaledVector(forward, -speed)
    if (keys.d) viewer.camera.position.addScaledVector(right, speed)
    if (keys.a) viewer.camera.position.addScaledVector(right, -speed)
    viewer.camera.position.y = 0
	
    viewer.controls.target.copy(viewer.camera.position).add(forward)
}
