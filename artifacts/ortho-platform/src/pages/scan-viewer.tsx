import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { STLLoader, OBJLoader, PLYLoader } from "three-stdlib";
import { useGetScan, getGetScanQueryKey } from "@workspace/api-client-react";
import { getCachedGeometry, cacheGeometry } from "@/lib/geometry-cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Maximize, Ruler, RotateCcw, Box } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ScanViewer() {
  const [, params] = useRoute("/scan-viewer/:scanId");
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;
  
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  
  // Three.js refs to access them outside useEffect
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  const { data: scanData } = useGetScan(scanId, {
    query: { enabled: !!scanId, queryKey: getGetScanQueryKey(scanId) }
  });

  useEffect(() => {
    if (!scanData || !mountRef.current) return;
    
    let animationFrameId: number;
    
    // 1. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a0a0f"); // Clinical dark background
    sceneRef.current = scene;

    // 2. Setup Camera
    const camera = new THREE.PerspectiveCamera(
      45, 
      mountRef.current.clientWidth / mountRef.current.clientHeight, 
      0.1, 
      1000
    );
    camera.position.set(0, 0, 150);
    cameraRef.current = camera;

    // 3. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Setup Lighting (Professional medical lighting setup)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-1, -1, -1);
    scene.add(dirLight2);
    
    const spotLight = new THREE.SpotLight(0xffffff, 1);
    spotLight.position.set(0, 50, 0);
    spotLight.angle = Math.PI / 4;
    scene.add(spotLight);

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // 6. Handle Resize
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // 7. Load Model
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x8ecfff, // Dental blue tint
      specular: 0x111111, 
      shininess: 30,
      flatShading: false,
      side: THREE.DoubleSide
    });

    const loadModel = async () => {
      try {
        setLoading(true);
        let geometry: THREE.BufferGeometry | null = null;

        // Try geometry cache first
        const cacheKey = `scan-${scanId}-${scanData.fileType}`;
        const cached = await getCachedGeometry(cacheKey);

        if (cached) {
          geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(cached.positions, 3));
          if (cached.normals) geometry.setAttribute("normal", new THREE.BufferAttribute(cached.normals, 3));
          if (cached.indices) geometry.setIndex(new THREE.BufferAttribute(cached.indices, 1));
        } else {
          // Fetch raw file
          const response = await fetch(`/api/scans/${scanId}/file`, { credentials: "include" });
          if (!response.ok) throw new Error("Failed to download scan file");
          
          const arrayBuffer = await response.arrayBuffer();
          
          if (scanData.fileType === "stl") {
            const loader = new STLLoader();
            geometry = loader.parse(arrayBuffer);
          } else if (scanData.fileType === "obj") {
            const loader = new OBJLoader();
            const textDecoder = new TextDecoder("utf-8");
            const text = textDecoder.decode(arrayBuffer);
            const group = loader.parse(text);
            group.traverse((child) => {
              if (child instanceof THREE.Mesh && !geometry) {
                geometry = child.geometry;
              }
            });
          } else if (scanData.fileType === "ply") {
            const loader = new PLYLoader();
            geometry = loader.parse(arrayBuffer);
          }

          // Cache after successful parse
          if (geometry) {
            const pos = (geometry.attributes.position?.array as Float32Array)?.slice();
            const nor = (geometry.attributes.normal?.array as Float32Array | undefined)?.slice();
            const idx = geometry.index ? (geometry.index.array as Uint32Array)?.slice() : undefined;
            if (pos) cacheGeometry(cacheKey, pos, nor, idx);
          }
        }

        if (geometry) {
          geometry.computeVertexNormals();
          geometry.center();
          
          const mesh = new THREE.Mesh(geometry, material);
          meshRef.current = mesh;
          scene.add(mesh);

          // LOD: adjust drawRange based on camera distance
          const totalCount = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0) * 3;
          controls.addEventListener("change", () => {
            const dist = camera.position.length();
            const sphere = geometry!.boundingSphere?.radius ?? 50;
            const lodRatio = dist > sphere * 10 ? 0.25 : dist > sphere * 5 ? 0.5 : dist > sphere * 2.5 ? 0.75 : 1.0;
            geometry!.setDrawRange(0, Math.floor(totalCount * lodRatio));
          });

          // Auto-fit camera
          geometry.computeBoundingSphere();
          const radius = geometry.boundingSphere?.radius || 50;
          camera.position.z = radius * 2.5;
          controls.target.set(0, 0, 0);
          controls.update();
        } else {
          throw new Error("Could not parse geometry from file");
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load model");
      } finally {
        setLoading(false);
      }
    };

    loadModel();

    // 8. Render Loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.innerHTML = "";
      }
      renderer.dispose();
      if (meshRef.current) meshRef.current.geometry.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanData, scanId]);

  // Toggle Wireframe
  useEffect(() => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshPhongMaterial).wireframe = wireframe;
    }
  }, [wireframe]);

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current && meshRef.current) {
      const geometry = meshRef.current.geometry;
      const radius = geometry.boundingSphere?.radius || 50;
      cameraRef.current.position.set(0, 0, radius * 2.5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0f] text-zinc-100 overflow-hidden" style={{ cursor: measureMode ? 'crosshair' : 'default' }}>
      {/* Header Bar */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <Link href={scanData?.caseId ? `/cases/${scanData.caseId}` : "/cases"}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-cyan-500" />
            <span className="font-medium text-sm">3D Workspace</span>
            {scanData && (
              <>
                <span className="text-zinc-600">/</span>
                <span className="text-sm text-zinc-400">{scanData.originalName || scanData.fileName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {scanData && (
            <Tabs defaultValue={scanData.jawType} className="mr-4">
              <TabsList className="h-8 bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="upper" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400">Upper</TabsTrigger>
                <TabsTrigger value="lower" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400">Lower</TabsTrigger>
                <TabsTrigger value="both" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400">Both</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-8 gap-2 text-xs ${measureMode ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            onClick={() => setMeasureMode(!measureMode)}
          >
            <Ruler className="h-3.5 w-3.5" />
            Measure
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-8 gap-2 text-xs ${wireframe ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            onClick={() => setWireframe(!wireframe)}
          >
            <Box className="h-3.5 w-3.5" />
            Wireframe
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800" onClick={handleResetView} title="Reset View">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800" onClick={toggleFullscreen} title="Fullscreen">
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex">
        {/* Loading/Error Overlays */}
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0f]/80 backdrop-blur-sm">
            <Loader2 className="h-10 w-10 animate-spin text-cyan-500 mb-4" />
            <p className="text-zinc-300 font-medium">Loading precise 3D model...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0f]/90">
            <div className="bg-red-500/10 text-red-400 p-4 rounded-lg border border-red-500/20 text-center max-w-md">
              <p className="font-medium mb-1">Failed to load geometry</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* Three.js Mount Point */}
        <div ref={mountRef} className="w-full h-full outline-none" />

        {/* Floating Stats Panel */}
        {scanData && !loading && !error && (
          <div className="absolute bottom-6 left-6 bg-zinc-950/80 backdrop-blur-md border border-zinc-800/50 rounded-lg p-4 shadow-2xl pointer-events-none">
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between gap-8">
                <span className="text-zinc-500">File Type</span>
                <span className="font-mono text-cyan-400 uppercase">{scanData.fileType}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-zinc-500">File Size</span>
                <span className="font-mono text-zinc-300">{(scanData.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-zinc-500">Render</span>
                <span className="font-mono text-zinc-300">WebGL 2.0</span>
              </div>
              <div className="flex justify-between gap-8 mt-2 pt-2 border-t border-zinc-800">
                <span className="text-zinc-500">Scale</span>
                <span className="font-mono text-zinc-300">1:1 mm</span>
              </div>
            </div>
          </div>
        )}
        
        {measureMode && !loading && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-full text-xs font-medium backdrop-blur-md pointer-events-none flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Ruler className="h-3.5 w-3.5" />
            Measurement mode active (Visual only)
          </div>
        )}
      </div>
    </div>
  );
}
