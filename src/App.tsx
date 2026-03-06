import React, { useEffect, useRef, useState } from 'react';
import { ParticleSystem } from '@/lib/ParticleSystem';
import { HandTracker } from '@/lib/HandTracker';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { Upload, Maximize, Minimize, Camera, Palette, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const handTrackerRef = useRef<HandTracker | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [color, setColor] = useState('#00ffff');
  const [cameraActive, setCameraActive] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Initialize Particle System
  useEffect(() => {
    if (containerRef.current && !particleSystemRef.current) {
      particleSystemRef.current = new ParticleSystem(containerRef.current);
    }
    return () => {
      particleSystemRef.current?.dispose();
      particleSystemRef.current = null;
    };
  }, []);

  // Initialize Hand Tracking
  useEffect(() => {
    const initTracking = async () => {
      if (!videoRef.current) return;

      try {
        const tracker = new HandTracker(videoRef.current, (result: HandLandmarkerResult) => {
          processGestures(result);
        });
        await tracker.initialize();
        handTrackerRef.current = tracker;
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to init hand tracking:", error);
        setIsLoading(false);
      }
    };

    initTracking();
  }, []);

  const processGestures = (result: HandLandmarkerResult) => {
    if (!particleSystemRef.current) return;

    const landmarks = result.landmarks;
    
    // Default state (idle)
    let scale = 1;
    let diffusion = 0;
    let info = "No hands detected";

    if (landmarks.length === 1) {
      // One hand: Pinch to scale
      const hand = landmarks[0];
      const thumbTip = hand[4];
      const indexTip = hand[8];
      
      // Distance between thumb and index
      const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      
      // Map distance (approx 0.02 to 0.2) to scale (0.5 to 2.0)
      // Normalized roughly
      scale = 0.5 + (distance * 10); 
      scale = Math.max(0.2, Math.min(scale, 3.0));
      
      info = `One Hand: Pinch Scale ${(scale).toFixed(2)}`;

    } else if (landmarks.length === 2) {
      // Two hands: Distance between wrists/palms controls diffusion/spread
      const hand1 = landmarks[0][0]; // Wrist
      const hand2 = landmarks[1][0]; // Wrist
      
      const distance = Math.hypot(hand1.x - hand2.x, hand1.y - hand2.y);
      
      // Map distance (0.1 to 0.8) to diffusion (0 to 1)
      // If hands are far apart -> Diffuse/Explode
      // If hands are close -> Condense
      
      if (distance > 0.5) {
        diffusion = (distance - 0.5) * 2; // 0 to 1 approx
        scale = 1 + diffusion; // Also scale up slightly
        info = `Two Hands: Spread/Diffuse ${(diffusion).toFixed(2)}`;
      } else {
        diffusion = 0;
        // Maybe scale down if very close
        scale = 0.5 + distance;
        info = `Two Hands: Condense`;
      }
    }

    setDebugInfo(info);
    particleSystemRef.current.updateInteraction(scale, diffusion);
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      handTrackerRef.current?.stop();
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          handTrackerRef.current?.start();
          setCameraActive(true);
        }
      } catch (err) {
        console.error("Camera error:", err);
        alert("Could not access camera.");
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize if too big to maintain performance
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w *= ratio;
          h *= ratio;
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        
        particleSystemRef.current?.updateFromImage(imageData);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setColor(e.target.value);
    particleSystemRef.current?.setColor(e.target.value);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      {/* 3D Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Video Feed (Visible for feedback) */}
      <div className={cn(
        "absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border border-white/20 transition-opacity duration-500",
        cameraActive ? "opacity-100" : "opacity-0"
      )}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-cover transform scale-x-[-1]" // Mirror the video
          playsInline 
          muted 
        />
      </div>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600">
              Gesture Particles
            </h1>
            <p className="text-white/50 text-sm mt-1 max-w-xs">
              Upload an image. Use your hands to control the particles.
            </p>
            {cameraActive && (
               <div className="mt-2 text-xs font-mono text-cyan-400 bg-black/50 px-2 py-1 rounded border border-cyan-900/50 inline-block">
                 {debugInfo || "Waiting for hands..."}
               </div>
            )}
          </div>

          <div className="flex gap-2">
            <button 
              onClick={toggleFullscreen}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all border border-white/10"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-cyan-400" size={48} />
              <p className="text-white/70">Initializing Vision Models...</p>
            </div>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-4 bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/10 max-w-2xl mx-auto mb-4 shadow-2xl shadow-cyan-900/20">
          
          {/* Camera Toggle */}
          <button
            onClick={toggleCamera}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-medium",
              cameraActive 
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50" 
                : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/50"
            )}
          >
            <Camera size={18} />
            {cameraActive ? "Stop Camera" : "Start Camera"}
          </button>

          <div className="w-px h-8 bg-white/10 mx-2" />

          {/* Image Upload */}
          <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-all border border-white/10 hover:border-white/20">
            <ImageIcon size={18} className="text-white/70" />
            <span className="text-sm font-medium">Upload Image</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          {/* Color Picker */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <Palette size={18} className="text-white/70" />
            <input 
              type="color" 
              value={color} 
              onChange={handleColorChange}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" 
            />
          </div>

        </div>
      </div>
      
      {/* Instructions Overlay (if camera not active) */}
      {!cameraActive && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-4 opacity-50">
            <p className="text-lg">Start camera to enable gesture control</p>
            <div className="flex justify-center gap-8 text-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
                  ✌️
                </div>
                <span>Pinch to Scale</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
                  👐
                </div>
                <span>Spread to Diffuse</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
