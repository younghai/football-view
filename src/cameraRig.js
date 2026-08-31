import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { CAMERA_HOME } from './config.js';

// Camera rig: orbit flight around the bowl, GSAP camera flights between
// viewpoints, and a first-person "look around" mode pinned to a seat.

export function createRig(camera, dom, reducedMotion) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 18;
  controls.maxDistance = 460;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = 1.52;
  controls.zoomSpeed = 0.9;

  const rig = { mode: 'orbit', flight: null, reduced: reducedMotion };

  const homeTarget = new THREE.Vector3(...CAMERA_HOME.target);
  applySpherical(CAMERA_HOME.radius, CAMERA_HOME.phi, CAMERA_HOME.theta);
  controls.target.copy(homeTarget);
  controls.update();

  function applySpherical(radius, phi, theta) {
    camera.position.setFromSphericalCoords(radius, phi, theta).add(homeTarget);
    camera.lookAt(homeTarget);
  }

  function killFlight() {
    if (rig.flight) {
      rig.flight.kill();
      rig.flight = null;
    }
  }

  // Smooth flight between two position+quaternion pairs.
  function flyTo(pos, quat, dur = 1.7, ease = 'power2.inOut', onDone) {
    killFlight();
    if (rig.reduced || dur <= 0) {
      camera.position.copy(pos);
      camera.quaternion.copy(quat);
      if (rig.mode !== 'seat') controls.update();
      if (onDone) onDone();
      return;
    }
    controls.enabled = false;
    const p0 = camera.position.clone();
    const q0 = camera.quaternion.clone();
    const proxy = { t: 0 };
    rig.flight = gsap.to(proxy, {
      t: 1,
      duration: dur,
      ease,
      onUpdate() {
        camera.position.lerpVectors(p0, pos, proxy.t);
        camera.quaternion.slerpQuaternions(q0, quat, proxy.t);
      },
      onComplete() {
        rig.flight = null;
        controls.enabled = true;
        controls.target.copy(homeTarget);
        controls.update();
        if (onDone) onDone();
      },
    });
  }

  function overview(onDone) {
    rig.mode = 'orbit';
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = 1.52;
    controls.zoomSpeed = 0.9;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    const p = new THREE.Vector3()
      .setFromSphericalCoords(CAMERA_HOME.radius, CAMERA_HOME.phi, CAMERA_HOME.theta)
      .add(homeTarget);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(p, homeTarget, new THREE.Vector3(0, 1, 0)),
    );
    controls.minDistance = 18;
    controls.maxDistance = 460;
    flyTo(p, q, 1.6, 'power2.inOut', onDone);
  }

  // Fly to a spectator POV. Eye sits ~1.2 m above the seat, looking at the
  // centre spot with a tiny per-seat tilt so every view feels individual.
  // Look-around in seat mode is handled by the rig itself (yaw/pitch drag),
  // because OrbitControls always aims the camera AT its target, which is
  // degenerate when the camera sits at the target.
  const seatLook = { yaw: 0, pitch: 0, active: false, lastXY: null };

  function enterSeat(seat, onDone) {
    rig.mode = 'seat';
    const eye = new THREE.Vector3(seat.x, seat.y + 1.2, seat.z);
    // nudge forward along the inward normal so the head isn't inside the seat back
    eye.x += -Math.sin(seat.yaw) * 0.22;
    eye.z += -Math.cos(seat.yaw) * 0.22;

    const look = new THREE.Vector3(0, 2.5, 0);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(eye, look, new THREE.Vector3(0, 1, 0)),
    );
    flyTo(eye, q, 1.9, 'power3.inOut', () => {
      controls.enabled = false;
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      seatLook.yaw = e.y;
      seatLook.pitch = e.x;
      seatLook.active = true;
      if (onDone) onDone();
    });
    rig.seat = seat;
  }

  function seatLookDelta(dx, dy) {
    if (!seatLook.active) return;
    seatLook.yaw -= dx * 0.0031;
    seatLook.pitch = THREE.MathUtils.clamp(seatLook.pitch - dy * 0.0031, -1.3, 1.3);
    camera.quaternion.setFromEuler(new THREE.Euler(seatLook.pitch, seatLook.yaw, 0, 'YXZ'));
  }

  function seatZoom(dir) {
    if (!seatLook.active) return;
    camera.fov = THREE.MathUtils.clamp(camera.fov - dir * 4, 34, 72);
    camera.updateProjectionMatrix();
  }

  function exitSeat(onDone) {
    seatLook.active = false;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    controls.enabled = true;
    controls.zoomSpeed = 0.9;
    overview(onDone);
  }

  function zoomStep(dir) {
    killFlight();
    const offset = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(
      offset.length() * (dir > 0 ? 0.78 : 1.28),
      controls.minDistance,
      controls.maxDistance,
    );
    offset.setLength(len);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function setMode2D(is2d, onDone) {
    killFlight();
    seatLook.active = false;
    if (is2d) {
      rig.mode = 'top';
      const p = new THREE.Vector3(0, 268, 0.001);
      const q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(p, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)),
      );
      controls.maxPolarAngle = Math.PI;
      flyTo(p, q, 1.4, 'power2.inOut', () => {
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = 0.06;
        controls.update();
        if (onDone) onDone();
      });
    } else {
      controls.minPolarAngle = 0.08;
      controls.maxPolarAngle = 1.52;
      overview(onDone);
    }
  }

  // seat-mode look-around: drag rotates the view, wheel zooms the lens
  dom.addEventListener('pointerdown', (ev) => {
    if (seatLook.active) seatLook.lastXY = [ev.clientX, ev.clientY];
  });
  dom.addEventListener('pointermove', (ev) => {
    if (!seatLook.active || !seatLook.lastXY || !(ev.buttons & 1)) return;
    seatLookDelta(ev.clientX - seatLook.lastXY[0], ev.clientY - seatLook.lastXY[1]);
    seatLook.lastXY = [ev.clientX, ev.clientY];
  });
  dom.addEventListener('pointerup', () => {
    seatLook.lastXY = null;
  });
  dom.addEventListener(
    'wheel',
    (ev) => {
      if (seatLook.active) {
        ev.preventDefault();
        seatZoom(ev.deltaY < 0 ? 1 : -1);
      }
    },
    { passive: false },
  );

  return {
    controls,
    rig,
    flyTo,
    overview,
    enterSeat,
    exitSeat,
    zoomStep,
    setMode2D,
    homeTarget,
    seatLookDelta,
    seatZoom,
  };
}
