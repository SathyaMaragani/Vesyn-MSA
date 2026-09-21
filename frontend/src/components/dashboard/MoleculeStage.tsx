"use client";

// The hero's molecule: the REAL target (the bond graph of the SMILES the backend resolved), held in soft light and
// turning slowly. It is one small, self-contained WebGL stage (the dashboard is a 2D interface with a molecule in
// it, not a scene). Drag to turn it. With no SMILES the stage is empty and says nothing: the page carries the
// empty state.
import React, { useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createMoleculeMesh, type MoleculeMesh } from "@/components/world/moleculeMesh";
import { useThreeStage } from "@/components/world/useThreeStage";
import { getMolecule } from "@/lib/chem/molecule";

export function MoleculeStage({ smiles, className }: { smiles: string | null; className?: string }) {
  const latest = useRef(smiles);
  latest.current = smiles;
  const drag = useRef({ down: false, x: 0, y: 0, vy: 0, vx: 0 });

  const { containerRef, failed } = useThreeStage({
    background: 0x141512,
    fogDensity: 0,
    fov: 30,
    transparent: true,
    maxPixelRatio: 2,
    setup: ({ renderer, scene, camera }) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.55;
      const key = new THREE.DirectionalLight(0xffe2b8, 2.4);
      key.position.set(-4, 6, 5);
      const rim = new THREE.DirectionalLight(0x9fbfae, 1.1);
      rim.position.set(5, -2, -4);
      scene.add(new THREE.HemisphereLight(0xc4c6ba, 0x24251f, 0.55), key, rim);
      camera.position.set(0, 0.4, 13);
      camera.lookAt(0, 0, 0);
      return () => {
        envRT.dispose();
        pmrem.dispose();
      };
    },
    frame: ({ scene }, t, dt) => {
      let holder = scene.getObjectByName("mol-holder") as THREE.Group | undefined;
      if (!holder) {
        holder = new THREE.Group();
        holder.name = "mol-holder";
        scene.add(holder);
      }
      const want = latest.current ?? "";
      if (holder.userData.key !== want) {
        holder.userData.key = want;
        const old = holder.userData.mesh as MoleculeMesh | undefined;
        if (old) {
          holder.remove(old.group);
          old.dispose();
          holder.userData.mesh = undefined;
        }
        const res = want ? getMolecule(want) : null;
        if (res?.ok) {
          const mesh = createMoleculeMesh(res.molecule);
          // fit the molecule to the stage whatever its size
          mesh.group.scale.setScalar(THREE.MathUtils.clamp(3.1 / Math.max(res.molecule.radius, 0.8), 0.35, 2.6));
          holder.add(mesh.group);
          holder.userData.mesh = mesh;
        }
      }
      const d = drag.current;
      if (!d.down) {
        d.vy *= Math.pow(0.04, dt); // inertia
        d.vx *= Math.pow(0.04, dt);
      }
      holder.rotation.y += dt * (0.22 + d.vy);
      holder.rotation.x = THREE.MathUtils.clamp(holder.rotation.x + dt * d.vx, -0.9, 0.9);
      holder.position.y = Math.sin(t * 0.6) * 0.08;
    },
  });

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: "none", cursor: "grab" }}
      onPointerDown={(e) => {
        drag.current = { ...drag.current, down: true, x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.down) return;
        d.vy = ((e.clientX - d.x) / 140) * 2;
        d.vx = ((e.clientY - d.y) / 140) * 2;
        d.x = e.clientX;
        d.y = e.clientY;
      }}
      onPointerUp={() => (drag.current.down = false)}
      onPointerCancel={() => (drag.current.down = false)}
      aria-label={smiles ? `Target molecule ${smiles}, rotating` : "No target molecule"}
      role="img"
    >
      {failed && <div className="absolute inset-0 flex items-center justify-center font-data text-[11px] text-nc-lo">WebGL unavailable — the structure is drawn on the Chemistry page</div>}
    </div>
  );
}
