import { useEffect, useRef } from "react";
import startVid from "../../assets/startvid.mp4";

interface SplashScreenProps {
  onFinished: () => void;
  status?: string;
}

function SplashScreen({
  onFinished,
  status,
}: SplashScreenProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(onFinished, 1400);
    return () => window.clearTimeout(timer);
  }, [onFinished]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 1;
    video.play().catch(() => {
      // autoplay blocked or video error — silently fall back to black bg
    });
  }, []);

  return (
    <div className="splash-screen">
      <video
        ref={videoRef}
        className="splash-bg"
        src={startVid}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{ display: "block", objectFit: "cover" }}
      />
      <div className="splash-brand" aria-label="牧马城市">
        <span>牧马城市</span>
        <small>让工作在游戏中完成</small>
      </div>
      {status && <div className="splash-status">{status}</div>}
    </div>
  );
}

export default SplashScreen;
