import { useState, useEffect, useRef } from "react"

type LoadingScreenProps = {
  minDuration?: number
  onLoaded?: () => void
}

export function LoadingScreen({ minDuration = 2000, onLoaded }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const onLoadedRef = useRef(onLoaded)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  useEffect(() => {
    const startTime = Date.now()
    let timer = 0

    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const newProgress = Math.min(100, (elapsed / minDuration) * 100)
      setProgress(newProgress)

      if (newProgress < 100) {
        timer = window.setTimeout(updateProgress, 16)
      } else {
        setTimeout(() => {
          setIsVisible(false)
          onLoadedRef.current?.()
        }, 300)
      }
    }

    timer = window.setTimeout(updateProgress, 16)

    return () => window.clearTimeout(timer)
  }, [minDuration])

  const circumference = 2 * Math.PI * 50
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className={`loading-screen ${!isVisible ? "hidden" : ""}`} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
      <div className="loading-content">
        <div className="loading-kicker">端到端加密传输界面</div>
        <div className="loading-logo">PREACH</div>
        
        <div className="loading-progress-ring">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle className="ring-bg" cx="60" cy="60" r="50" />
            <circle 
              className="ring-progress" 
              cx="60" 
              cy="60" 
              r="50"
              style={{ strokeDashoffset }}
            />
          </svg>
          <div className="loading-percent">{Math.round(progress)}%</div>
        </div>
        <div className="loading-caption">滚轮推进场景，页面本身不做原生上下滚动</div>
      </div>
    </div>
  )
}
