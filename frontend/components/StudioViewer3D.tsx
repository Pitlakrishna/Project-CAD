"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CadSceneResponse } from "../lib/types";
import { downloadCadFileBlob } from "../lib/api";
import { formatMass } from "../lib/physicalMaterials";
import {
  computeDynamicUvScale,
  createContactShadowTexture,
  getBrushedMetalNormalTexture,
  getConcreteNormalTexture,
  getWoodGrainNormalTexture,
} from "../lib/proceduralTextures";
import { executeThreeSceneScript } from "../lib/threeSceneRunner";

export type NavigationMode = "orbit" | "walkthrough";
export type LightingPreset = "studio" | "daylight" | "sunset" | "night";

interface StudioViewer3DProps {
  sceneData: CadSceneResponse;
  userPrompt?: string;
  onBackToChat?: () => void;
}

interface LoadedPartItem {
  id: string;
  name: string;
  mesh: THREE.Mesh;
  edgeLines?: THREE.LineSegments;
  initialPosition: THREE.Vector3;
  explodeDirection: THREE.Vector3;
  color: string;
  materialType: string;
  visible: boolean;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    const binaryString = atob(clean);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (err) {
    console.error("[StudioViewer3D] Error decoding base64 STL buffer:", err);
    return new ArrayBuffer(0);
  }
}

