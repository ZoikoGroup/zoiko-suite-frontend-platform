import type { ApiError } from "@/lib/api/client";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface WorkflowReadProblemProps {
  error: ApiError;
  what: string;
}

export function WorkflowReadProblem({ error, what }: WorkflowReadProblemProps) {
  const isAuth = error.status === 401 || error.status === 403;
  const isUnavailable = error.status === 503;

  return (
    <div className="rounded-lg border p-4 text-center space-y-3">
      <AlertTriangle className="h-10 w-10 mx-auto text-slate-400" />
      <div>
        <p className="font-medium text-slate-900 dark:text-slate-100">
          Could not load {what}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isAuth
            ? "You do not have permission to read this register, or your session has expired."
            : isUnavailable
            ? "workflow-svc is unavailable. It may be starting up or experiencing an outage."
            : error.message}
        </p>
      </div>
      {isAuth && (
        <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="mx-auto">
          <RefreshCw className="h-4 w-4 mr-1" /> Sign in again
        </Button>
      )}
    </div>
  );
}