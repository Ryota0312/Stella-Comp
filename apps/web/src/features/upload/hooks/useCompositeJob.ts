import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { jobPollIntervalMs } from "../constants";
import {
  createPreviewJob,
  fetchJob,
  type JobSummary,
  jobResultUrl,
  type PreviewUploadSummary,
} from "../uploadApi";

type UseCompositeJobOptions = {
  activeId: string | null;
  canRunJob: boolean;
  uploadPreviews: () => Promise<PreviewUploadSummary | null>;
  uploadSummary: PreviewUploadSummary | null;
  uploadedItemIdsRef: RefObject<string[]>;
};

export function useCompositeJob({
  activeId,
  canRunJob,
  uploadPreviews,
  uploadSummary,
  uploadedItemIdsRef,
}: UseCompositeJobOptions) {
  const pollTimeoutRef = useRef<number | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const clearJobState = useCallback((preserveStarting = false) => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setJob(null);
    setJobError(null);
    if (!preserveStarting) {
      setIsStartingJob(false);
    }
  }, []);

  const pollJob = useCallback((jobId: string) => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
    }

    pollTimeoutRef.current = window.setTimeout(async () => {
      try {
        const nextJob = await fetchJob(jobId);
        setJob(nextJob);
        if (nextJob.status === "queued" || nextJob.status === "running") {
          pollJob(jobId);
        }
      } catch (error) {
        setJobError(error instanceof Error ? error.message : "Job status fetch failed");
      }
    }, jobPollIntervalMs);
  }, []);

  const baseIndexForJob = useCallback(() => {
    const activeIndex = uploadedItemIdsRef.current.findIndex((id) => id === activeId);
    return activeIndex >= 0 ? activeIndex : 0;
  }, [activeId, uploadedItemIdsRef]);

  const isJobBusy = isStartingJob || job?.status === "queued" || job?.status === "running";
  const resultUrl = job?.status === "completed" ? jobResultUrl(job.jobId) : null;

  const runComposite = useCallback(async () => {
    if (isJobBusy || !canRunJob) {
      return;
    }

    setIsStartingJob(true);
    setJobError(null);

    try {
      const summary = uploadSummary ?? (await uploadPreviews());
      if (!summary) {
        return;
      }

      const createdJob = await createPreviewJob(summary.sessionId, baseIndexForJob());
      setJob(createdJob);
      pollJob(createdJob.jobId);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Job creation failed");
    } finally {
      setIsStartingJob(false);
    }
  }, [baseIndexForJob, canRunJob, isJobBusy, pollJob, uploadPreviews, uploadSummary]);

  return {
    clearJobState,
    isJobBusy,
    job,
    jobError,
    resultUrl,
    runComposite,
  };
}