export function StudioViewer3D({ sceneData, userPrompt, onBackToChat }: StudioViewer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Studio UI state
  const [navMode, setNavMode] = useState<NavigationMode>("orbit");
  const [lighting, setLighting] = useState<LightingPreset>("studio");
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);
  const [isGridVisible, setIsGridVisible] = useState<boolean>(true);
  const [isEdgesVisible, setIsEdgesVisible] = useState<boolean>(true);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isPartsDrawerOpen, setIsPartsDrawerOpen] = useState<boolean>(false);
  const [walkSpeed, setWalkSpeed] = useState<number>(50); // mm per second
  const walkSpeedRef = useRef<number>(walkSpeed);

  useEffect(() => {
    walkSpeedRef.current = walkSpeed;
  }, [walkSpeed]);

  const [isSceneReady, setIsSceneReady] = useState<boolean>(false);

  // Part state for visibility and color overrides
  const [loadedParts, setLoadedParts] = useState<LoadedPartItem[]>([]);

  // Three.js internal references
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    lights: {
      ambient: THREE.AmbientLight;
      directional1: THREE.DirectionalLight;
      directional2: THREE.DirectionalLight;
      directional3: THREE.DirectionalLight;
      directional4: THREE.DirectionalLight;
      hemi: THREE.HemisphereLight;
    };
    partsGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    groundMesh: THREE.Mesh;
    contactShadow: THREE.Mesh;
    reqId: number | null;
    keysPressed: Record<string, boolean>;
    walkthroughVelocity: THREE.Vector3;
    threeSceneAnimate?: ((time: number, delta: number) => void) | null;
    threeSceneCleanup?: (() => void) | null;
  } | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene & Background (NO FOG - prevents large architectural models from getting pitch black)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f1115");

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 200000);
    camera.position.set(500, 400, 600);

    // 3. Renderer with high exposure and clean PBR illumination
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // 3.1 PBR Image-Based Environment Reflections (PMREM RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTexture;

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 100000;
    controls.minDistance = 1;

    // 5. Rich Multi-Angle Lighting Rig
    const ambient = new THREE.AmbientLight("#ffffff", 1.2);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight("#ffffff", "#475569", 1.0);
    hemi.position.set(0, 2000, 0);
    scene.add(hemi);

    // Key Light (Sun)
    const dir1 = new THREE.DirectionalLight("#ffffff", 2.2);
    dir1.position.set(3000, 4500, 3500);
    scene.add(dir1);

    // Fill Light (Opposite quadrant)
    const dir2 = new THREE.DirectionalLight("#cbd5e1", 1.5);
    dir2.position.set(-3500, 3000, -2500);
    scene.add(dir2);

    // Back / Rim Light
    const dir3 = new THREE.DirectionalLight("#94a3b8", 1.2);
    dir3.position.set(2500, 3000, -3500);
    scene.add(dir3);

    // Upward Soffit Bounce Light (illuminates ceilings, cantilevers, and overhangs)
    const dir4 = new THREE.DirectionalLight("#e2e8f0", 0.9);
    dir4.position.set(0, -2000, 2000);
    scene.add(dir4);

    // 6. Ground & Grid (set below Y = 0 to avoid z-fighting and keep grid under building foundations)
    const gridHelper = new THREE.GridHelper(10000, 50, "#334155", "#1e293b");
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    const groundGeo = new THREE.PlaneGeometry(30000, 30000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: "#0b0d11",
      roughness: 0.9,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -1.0;
    scene.add(groundMesh);

    // 6.1 Dynamic Soft Ground Contact Shadow (sized to model footprint at Y = -0.05)
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -0.05;
    scene.add(contactShadow);

    // 7. Group for all CAD parts
    const partsGroup = new THREE.Group();
    scene.add(partsGroup);

    // 8. Animation & Render loop
    const keysPressed: Record<string, boolean> = {};
    const walkthroughVelocity = new THREE.Vector3();
    let lastTime = performance.now();

    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Mode-specific navigation updates
      if (controls.enabled) {
        controls.update();
      } else {
        // First-person Walkthrough movement (WASD)
        const moveVector = new THREE.Vector3();
        if (keysPressed["KeyW"] || keysPressed["ArrowUp"]) moveVector.z -= 1;
        if (keysPressed["KeyS"] || keysPressed["ArrowDown"]) moveVector.z += 1;
        if (keysPressed["KeyA"] || keysPressed["ArrowLeft"]) moveVector.x -= 1;
        if (keysPressed["KeyD"] || keysPressed["ArrowRight"]) moveVector.x += 1;
        if (keysPressed["Space"] || keysPressed["KeyE"]) moveVector.y += 1;
        if (keysPressed["ShiftLeft"] || keysPressed["KeyQ"]) moveVector.y -= 1;

        if (moveVector.lengthSq() > 0) {
          moveVector.normalize();
          const speed = (walkSpeedRef.current || 50) * 4 * delta; // Scaled to model units
          // Move relative to camera yaw (ignore pitch for horizontal walk)
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();

          const side = new THREE.Vector3();
          side.crossVectors(camera.up, forward).normalize();

          camera.position.addScaledVector(forward, -moveVector.z * speed);
          camera.position.addScaledVector(side, -moveVector.x * speed);
          camera.position.y += moveVector.y * speed;
        }
      }

      // If a procedural Three.js scene is active, advance its animation
      if (threeRef.current?.threeSceneAnimate) {
        threeRef.current.threeSceneAnimate(time / 1000, delta);
      }

      renderer.render(scene, camera);
      threeRef.current!.reqId = requestAnimationFrame(animate);
    };

    threeRef.current = {
      renderer,
      scene,
      camera,
      controls,
      lights: { ambient, directional1: dir1, directional2: dir2, directional3: dir3, directional4: dir4, hemi },
      partsGroup,
      gridHelper,
      groundMesh,
      contactShadow,
      reqId: requestAnimationFrame(animate),
      keysPressed,
      walkthroughVelocity,
    };
    setIsSceneReady(true);

    // Keyboard handlers for walkthrough
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      setIsSceneReady(false);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
      if (threeRef.current?.reqId) {
        cancelAnimationFrame(threeRef.current.reqId);
      }
      pmremGenerator.dispose();
      envTexture.dispose();
      shadowTex.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load Scene parts (CAD STL or procedural Three.js WebGL)
  useEffect(() => {
    if (!threeRef.current || !sceneData) return;
    const { partsGroup, camera, controls } = threeRef.current;

    // Clean up any previously running procedural Three.js scene
    if (threeRef.current.threeSceneCleanup) {
      threeRef.current.threeSceneCleanup();
      threeRef.current.threeSceneCleanup = null;
      threeRef.current.threeSceneAnimate = null;
    }

    // Check if this is a procedural Three.js WebGL scene
    if (sceneData.threejs_code) {
      try {
        partsGroup.position.set(0, 0, 0);
        partsGroup.rotation.set(0, 0, 0);
        partsGroup.scale.set(1, 1, 1);

        const execution = executeThreeSceneScript(
          sceneData.threejs_code,
          partsGroup,
          camera,
          controls
        );

        threeRef.current.threeSceneAnimate = execution.animate;
        threeRef.current.threeSceneCleanup = execution.cleanup;

        const bounds = execution.bounds;
        if (!bounds.isEmpty()) {
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          bounds.getCenter(center);
          bounds.getSize(size);

          // Rest at ground level
          partsGroup.position.set(-center.x, -bounds.min.y, -center.z);
          partsGroup.updateMatrixWorld(true);

          const maxDim = Math.max(size.x, size.y, size.z, 60);
          camera.position.set(maxDim * 1.2, maxDim * 0.9, maxDim * 1.4);
          camera.lookAt(0, size.y * 0.4, 0);
          controls.target.set(0, size.y * 0.4, 0);
          controls.update();

          if (threeRef.current) {
            const { gridHelper, groundMesh, contactShadow } = threeRef.current;
            contactShadow.scale.set(size.x * 1.5, size.z * 1.5, 1);
            contactShadow.position.set(0, -0.05, 0);
            gridHelper.position.y = -0.5;
            groundMesh.position.y = -1.0;
          }
        }

        setIsSceneReady(true);
        return () => {
          if (threeRef.current?.threeSceneCleanup) {
            threeRef.current.threeSceneCleanup();
            threeRef.current.threeSceneCleanup = null;
            threeRef.current.threeSceneAnimate = null;
          }
        };
      } catch (err) {
        console.error("[StudioViewer3D] Failed to execute Three.js procedural scene:", err);
      }
    }

    if (!sceneData.parts || sceneData.parts.length === 0) return;

    // Clear existing parts and dispose nested geometries/edges
    while (partsGroup.children.length > 0) {
      const child = partsGroup.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
      child.traverse((nested) => {
        if ((nested as THREE.LineSegments).isLineSegments) {
          const lines = nested as THREE.LineSegments;
          if (lines.geometry) lines.geometry.dispose();
          if (Array.isArray(lines.material)) {
            lines.material.forEach((m) => m.dispose());
          } else if (lines.material) {
            lines.material.dispose();
          }
        }
      });
      partsGroup.remove(child);
    }

    const loader = new STLLoader();
    const createdParts: LoadedPartItem[] = [];

    // Parse all parts from base64 STL
    sceneData.parts.forEach((p, idx) => {
      if (!p.stlBase64) return;
      try {
        const arrayBuf = base64ToArrayBuffer(p.stlBase64);
        if (arrayBuf.byteLength === 0) return;
        const geom = loader.parse(arrayBuf);
        geom.computeVertexNormals();

        // Compute part bounding box to dynamically scale procedural textures (Zero-Hardcoding)
        geom.computeBoundingBox();
        const partDim = new THREE.Vector3();
        if (geom.boundingBox) {
          geom.boundingBox.getSize(partDim);
        }
        const uvScale = computeDynamicUvScale(Math.max(partDim.x, partDim.z), Math.max(partDim.y, 100), 1000);

        // Physically Based Material Factory with dynamic PBR surface textures
        let mat: THREE.Material;
        let colorHex = p.color || "#cbd5e1";
        const c = new THREE.Color(colorHex);
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        // Elevate excessively dark or black colors so architectural features and bevels are always clearly visible
        if (hsl.l < 0.22) {
          c.setHSL(hsl.h, Math.max(0.1, hsl.s * 0.7), 0.42);
          colorHex = `#${c.getHexString()}`;
        }

        const safeRoughness = Math.min(p.roughness ?? 0.35, 0.55);
        const matType = (p.material || "").toLowerCase();
        const isGlass = matType === "glass" || matType === "tinted_glass" || (p.transmission !== undefined && p.transmission > 0) || p.transparent;
        const isWood = matType === "wood" || matType === "timber" || p.name?.toLowerCase().includes("trunk") || p.name?.toLowerCase().includes("wood");
        const isConcrete = matType === "concrete" || matType === "stucco" || matType === "stone" || matType === "wall" || p.name?.toLowerCase().includes("wall") || p.name?.toLowerCase().includes("floor");
        const isMetal = matType === "metal" || matType === "aluminum" || matType === "steel" || (p.metalness !== undefined && p.metalness > 0.5);

        if (isGlass) {
          mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(colorHex),
            transmission: p.transmission ?? 0.95,
            opacity: p.opacity ?? 0.35,
            transparent: true,
            roughness: 0.04,
            metalness: 0.02,
            ior: p.ior ?? 1.52,
            reflectivity: 0.9,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
        } else if (isWood) {
          const woodNormal = getWoodGrainNormalTexture().clone();
          woodNormal.repeat.copy(uvScale);
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            normalMap: woodNormal,
            normalScale: new THREE.Vector2(0.4, 0.4),
            roughness: 0.45,
            metalness: 0.02,
            side: THREE.DoubleSide,
          });
        } else if (isConcrete) {
          const concreteNormal = getConcreteNormalTexture().clone();
          concreteNormal.repeat.copy(uvScale);
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            normalMap: concreteNormal,
            normalScale: new THREE.Vector2(0.28, 0.28),
            roughness: 0.85,
            metalness: 0.04,
            side: THREE.DoubleSide,
          });
        } else if (isMetal) {
          const metalNormal = getBrushedMetalNormalTexture().clone();
          metalNormal.repeat.copy(uvScale);
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            normalMap: metalNormal,
            normalScale: new THREE.Vector2(0.22, 0.22),
            metalness: p.metalness ?? 0.85,
            roughness: safeRoughness,
            side: THREE.DoubleSide,
          });
        } else if (matType === "ceramic" || matType === "marble") {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            roughness: 0.16,
            metalness: 0.05,
            side: THREE.DoubleSide,
          });
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            roughness: safeRoughness,
            metalness: p.metalness ?? 0.1,
            side: THREE.DoubleSide,
          });
        }

        const mesh = new THREE.Mesh(geom, mat);
        partsGroup.add(mesh);

        // Technical CAD Edge Outlines (calculated from geometry dihedral angles)
        let edgeLines: THREE.LineSegments | undefined;
        if (!isGlass) {
          const edgesGeo = new THREE.EdgesGeometry(geom, 26);
          const edgesMat = new THREE.LineBasicMaterial({
            color: "#0f172a",
            transparent: true,
            opacity: 0.42,
          });
          edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
          edgeLines.visible = isEdgesVisible;
          mesh.add(edgeLines);
        }

        const partCenter = new THREE.Vector3();
        if (geom.boundingBox) {
          geom.boundingBox.getCenter(partCenter);
        }
        const explodeDir =
          partCenter.lengthSq() > 0.001
            ? partCenter.clone().normalize()
            : new THREE.Vector3(0, 1, 0);
        if (isNaN(explodeDir.x) || isNaN(explodeDir.y) || isNaN(explodeDir.z)) {
          explodeDir.set(0, 1, 0);
        }

        createdParts.push({
          id: `part-${idx}-${p.name}`,
          name: p.name || `Part_${idx + 1}`,
          mesh,
          edgeLines,
          initialPosition: mesh.position.clone(),
          explodeDirection: explodeDir,
          color: colorHex,
          materialType: p.material || "metal",
          visible: true,
        });
      } catch (err) {
        console.error(`Failed to parse STL mesh for part ${p.name}:`, err);
      }
    });

    console.log(`[StudioViewer3D] Successfully parsed and added ${createdParts.length} parts to 3D scene.`);
    setLoadedParts(createdParts);

    // 1. Convert CAD standard coordinate system (Z-up) to WebGL/Three.js (Y-up)
    partsGroup.position.set(0, 0, 0);
    partsGroup.rotation.set(-Math.PI / 2, 0, 0);
    partsGroup.scale.set(1, 1, 1);
    partsGroup.updateMatrixWorld(true);

    // 2. Compute entire assembly bounding box & center scene in true local coordinates
    const totalBox = new THREE.Box3().setFromObject(partsGroup);
    if (!totalBox.isEmpty()) {
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      totalBox.getSize(size);
      totalBox.getCenter(center);

      // 3. Offset partsGroup so model sits cleanly on top of the ground at Y = 0 (never submerged into floor)
      // and is horizontally centered at (X = 0, Z = 0)
      partsGroup.position.set(-center.x, -totalBox.min.y, -center.z);
      partsGroup.updateMatrixWorld(true);

      // Frame camera comfortably
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.9;
      cameraDistance = Math.max(cameraDistance, 80);

      camera.position.set(cameraDistance * 0.8, cameraDistance * 0.7, cameraDistance * 1.1);
      camera.lookAt(0, size.y * 0.45, 0);
      controls.target.set(0, size.y * 0.45, 0);
      controls.update();

      // Dynamically reposition and scale lighting rig, ground, and soft contact shadow
      if (threeRef.current) {
        const { lights, gridHelper, groundMesh, contactShadow } = threeRef.current;
        lights.directional1.position.set(maxDim * 1.8, maxDim * 2.5, maxDim * 2.0);
        lights.directional2.position.set(-maxDim * 2.0, maxDim * 1.8, -maxDim * 1.5);
        lights.directional3.position.set(maxDim * 1.5, maxDim * 2.0, -maxDim * 2.2);
        lights.directional4.position.set(0, -maxDim * 0.8, maxDim * 1.0);
        lights.hemi.position.set(0, maxDim * 3.0, 0);

        const groundSize = Math.max(10000, maxDim * 8);
        gridHelper.scale.set(groundSize / 10000, 1, groundSize / 10000);
        gridHelper.position.y = -0.5;
        gridHelper.visible = isGridVisible;
        groundMesh.scale.set(groundSize / 30000, groundSize / 30000, 1);
        groundMesh.position.y = -1.0;

        // Dynamic Soft Contact Shadow (strictly proportional to model footprint)
        if (contactShadow) {
          const shadowWidth = Math.max(size.x * 1.35, 100);
          const shadowDepth = Math.max(size.z * 1.35, 100);
          contactShadow.scale.set(shadowWidth, shadowDepth, 1);
          contactShadow.position.set(0, -0.05, 0);
        }

        camera.near = Math.max(0.5, maxDim * 0.001);
        camera.far = Math.max(100000, maxDim * 30);
        camera.updateProjectionMatrix();

        controls.maxDistance = Math.max(50000, maxDim * 15);
        controls.minDistance = Math.max(1, maxDim * 0.01);
      }

      // Scale walk speed dynamically to match the building or fixture dimensions
      setWalkSpeed(Math.max(20, Math.round(maxDim * 0.8)));
    }
  }, [sceneData, isSceneReady]);

  // Handle Explode Assembly Slider
  useEffect(() => {
    if (loadedParts.length === 0) return;
    loadedParts.forEach((item) => {
      const offsetDist = explodeFactor * 60; // mm
      const offset = item.explodeDirection.clone().multiplyScalar(offsetDist);
      item.mesh.position.copy(item.initialPosition).add(offset);
    });
  }, [explodeFactor, loadedParts]);

  // Handle Wireframe Toggle
  useEffect(() => {
    loadedParts.forEach((item) => {
      const mat = item.mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => ((m as any).wireframe = isWireframe));
      } else if (mat) {
        (mat as any).wireframe = isWireframe;
      }
    });
  }, [isWireframe, loadedParts]);

  // Handle Auto-Rotate
  useEffect(() => {
    if (threeRef.current?.controls) {
      threeRef.current.controls.autoRotate = isAutoRotate;
      threeRef.current.controls.autoRotateSpeed = 2.0;
    }
  }, [isAutoRotate]);

  // Handle Ground Grid Toggle
  useEffect(() => {
    if (threeRef.current?.gridHelper) {
      threeRef.current.gridHelper.visible = isGridVisible;
    }
  }, [isGridVisible]);

  // Handle Technical CAD Edges Toggle
  useEffect(() => {
    loadedParts.forEach((item) => {
      if (item.edgeLines) {
        item.edgeLines.visible = isEdgesVisible;
      }
    });
  }, [isEdgesVisible, loadedParts]);

  // Handle Navigation Mode Change (Orbit vs Walkthrough)
  useEffect(() => {
    if (!threeRef.current) return;
    const { controls, camera } = threeRef.current;
    if (navMode === "orbit") {
      controls.enabled = true;
    } else {
      controls.enabled = false;
      // Position camera at eye height relative to model
      camera.position.y = Math.max(camera.position.y, 40);
    }
  }, [navMode]);

  // Handle Lighting Environment Presets
  useEffect(() => {
    if (!threeRef.current) return;
    const { lights, scene } = threeRef.current;

    switch (lighting) {
      case "studio":
        scene.background = new THREE.Color("#0f1115");
        lights.ambient.color.set("#ffffff");
        lights.ambient.intensity = 1.2;
        lights.hemi.color.set("#ffffff");
        lights.hemi.groundColor.set("#475569");
        lights.hemi.intensity = 1.0;
        lights.directional1.color.set("#ffffff");
        lights.directional1.intensity = 2.2;
        lights.directional2.color.set("#cbd5e1");
        lights.directional2.intensity = 1.5;
        lights.directional3.color.set("#94a3b8");
        lights.directional3.intensity = 1.2;
        lights.directional4.color.set("#e2e8f0");
        lights.directional4.intensity = 0.9;
        break;
      case "daylight":
        scene.background = new THREE.Color("#182234");
        lights.ambient.color.set("#f1f5f9");
        lights.ambient.intensity = 1.4;
        lights.hemi.color.set("#ffffff");
        lights.hemi.groundColor.set("#334155");
        lights.hemi.intensity = 1.2;
        lights.directional1.color.set("#fffbeb");
        lights.directional1.intensity = 2.6;
        lights.directional2.color.set("#93c5fd");
        lights.directional2.intensity = 1.8;
        lights.directional3.color.set("#cbd5e1");
        lights.directional3.intensity = 1.4;
        lights.directional4.color.set("#e2e8f0");
        lights.directional4.intensity = 1.0;
        break;
      case "sunset":
        scene.background = new THREE.Color("#2a1215");
        lights.ambient.color.set("#fdba74");
        lights.ambient.intensity = 1.1;
        lights.hemi.color.set("#fed7aa");
        lights.hemi.groundColor.set("#431407");
        lights.hemi.intensity = 0.9;
        lights.directional1.color.set("#f97316");
        lights.directional1.intensity = 2.8;
        lights.directional2.color.set("#a855f7");
        lights.directional2.intensity = 1.2;
        lights.directional3.color.set("#fb923c");
        lights.directional3.intensity = 1.2;
        lights.directional4.color.set("#fdba74");
        lights.directional4.intensity = 0.8;
        break;
      case "night":
        scene.background = new THREE.Color("#05070a");
        lights.ambient.color.set("#38bdf8");
        lights.ambient.intensity = 0.6;
        lights.hemi.color.set("#7dd3fc");
        lights.hemi.groundColor.set("#0f172a");
        lights.hemi.intensity = 0.6;
        lights.directional1.color.set("#0284c7");
        lights.directional1.intensity = 1.6;
        lights.directional2.color.set("#38bdf8");
        lights.directional2.intensity = 1.0;
        lights.directional3.color.set("#60a5fa");
        lights.directional3.intensity = 0.8;
        lights.directional4.color.set("#0369a1");
        lights.directional4.intensity = 0.5;
        break;
    }
  }, [lighting]);

  // Toggle Part Visibility
  const handleTogglePartVisibility = (partId: string) => {
    setLoadedParts((prev) =>
      prev.map((item) => {
        if (item.id === partId) {
          const nextVisible = !item.visible;
          item.mesh.visible = nextVisible;
          return { ...item, visible: nextVisible };
        }
        return item;
      })
    );
  };

  // 1-Click File Downloads
  const handleDownload = async (format: "step" | "stl" | "dxf") => {
    try {
      setDownloadingFormat(format);
      const blob = await downloadCadFileBlob(sceneData.modelId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `model-${sceneData.modelId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
    } finally {
      setTimeout(() => setDownloadingFormat(null), 800);
    }
  };

  // Copy shareable link
  const handleCopyShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const dim = sceneData.metrics?.boundingBox?.dimensions || { width: 0, depth: 0, height: 0 };
  const massKg = sceneData.metrics?.massKg ?? 0;
  const cost = sceneData.metrics?.estimatedCostUsd ?? 0;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f1115] select-none text-white font-sans">
      {/* 1. Full-Screen WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 2. Top Header Navigation Bar */}
      <header className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          {onBackToChat && (
            <button
              type="button"
              onClick={onBackToChat}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1c1f26]/80 hover:bg-[#282d37] backdrop-blur-md border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              <span>Back to Chat</span>
            </button>
          )}

          <div className="px-3.5 py-2 rounded-xl bg-[#1c1f26]/80 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-lg">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white tracking-wide truncate max-w-[280px]">
              {userPrompt ? userPrompt.slice(0, 42) + (userPrompt.length > 42 ? "..." : "") : "3D CAD Studio"}
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
              #{sceneData.modelId.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* Top Right: Mode Indicator & Share */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1c1f26]/80 hover:bg-[#282d37] backdrop-blur-md border border-white/10 text-xs text-zinc-300 hover:text-white transition-all shadow-lg cursor-pointer active:scale-95"
            title="Copy direct shareable link to this 3D model"
          >
            {copiedLink ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span className="text-emerald-400 font-semibold">Link Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                </svg>
                <span>Share 3D Model</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 3. Navigation & Mode Switcher HUD (Top Center) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center p-1 rounded-2xl bg-[#14171f]/85 backdrop-blur-md border border-white/10 shadow-xl pointer-events-auto">
        <button
          type="button"
          onClick={() => setNavMode("orbit")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${navMode === "orbit"
            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25"
            : "text-zinc-400 hover:text-white"
            }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>CAD 360° Orbit</span>
        </button>

        <button
          type="button"
          onClick={() => setNavMode("walkthrough")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${navMode === "walkthrough"
            ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25"
            : "text-zinc-400 hover:text-white"
            }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          <span>Walkthrough (WASD)</span>
        </button>
      </div>

      {/* 4. Floating Left Control Strip (Studio Tools) */}
      <div className="absolute left-4 top-24 flex flex-col gap-2 p-1.5 rounded-2xl bg-[#14171f]/85 backdrop-blur-md border border-white/10 shadow-xl pointer-events-auto">
        {/* Parts Hierarchy Button */}
        <button
          type="button"
          onClick={() => setIsPartsDrawerOpen(!isPartsDrawerOpen)}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${isPartsDrawerOpen ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
          title="Component hierarchy & material overrides"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
          </svg>
        </button>

        {/* Wireframe Toggle */}
        <button
          type="button"
          onClick={() => setIsWireframe(!isWireframe)}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${isWireframe ? "bg-amber-600 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
          title="Toggle B-Rep polygon wireframe"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </button>

        {/* Auto Rotate Toggle */}
        <button
          type="button"
          onClick={() => setIsAutoRotate(!isAutoRotate)}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${isAutoRotate ? "bg-sky-600 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
          title="Auto turntable rotation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
          </svg>
        </button>

        {/* Ground Grid Lines Toggle */}
        <button
          type="button"
          onClick={() => setIsGridVisible(!isGridVisible)}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${isGridVisible ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25" : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          title={isGridVisible ? "Hide ground grid lines" : "Show ground grid lines"}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 6h16.5M6 3.75v16.5M12 3.75v16.5m6-16.5v16.5" />
          </svg>
        </button>

        {/* Technical CAD Edge Outlines Toggle */}
        <button
          type="button"
          onClick={() => setIsEdgesVisible(!isEdgesVisible)}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${isEdgesVisible ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/25" : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          title={isEdgesVisible ? "Hide technical CAD edge outlines" : "Show technical CAD edge outlines"}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </button>
      </div>

      {/* 5. Parts Hierarchy Drawer (Left) */}
      {isPartsDrawerOpen && (
        <div className="absolute left-18 top-24 w-72 max-h-[calc(100vh-180px)] overflow-y-auto p-4 rounded-2xl bg-[#14171f]/95 backdrop-blur-xl border border-white/10 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
            <h4 className="text-xs font-semibold text-white tracking-wide">Assembly Parts ({loadedParts.length})</h4>
            <button
              type="button"
              onClick={() => setIsPartsDrawerOpen(false)}
              className="text-zinc-400 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Explode Assembly Slider */}
          <div className="mb-4 p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-300">
              <span className="font-medium">Exploded View</span>
              <span className="font-mono text-blue-400">{Math.round(explodeFactor * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={explodeFactor}
              onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            {loadedParts.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-md border border-white/20 shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="truncate">
                    <div className="font-medium text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-zinc-400 capitalize">{item.materialType}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleTogglePartVisibility(item.id)}
                  className={`p-1.5 rounded-lg cursor-pointer ${item.visible ? "text-zinc-300 hover:text-white" : "text-zinc-600 hover:text-zinc-400"
                    }`}
                  title={item.visible ? "Hide Part" : "Show Part"}
                >
                  {item.visible ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.775M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Walkthrough Keys Helper (Shown when in Walkthrough mode) */}
      {navMode === "walkthrough" && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-xs text-zinc-300 flex items-center gap-3 shadow-lg pointer-events-none">
          <span className="flex items-center gap-1 font-mono text-emerald-400 font-semibold">
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">W</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">A</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">S</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">D</kbd>
          </span>
          <span>Walk / Move</span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-emerald-400 font-semibold">
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">Space</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">Shift</kbd>
          </span>
          <span>Elevation</span>
        </div>
      )}

      {/* 7. Bottom Action Bar: Metrics & Export Deliverables */}
      <footer className="absolute bottom-4 left-4 right-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-[#14171f]/85 backdrop-blur-xl border border-white/10 shadow-2xl pointer-events-auto">
        {/* Physical Metrics readout */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans">Dimensions</span>
            <span className="text-zinc-200 font-semibold">
              {dim.width} × {dim.depth} × {dim.height} mm
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans">Physical Mass</span>
            <span className="text-emerald-400 font-semibold">
              {formatMass(massKg)} (${cost.toFixed(2)})
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          {/* Lighting Presets */}
          <div className="hidden md:flex items-center gap-1">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans mr-1">Light</span>
            {(["studio", "daylight", "sunset", "night"] as LightingPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setLighting(p)}
                className={`px-2 py-1 rounded-lg text-[10px] capitalize transition-all cursor-pointer ${lighting === p ? "bg-white/20 text-white font-semibold" : "text-zinc-400 hover:text-white"
                  }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 1-Click Deliverable Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleDownload("step")}
            disabled={downloadingFormat === "step"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            title="Download ISO 10303 STEP B-Rep Solid for SolidWorks, Fusion 360, Revit, and AutoCAD"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <span>{downloadingFormat === "step" ? "..." : ".STEP Solid"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("stl")}
            disabled={downloadingFormat === "stl"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-semibold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            title="Download triangulated STL mesh for Bambu Studio, PrusaSlicer, and Cura"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
            <span>{downloadingFormat === "stl" ? "..." : ".STL 3D Print"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("dxf")}
            disabled={downloadingFormat === "dxf"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            title="Download AutoCAD DXF vector drawings"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
            </svg>
            <span>{downloadingFormat === "dxf" ? "..." : ".DXF Vector"}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
