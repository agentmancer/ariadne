/**
 * Card component for displaying batch execution status
 */

import { BatchExecution } from '../services/api';
import { formatDistanceToNow } from 'date-fns';

interface BatchStatusCardProps {
  batch: BatchExecution;
  onPause?: () => void;
  onResume?: () => void;
  onClick?: () => void;
}

export function BatchStatusCard({ batch, onPause, onResume, onClick }: BatchStatusCardProps) {
  const progress = batch.actorsToCreate > 0
    ? Math.round((batch.actorsCompleted / batch.actorsToCreate) * 100)
    : 0;

  const statusConfig = {
    QUEUED: { color: 'bg-gray-100 text-gray-800', progressColor: 'bg-gray-500', icon: '⏳', label: 'Queued' },
    RUNNING: { color: 'bg-blue-100 text-blue-800', progressColor: 'bg-blue-500', icon: '⟳', label: 'Running' },
    PAUSED: { color: 'bg-yellow-100 text-yellow-800', progressColor: 'bg-yellow-500', icon: '⏸', label: 'Paused' },
    COMPLETE: { color: 'bg-green-100 text-green-800', progressColor: 'bg-green-500', icon: '✓', label: 'Complete' },
    FAILED: { color: 'bg-red-100 text-red-800', progressColor: 'bg-red-500', icon: '✗', label: 'Failed' },
  };

  const status = statusConfig[batch.status];

  return (
    <div
      className={`bg-white rounded-lg p-4 shadow-sm ${onClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{batch.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {batch.type.replace('_', ' ')}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
          {status.icon} {status.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{batch.actorsCompleted} / {batch.actorsToCreate}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${status.progressColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Timestamps */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>
          Started {formatDistanceToNow(new Date(batch.createdAt), { addSuffix: true })}
        </span>
        {batch.completedAt && (
          <span>
            Finished {formatDistanceToNow(new Date(batch.completedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Error message */}
      {batch.error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {batch.error}
        </div>
      )}

      {/* Actions */}
      {(batch.status === 'RUNNING' || batch.status === 'PAUSED') && (onPause || onResume) && (
        <div className="mt-3 flex gap-2">
          {batch.status === 'RUNNING' && onPause && (
            <button
              onClick={(e) => { e.stopPropagation(); onPause(); }}
              className="flex-1 py-2 px-3 text-sm font-medium text-yellow-700 bg-yellow-100 rounded-lg active:bg-yellow-200"
            >
              ⏸ Pause
            </button>
          )}
          {batch.status === 'PAUSED' && onResume && (
            <button
              onClick={(e) => { e.stopPropagation(); onResume(); }}
              className="flex-1 py-2 px-3 text-sm font-medium text-green-700 bg-green-100 rounded-lg active:bg-green-200"
            >
              ▶ Resume
            </button>
          )}
        </div>
      )}
    </div>
  );
}
