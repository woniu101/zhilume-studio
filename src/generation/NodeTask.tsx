import { createContext, useContext } from 'react';
import { statusLabel } from '../api';
export const NodeTask = createContext<any>(null);
export const taskActive = (job: any) => !!job && !['succeeded','failed','interrupted','cancelled','blocked'].includes(job.status);
export function useNodeTask() { return taskActive(useContext(NodeTask)); }
export function NodeTaskStatus({ job, cancel, retry }: { job: any; cancel: () => void; retry: () => void }) {
  if (!job || job.status === 'succeeded') return null;
  return <div className="composer-task" role="status"><span>{statusLabel[job.status] || job.status} · {job.stage}
    {taskActive(job) && Number.isFinite(job.progress) && ` · ${Math.round(job.progress * 100)}%`}
    {job.error && <small>{job.error}</small>}</span>
    {taskActive(job) ? <button disabled={job.status === 'cancel_requested'} onClick={cancel}>取消</button> : <button onClick={retry}>重试</button>}</div>;
}
