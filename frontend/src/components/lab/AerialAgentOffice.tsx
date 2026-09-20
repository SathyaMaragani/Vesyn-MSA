"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useRuntime } from "@/lib/runtime/RuntimeContext";
import { Agent, AgentRole } from "@/lib/runtime/types";

interface AerialAgentOfficeProps {
  isCompact?: boolean;
}

export function AerialAgentOffice({ isCompact = false }: AerialAgentOfficeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    agents,
    selectedAgentId,
    selectAgent,
    chatWithAgent,
    activeCommunication,
    currentRun,
  } = useRuntime();

  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
  const [activePreset, setActivePreset] = useState<"director" | "orchestrator" | "synthesis" | "qc" | "plan">("director");

  // Ref to hold camera transition targets
  const cameraTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
  }>({
    pos: new THREE.Vector3(18, 22, 22),
    lookAt: new THREE.Vector3(0, 1.2, 0),
  });

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // Animate camera to focus on an agent when selected
  useEffect(() => {
    if (selectedAgent) {
      const [x, y, z] = selectedAgent.workstationPos;
      cameraTargetRef.current = {
        pos: new THREE.Vector3(x + 5, 7, z + 7),
        lookAt: new THREE.Vector3(x, 1.5, z),
      };
    }
  }, [selectedAgent]);

  const setCameraPreset = (preset: "director" | "orchestrator" | "synthesis" | "qc" | "plan") => {
    setActivePreset(preset);
    if (preset === "director") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(18, 20, 22),
        lookAt: new THREE.Vector3(0, 1.2, 0),
      };
    } else if (preset === "orchestrator") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0, 8, 10),
        lookAt: new THREE.Vector3(0, 1.5, 0),
      };
    } else if (preset === "synthesis") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(9, 6, 0),
        lookAt: new THREE.Vector3(5, 1.5, -3),
      };
    } else if (preset === "qc") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0, 6, 11),
        lookAt: new THREE.Vector3(0, 1.5, 5),
      };
    } else if (preset === "plan") {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0, 28, 0.1),
        lookAt: new THREE.Vector3(0, 0, 0),
      };
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup — Studio palette matching landing page warm tones
    const scene = new THREE.Scene();
    // Warm unbleached paper tone background matching --color-beige-bg (#F4F1E6)
    scene.background = new THREE.Color(0xf2efe6);
    scene.fog = new THREE.FogExp2(0xf2efe6, 0.022);

    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 1000);
    camera.position.copy(cameraTargetRef.current.pos);
    const currentLookAt = cameraTargetRef.current.lookAt.clone();
    camera.lookAt(currentLookAt);

    // 2. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    // 3. Studio Lighting (Warm key light, sky fill, soft rim)
    const ambientLight = new THREE.AmbientLight(0xfffcf7, 1.1);
    scene.add(ambientLight);

    const keySun = new THREE.DirectionalLight(0xfff5ea, 1.6);
    keySun.position.set(16, 26, 14);
    keySun.castShadow = true;
    keySun.shadow.mapSize.width = 2048;
    keySun.shadow.mapSize.height = 2048;
    keySun.shadow.camera.near = 0.5;
    keySun.shadow.camera.far = 70;
    keySun.shadow.bias = -0.0003;
    const d = 16;
    keySun.shadow.camera.left = -d;
    keySun.shadow.camera.right = d;
    keySun.shadow.camera.top = d;
    keySun.shadow.camera.bottom = -d;
    scene.add(keySun);

    // Soft sky fill
    const fillLight = new THREE.DirectionalLight(0xdce7f0, 0.6);
    fillLight.position.set(-14, 18, -14);
    scene.add(fillLight);

    // Warm orange rim accent light
    const orangeRim = new THREE.PointLight(0xe57d25, 1.8, 25);
    orangeRim.position.set(0, 3.5, 0);
    scene.add(orangeRim);

    // 4. Architectural Pavilion Studio Floor
    // Main circular terrazzo platform
    const platformGeo = new THREE.CylinderGeometry(14, 14.4, 0.6, 64);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0xe5e1d4, // Warm stone / plaster (#E5E1D4)
      roughness: 0.85,
      metalness: 0.08,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.3;
    platform.receiveShadow = true;
    scene.add(platform);

    // Platform brass bevel ring
    const brassRingGeo = new THREE.TorusGeometry(14, 0.06, 16, 64);
    const brassRingMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.8,
      roughness: 0.3,
    });
    const brassRing = new THREE.Mesh(brassRingGeo, brassRingMat);
    brassRing.rotation.x = Math.PI / 2;
    brassRing.position.y = 0.01;
    scene.add(brassRing);

    // Architectural Drafting Grid
    const grid = new THREE.GridHelper(26, 26, 0xc4c0b3, 0xdfdad0);
    grid.position.y = 0.015;
    scene.add(grid);

    // Central Orchestrator Circular Core
    const coreRingGeo = new THREE.RingGeometry(2.4, 2.5, 48);
    const coreRingMat = new THREE.MeshBasicMaterial({ color: 0x0254ec, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const coreRing = new THREE.Mesh(coreRingGeo, coreRingMat);
    coreRing.rotation.x = -Math.PI / 2;
    coreRing.position.y = 0.02;
    scene.add(coreRing);

    // Concentric outer drafting arc
    const outerRingGeo = new THREE.RingGeometry(8.5, 8.6, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xb5b0a2, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.02;
    scene.add(outerRing);

    // 5. Build Architectural Agent Workstations
    const agentMeshes: {
      group: THREE.Group;
      agent: Agent;
      beaconMesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
      light: THREE.PointLight;
    }[] = [];

    const interactiveObjects: THREE.Object3D[] = [];

    agents.forEach((ag) => {
      const group = new THREE.Group();
      group.position.set(ag.workstationPos[0], ag.workstationPos[1], ag.workstationPos[2]);

      // Plaster Pedestal Base
      const baseGeo = new THREE.CylinderGeometry(1.25, 1.4, 0.45, 32);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0xd8d3c5,
        roughness: 0.7,
        metalness: 0.15,
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.22;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Pedestal rim ring in agent's stationery color
      const rimGeo = new THREE.TorusGeometry(1.26, 0.03, 16, 32);
      const rimMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ag.color),
        metalness: 0.6,
        roughness: 0.3,
      });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.45;
      group.add(rim);

      // Dieter Rams minimalist console desk
      const deskGeo = new THREE.BoxGeometry(1.6, 0.75, 0.85);
      const deskMat = new THREE.MeshStandardMaterial({
        color: 0x222529, // Deep charcoal matte
        roughness: 0.4,
        metalness: 0.2,
      });
      const desk = new THREE.Mesh(deskGeo, deskMat);
      desk.position.set(0, 0.75, 0.3);
      desk.castShadow = true;
      group.add(desk);

      // Warm paper-toned monitor screen
      const screenGeo = new THREE.BoxGeometry(1.15, 0.6, 0.04);
      const screenMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ag.color),
        emissive: new THREE.Color(ag.color),
        emissiveIntensity: 0.5,
        roughness: 0.3,
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(0, 1.25, 0.25);
      screen.rotation.x = -0.15;
      group.add(screen);

      // Sculptural Floating Agent Avatar
      let avatarGeo: THREE.BufferGeometry;
      if (ag.role === "ORCHESTRATOR") {
        avatarGeo = new THREE.OctahedronGeometry(0.55);
      } else if (ag.role === "RETROSYNTHESIS") {
        avatarGeo = new THREE.IcosahedronGeometry(0.5);
      } else if (ag.role === "RESEARCH") {
        avatarGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.7, 16);
      } else if (ag.role === "VALIDATION") {
        avatarGeo = new THREE.DodecahedronGeometry(0.48);
      } else if (ag.role === "CRITIC") {
        avatarGeo = new THREE.TetrahedronGeometry(0.55);
      } else {
        avatarGeo = new THREE.TorusKnotGeometry(0.3, 0.1, 48, 12);
      }

      const avatarMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ag.color),
        emissive: new THREE.Color(ag.accentColor),
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.65,
      });
      const avatar = new THREE.Mesh(avatarGeo, avatarMat);
      avatar.position.set(0, 2.05, 0);
      avatar.castShadow = true;
      group.add(avatar);

      // Orbital Holographic Ring
      const haloGeo = new THREE.TorusGeometry(0.85, 0.025, 16, 48);
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ag.accentColor),
        transparent: true,
        opacity: 0.75,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, 2.05, 0);
      halo.rotation.x = Math.PI / 3;
      group.add(halo);

      // Workstation Point Light
      const pLight = new THREE.PointLight(new THREE.Color(ag.accentColor), 1.0, 5);
      pLight.position.set(0, 2.3, 0);
      group.add(pLight);

      // Hitbox for raycasting
      const hitGeo = new THREE.CylinderGeometry(1.6, 1.6, 3.4, 16);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitGeo, hitMat);
      hitbox.position.y = 1.7;
      hitbox.userData = { agent: ag };
      group.add(hitbox);
      interactiveObjects.push(hitbox);

      scene.add(group);

      agentMeshes.push({
        group,
        agent: ag,
        beaconMesh: avatar,
        haloMesh: halo,
        light: pLight,
      });
    });

    // 6. Communication Energy Conduits
    let beamLine: THREE.Line | null = null;
    let beamParticles: THREE.Points | null = null;

    // 7. Raycasting & Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevMousePos.x;
        const deltaY = e.clientY - prevMousePos.y;

        // Spherical rotation around lookAt target
        const offset = camera.position.clone().sub(currentLookAt);
        let radius = offset.length();
        let theta = Math.atan2(offset.x, offset.z) - deltaX * 0.006;
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))) + deltaY * 0.006;
        phi = Math.max(0.25, Math.min(1.45, phi));

        camera.position.x = currentLookAt.x + radius * Math.sin(phi) * Math.sin(theta);
        camera.position.y = currentLookAt.y + radius * Math.cos(phi);
        camera.position.z = currentLookAt.z + radius * Math.sin(phi) * Math.cos(theta);
        camera.lookAt(currentLookAt);

        cameraTargetRef.current.pos.copy(camera.position);
        prevMousePos = { x: e.clientX, y: e.clientY };
      } else {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(interactiveObjects);
        if (intersects.length > 0) {
          const target = intersects[0].object.userData.agent as Agent;
          setHoveredAgent(target);
          container.style.cursor = "pointer";
        } else {
          setHoveredAgent(null);
          container.style.cursor = "grab";
        }
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveObjects);
      if (intersects.length > 0) {
        const target = intersects[0].object.userData.agent as Agent;
        selectAgent(target.id);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const offset = camera.position.clone().sub(currentLookAt);
      let radius = offset.length();
      radius = Math.max(12, Math.min(45, radius + e.deltaY * 0.025));
      offset.setLength(radius);
      camera.position.copy(currentLookAt).add(offset);
      cameraTargetRef.current.pos.copy(camera.position);
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("click", onClick);
    container.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    // 8. Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth camera interpolation toward target (cinematic easing)
      if (!isDragging) {
        camera.position.lerp(cameraTargetRef.current.pos, 0.05);
        currentLookAt.lerp(cameraTargetRef.current.lookAt, 0.05);
        camera.lookAt(currentLookAt);
      }

      // Slow architectural drafting ring rotation
      coreRing.rotation.z = elapsed * 0.06;
      outerRing.rotation.z = -elapsed * 0.03;

      // Animate agent workstations
      agentMeshes.forEach(({ agent, beaconMesh, haloMesh, light }) => {
        const liveAgent = agents.find((a) => a.id === agent.id) || agent;
        const isWorking = liveAgent.state === "WORKING" || liveAgent.state === "VALIDATING";
        const isSelected = selectedAgentId === agent.id;

        const speed = isWorking ? 3.0 : 0.8;
        beaconMesh.rotation.y = elapsed * speed;
        beaconMesh.rotation.x = Math.sin(elapsed * 1.5) * 0.15;
        beaconMesh.position.y = 2.05 + Math.sin(elapsed * (isWorking ? 4 : 2)) * (isWorking ? 0.1 : 0.05);

        haloMesh.rotation.z = elapsed * (isWorking ? 2.5 : 0.8);
        haloMesh.rotation.x = Math.PI / 3 + Math.sin(elapsed * 1.2) * 0.1;

        const mat = beaconMesh.material as THREE.MeshStandardMaterial;
        if (isWorking) {
          mat.emissiveIntensity = 0.85 + Math.sin(elapsed * 7) * 0.35;
          light.intensity = 1.8;
        } else if (isSelected) {
          mat.emissiveIntensity = 0.9;
          light.intensity = 1.5;
        } else {
          mat.emissiveIntensity = 0.3;
          light.intensity = 0.6;
        }
      });

      // Communication conduit laser
      if (activeCommunication) {
        const fromAg = agents.find((a) => a.role === activeCommunication.from);
        const toAg = agents.find((a) => a.role === activeCommunication.to);
        if (fromAg && toAg) {
          const start = new THREE.Vector3(fromAg.workstationPos[0], 2.1, fromAg.workstationPos[2]);
          const end = new THREE.Vector3(toAg.workstationPos[0], 2.1, toAg.workstationPos[2]);
          const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5).add(new THREE.Vector3(0, 2.6, 0));

          const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
          const points = curve.getPoints(30);

          if (!beamLine) {
            const beamGeo = new THREE.BufferGeometry().setFromPoints(points);
            const beamMat = new THREE.LineBasicMaterial({ color: 0xe57d25, linewidth: 3 });
            beamLine = new THREE.Line(beamGeo, beamMat);
            scene.add(beamLine);
          } else {
            beamLine.geometry.setFromPoints(points);
            beamLine.visible = true;
          }
        }
      } else if (beamLine) {
        beamLine.visible = false;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("click", onClick);
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [agents, selectedAgentId, selectAgent, activeCommunication]);

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#F2EFE6] rounded-2xl overflow-hidden border border-black/10 shadow-lg select-none flex flex-col">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full cursor-grab" />

      {/* Studio Top Control Bar (Matching Landing Page Styling) */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Studio Badge */}
        <div className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-[#E0DCCF]/90 backdrop-blur-md border border-black/10 shadow-sm flex items-center gap-2 text-ink-black">
          <span className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
          <span className="font-space text-xs uppercase tracking-wider font-bold">
            NEOCHEMS STUDIO · 3D WORKFORCE
          </span>
        </div>

        {/* Center: Camera Director Controls */}
        <div className="pointer-events-auto hidden sm:flex items-center p-1 rounded-xl bg-[#E0DCCF]/90 backdrop-blur-md border border-black/10 shadow-sm text-xs font-space">
          <button
            type="button"
            onClick={() => setCameraPreset("director")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activePreset === "director" ? "bg-ink-black text-beige-bg font-bold" : "text-ink-black/60 hover:text-ink-black"
            }`}
          >
            Director
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("orchestrator")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activePreset === "orchestrator" ? "bg-ink-black text-beige-bg font-bold" : "text-ink-black/60 hover:text-ink-black"
            }`}
          >
            Orchestrator
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("synthesis")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activePreset === "synthesis" ? "bg-ink-black text-beige-bg font-bold" : "text-ink-black/60 hover:text-ink-black"
            }`}
          >
            Synthesis Bay
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("qc")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activePreset === "qc" ? "bg-ink-black text-beige-bg font-bold" : "text-ink-black/60 hover:text-ink-black"
            }`}
          >
            Critic QC
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("plan")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activePreset === "plan" ? "bg-ink-black text-beige-bg font-bold" : "text-ink-black/60 hover:text-ink-black"
            }`}
          >
            Floor Plan
          </button>
        </div>

        {/* Right: Active Dispatch Indicator */}
        {activeCommunication && (
          <div className="pointer-events-auto px-3.5 py-1 rounded-full bg-accent-orange/15 border border-accent-orange/40 text-ink-black font-space text-xs flex items-center gap-1.5 animate-pulse">
            <span>⚡ DISPATCH:</span>
            <span className="font-bold">{activeCommunication.from}</span>
            <span>→</span>
            <span className="font-bold">{activeCommunication.to}</span>
          </div>
        )}
      </div>

      {/* Selected / Hovered Agent Interactive HUD Card at Bottom Left */}
      {(selectedAgent || hoveredAgent) && (
        <div className="absolute bottom-5 left-5 z-20 pointer-events-auto p-4 rounded-xl bg-[#F4F1E6]/95 backdrop-blur-md border border-black/15 shadow-xl max-w-sm transition-all animate-fade-in text-ink-black">
          {(() => {
            const ag = selectedAgent || hoveredAgent!;
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{ag.symbol}</span>
                    <div>
                      <h4 className="font-heading font-bold text-lg leading-tight text-ink-black">{ag.name}</h4>
                      <p className="font-space text-[10px] text-ink-black/60">{ag.tagline}</p>
                    </div>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded text-[9px] font-space uppercase font-bold"
                    style={{ backgroundColor: `${ag.color}22`, color: ag.color }}
                  >
                    {ag.state}
                  </span>
                </div>

                <p className="text-xs font-body text-ink-black/75 line-clamp-2 leading-relaxed">
                  {ag.currentTask || ag.description}
                </p>

                {/* Direct Action Buttons: Chat with Agent & What did it do? */}
                <div className="pt-2 border-t border-black/10 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => chatWithAgent(ag.role)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-accent-orange hover:bg-accent-orange/90 text-white font-space text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span>💬</span>
                    <span>Chat with {ag.name.split(" ")[0]}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectAgent(ag.id)}
                    className="py-1.5 px-3 rounded-lg bg-ink-black hover:bg-ink-black/80 text-beige-bg font-space text-xs transition-colors flex items-center gap-1 font-bold"
                    title="Inspect what this agent did"
                  >
                    <span>📋 What it did</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Quick Agent Workstation Switcher at Bottom Right */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-[#E0DCCF]/95 backdrop-blur-md border border-black/15 shadow-md">
        {agents.map((ag) => (
          <button
            key={ag.id}
            type="button"
            onClick={() => selectAgent(ag.id)}
            title={`${ag.name} — Click to inspect and chat`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${
              selectedAgentId === ag.id
                ? "bg-ink-black text-beige-bg scale-110 shadow-md ring-2 ring-accent-orange"
                : "hover:bg-black/10 text-ink-black/80"
            }`}
          >
            {ag.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
