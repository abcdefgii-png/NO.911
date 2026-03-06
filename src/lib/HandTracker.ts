import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";

export class HandTracker {
  handLandmarker: HandLandmarker | undefined;
  video: HTMLVideoElement;
  lastVideoTime = -1;
  onResult: (result: HandLandmarkerResult) => void;
  isRunning = false;

  constructor(videoElement: HTMLVideoElement, onResult: (result: HandLandmarkerResult) => void) {
    this.video = videoElement;
    this.onResult = onResult;
  }

  async initialize() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
  }

  start() {
    if (!this.handLandmarker) {
      console.warn("HandLandmarker not initialized");
      return;
    }
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  loop = () => {
    if (!this.isRunning) return;

    if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
      const startTimeMs = performance.now();
      const results = this.handLandmarker?.detectForVideo(this.video, startTimeMs);
      if (results) {
        this.onResult(results);
      }
      this.lastVideoTime = this.video.currentTime;
    }

    requestAnimationFrame(this.loop);
  };
}
