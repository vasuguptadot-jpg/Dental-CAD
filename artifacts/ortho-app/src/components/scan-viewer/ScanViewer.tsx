import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Maximize, Rotate3D, Ruler, Spline, XCircle, Focus, Loader2, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ScanViewerProps {
  fileUrl: string;
  fileType: "stl" | "obj" | "ply" | string;
  className?: string;
}

type ToolMode = "orbit" | "point" | "distance" | "angle";

export function ScanViewer({ fileUrl, fileType, className = "h-[600px] w-full" }: ScanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Three.js state refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const reqIdRef = useRef<number>(0);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ vertices: 0, faces: 0 });
  const [toolMode, setToolMode] = useState<ToolMode>("orbit");
  const [viewName, setViewName] = useState("Default");
  
  // Measurement refs
  const markersRef = useRef<THREE.Mesh[]>([]);
  const linesRef = useRef<THREE.Line[]>([]);
  const labelsRef = useRef<{div: HTMLDivElement, pos: THREE.Vector3}[]>([]);
  
  // Init scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Cleanup previous if exists
    if (rendererRef.current) {
      rendererRef.current.dispose();
      const labels = containerRef.current.querySelectorAll('.measurement-label');
      labels.forEach(l => l.remove());
    }

    setLoading(true);
    setError(null);

    const container = containerRef.current;
    const { clientWidth: width, clientHeight: height } = container;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111318); // Dark clinical theme
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 150);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1).normalize();
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    // 6. Grid
    const grid = new THREE.GridHelper(200, 40, 0x333333, 0x222222);
    grid.position.y = -50;
    scene.add(grid);

    // 7. Load Mesh
    const loadMesh = () => {
      const material = new THREE.MeshPhongMaterial({ 
        color: 0xF5F0E8, // bone/ivory color
        specular: 0x111111, 
        shininess: 30,
        flatShading: false,
        side: fileType.toLowerCase() === 'stl' ? THREE.DoubleSide : THREE.FrontSide // backface culling off for STL
      });

      const onProgress = (xhr: ProgressEvent) => {
        // Could update progress bar here
      };

      const onError = (e: ErrorEvent) => {
        console.error("Error loading mesh:", e);
        setError("Failed to load 3D model.");
        setLoading(false);
      };

      const processGeometry = (geometry: THREE.BufferGeometry) => {
        geometry.computeVertexNormals();
        geometry.center();
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Auto scale to fit
        geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere?.radius || 50;
        const scale = 50 / radius;
        mesh.scale.set(scale, scale, scale);
        
        // Fix orientation for dental (usually Z up -> Y up)
        mesh.rotation.x = -Math.PI / 2;
        
        scene.add(mesh);
        meshRef.current = mesh;

        // Set camera distance based on scale
        camera.position.set(0, 0, 150);
        controls.target.set(0, 0, 0);
        controls.update();

        // Update stats
        setStats({
          vertices: geometry.attributes.position.count,
          faces: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
        });
        
        setLoading(false);
      };

      const type = fileType.toLowerCase();
      if (type === 'stl') {
        const loader = new STLLoader();
        loader.load(fileUrl, processGeometry, onProgress, onError);
      } else if (type === 'obj') {
        const loader = new OBJLoader();
        loader.load(fileUrl, (group) => {
          let mergedGeometry = new THREE.BufferGeometry();
          // simplistic merge for OBJ
          const geometries: THREE.BufferGeometry[] = [];
          group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              geometries.push(mesh.geometry);
            }
          });
          // For simplicity, just use first geometry if not merged properly or merge them manually
          if (geometries.length > 0) {
            processGeometry(geometries[0]);
          } else {
            setError("No mesh found in OBJ file.");
            setLoading(false);
          }
        }, onProgress, onError);
      } else if (type === 'ply') {
        const loader = new PLYLoader();
        loader.load(fileUrl, processGeometry, onProgress, onError);
      } else {
        setError(`Unsupported file type: ${type}`);
        setLoading(false);
      }
    };

    loadMesh();

    // 8. Animation loop
    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      
      // Update HTML labels positions
      if (labelsRef.current.length > 0) {
        labelsRef.current.forEach(label => {
          const vector = label.pos.clone();
          vector.project(camera);
          
          const x = (vector.x * .5 + .5) * width;
          const y = (vector.y * -.5 + .5) * height;
          
          if (vector.z > 1) {
            label.div.style.display = 'none'; // behind camera
          } else {
            label.div.style.display = 'block';
            label.div.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
          }
        });
      }
    };
    animate();

    // 9. Resize handler
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(clientWidth, clientHeight);
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(reqIdRef.current);
      resizeObserver.disconnect();
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      controlsRef.current?.dispose();
    };
  }, [fileUrl, fileType]);

  // Handle Raycasting for Measurements
  useEffect(() => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current || toolMode === "orbit") return;

    const container = containerRef.current;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      
      event.preventDefault();
      
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current!);

      if (meshRef.current) {
        const intersects = raycaster.intersectObject(meshRef.current);
        
        if (intersects.length > 0) {
          const point = intersects[0].point;
          
          // Add marker
          const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
          const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
          const sphere = new THREE.Mesh(sphereGeo, sphereMat);
          sphere.position.copy(point);
          sceneRef.current!.add(sphere);
          markersRef.current.push(sphere);

          // Logic based on mode
          if (toolMode === "distance" && markersRef.current.length % 2 === 0) {
            const p1 = markersRef.current[markersRef.current.length - 2].position;
            const p2 = markersRef.current[markersRef.current.length - 1].position;
            
            // Draw line
            const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffaa, linewidth: 2 });
            const line = new THREE.Line(lineGeo, lineMat);
            sceneRef.current!.add(line);
            linesRef.current.push(line);
            
            // Add label
            const distance = p1.distanceTo(p2).toFixed(2);
            const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            
            const div = document.createElement('div');
            div.className = 'measurement-label absolute text-xs font-mono bg-black/80 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 pointer-events-none whitespace-nowrap z-10';
            div.textContent = `${distance} mm`;
            container.appendChild(div);
            
            labelsRef.current.push({ div, pos: midPoint });
          } 
          else if (toolMode === "angle" && markersRef.current.length % 3 === 0) {
            const p1 = markersRef.current[markersRef.current.length - 3].position;
            const p2 = markersRef.current[markersRef.current.length - 2].position; // vertex
            const p3 = markersRef.current[markersRef.current.length - 1].position;
            
            // Draw lines
            const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffaa, linewidth: 2 });
            const line = new THREE.Line(lineGeo, lineMat);
            sceneRef.current!.add(line);
            linesRef.current.push(line);
            
            // Calculate angle
            const v1 = new THREE.Vector3().subVectors(p1, p2).normalize();
            const v2 = new THREE.Vector3().subVectors(p3, p2).normalize();
            const angleRad = v1.angleTo(v2);
            const angleDeg = THREE.MathUtils.radToDeg(angleRad).toFixed(1);
            
            // Add label at vertex
            const div = document.createElement('div');
            div.className = 'measurement-label absolute text-xs font-mono bg-black/80 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 pointer-events-none whitespace-nowrap z-10';
            div.textContent = `${angleDeg}°`;
            // Offset slightly from vertex
            const offsetPos = p2.clone().add(new THREE.Vector3(0, 2, 0));
            container.appendChild(div);
            
            labelsRef.current.push({ div, pos: offsetPos });
          }
        }
      }
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [toolMode]);

  const clearMeasurements = () => {
    if (!sceneRef.current || !containerRef.current) return;
    
    markersRef.current.forEach(m => sceneRef.current!.remove(m));
    linesRef.current.forEach(l => sceneRef.current!.remove(l));
    labelsRef.current.forEach(l => l.div.remove());
    
    markersRef.current = [];
    linesRef.current = [];
    labelsRef.current = [];
  };

  const setPresetView = (preset: "upper" | "lower" | "front" | "left" | "right") => {
    if (!cameraRef.current || !controlsRef.current) return;
    const c = cameraRef.current;
    const ctrl = controlsRef.current;
    const dist = 150;
    
    switch (preset) {
      case "upper":
        c.position.set(0, -dist, 0); c.up.set(0, 0, 1); setViewName("Upper Jaw"); break;
      case "lower":
        c.position.set(0, dist, 0); c.up.set(0, 0, -1); setViewName("Lower Jaw"); break;
      case "front":
        c.position.set(0, 0, dist); c.up.set(0, 1, 0); setViewName("Occlusion"); break;
      case "left":
        c.position.set(-dist, 0, 0); c.up.set(0, 1, 0); setViewName("Lateral Left"); break;
      case "right":
        c.position.set(dist, 0, 0); c.up.set(0, 1, 0); setViewName("Lateral Right"); break;
    }
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  const resetView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(0, 0, 150);
    cameraRef.current.up.set(0, 1, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    setViewName("Default");
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative overflow-hidden bg-[#111318] rounded-xl ${className}`}
      data-testid="container-scan-viewer"
    >
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#111318]/80 backdrop-blur-sm text-white">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm font-medium animate-pulse">Loading 3D Model...</p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#111318] text-white">
          <XCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="font-medium mb-4">{error}</p>
          <Button variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {/* Top Left: Tools */}
      <div className="absolute top-4 left-4 z-20 flex gap-2">
        <TooltipProvider delayDuration={300}>
          <div className="bg-black/40 backdrop-blur border border-white/10 rounded-md p-1 flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 text-white hover:bg-white/20 hover:text-white ${toolMode === "orbit" ? "bg-primary/40 text-primary-100" : ""}`}
                  onClick={() => setToolMode("orbit")}
                >
                  <Rotate3D className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Rotate / Pan</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 text-white hover:bg-white/20 hover:text-white ${toolMode === "point" ? "bg-primary/40 text-primary-100" : ""}`}
                  onClick={() => setToolMode("point")}
                >
                  <MousePointer2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Drop Marker</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 text-white hover:bg-white/20 hover:text-white ${toolMode === "distance" ? "bg-primary/40 text-primary-100" : ""}`}
                  onClick={() => setToolMode("distance")}
                >
                  <Ruler className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Distance (2 points)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 text-white hover:bg-white/20 hover:text-white ${toolMode === "angle" ? "bg-primary/40 text-primary-100" : ""}`}
                  onClick={() => setToolMode("angle")}
                >
                  <Spline className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Angle (3 points)</TooltipContent>
            </Tooltip>

            <div className="w-px h-8 bg-white/20 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                  onClick={clearMeasurements}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Clear Measurements</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Top Right: View Presets */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <div className="bg-black/40 backdrop-blur border border-white/10 rounded-md p-1 flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-white hover:bg-white/20" onClick={() => setPresetView("upper")}>Upper</Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-white hover:bg-white/20" onClick={() => setPresetView("lower")}>Lower</Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-white hover:bg-white/20" onClick={() => setPresetView("front")}>Front</Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-white hover:bg-white/20" onClick={() => setPresetView("left")}>L</Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-white hover:bg-white/20" onClick={() => setPresetView("right")}>R</Button>
        </div>
      </div>

      {/* Bottom Left: Stats Overlay */}
      <div className="absolute bottom-4 left-4 z-20 text-xs text-white/70 font-mono pointer-events-none">
        <div className="bg-black/40 backdrop-blur border border-white/10 rounded-md p-3 space-y-1.5">
          <div className="flex gap-4">
            <span className="opacity-60 w-16">Vertices:</span> 
            <span className="text-white font-medium">{stats.vertices.toLocaleString()}</span>
          </div>
          <div className="flex gap-4">
            <span className="opacity-60 w-16">Faces:</span> 
            <span className="text-white font-medium">{stats.faces.toLocaleString()}</span>
          </div>
          <div className="flex gap-4">
            <span className="opacity-60 w-16">Format:</span> 
            <span className="text-white font-medium uppercase">{fileType}</span>
          </div>
          <div className="h-px bg-white/10 my-1" />
          <div className="flex gap-4">
            <span className="opacity-60 w-16">Tool:</span> 
            <span className="text-emerald-400 font-medium capitalize">{toolMode}</span>
          </div>
          <div className="flex gap-4">
            <span className="opacity-60 w-16">View:</span> 
            <span className="text-white font-medium">{viewName}</span>
          </div>
        </div>
      </div>

      {/* Bottom Right: Actions */}
      <div className="absolute bottom-4 right-4 z-20 flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20"
                onClick={resetView}
              >
                <Focus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Reset Camera</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20"
                onClick={toggleFullscreen}
              >
                <Maximize className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Fullscreen</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
