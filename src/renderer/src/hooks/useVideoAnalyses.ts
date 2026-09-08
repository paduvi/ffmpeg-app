import { useEffect, useState } from 'react'
import type { EstimateTask, VideoAnalysis, VideoFile } from '@shared/types'

export type VideoAnalyses = {
  /** Keyed by file path; a missing entry means "not probed yet". */
  analyses: Map<string, VideoAnalysis>
  analyzing: boolean
}

/**
 * Probe every listed video for its duration and a processing-time estimate.
 *
 * Re-runs whenever the file list or the task changes (switching cut mode
 * changes the estimate). Main-side probing is cached per file, so re-running
 * after adding one video only pays for that one video.
 */
export function useVideoAnalyses(files: VideoFile[], task: EstimateTask): VideoAnalyses {
  const [analyses, setAnalyses] = useState<Map<string, VideoAnalysis>>(new Map())
  const [analyzing, setAnalyzing] = useState(false)

  // `files` and `task` are fresh objects on every render; these serialised
  // forms are the values that actually decide whether a re-probe is needed.
  // JSON rather than a delimiter join — paths routinely contain spaces.
  const pathsKey = JSON.stringify(files.map((f) => f.path))
  const taskKey = JSON.stringify(task)

  useEffect(() => {
    const paths = JSON.parse(pathsKey) as string[]
    if (paths.length === 0) {
      setAnalyses(new Map())
      setAnalyzing(false)
      return
    }

    let cancelled = false
    setAnalyzing(true)
    window.api.media
      .analyze(paths, JSON.parse(taskKey) as EstimateTask)
      .then((results) => {
        if (!cancelled) setAnalyses(new Map(results.map((r) => [r.path, r])))
      })
      .catch(() => {
        // Estimates are decoration — a file we cannot probe just shows a dash.
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false)
      })

    return () => {
      cancelled = true
    }
  }, [pathsKey, taskKey])

  return { analyses, analyzing }
}
