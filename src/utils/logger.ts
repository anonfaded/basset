import { invoke } from "@tauri-apps/api/core";

export async function logToTerminal(message: string) {
  try {
    await invoke("log_message", { message });
  } catch (err) {
    // Silently fail if logging command doesn't work
  }
}

// Batch log calls to avoid too many invocations
const logQueue: string[] = [];
let logTimer: NodeJS.Timeout | null = null;

function flushLogs() {
  if (logQueue.length > 0) {
    const message = logQueue.join(" | ");
    logToTerminal(message);
    logQueue.length = 0;
  }
}

function queueLog(msg: string) {
  logQueue.push(msg);
  if (!logTimer) {
    logTimer = setTimeout(() => {
      flushLogs();
      logTimer = null;
    }, 50);  // Reduced from 100ms for faster feedback
  }
}

export function createLogger(prefix: string) {
  return {
    log: (msg: string) => {
      const fullMsg = `${prefix} ${msg}`;
      console.log(fullMsg);
      queueLog(fullMsg);
    },
    error: (msg: string) => {
      const fullMsg = `${prefix} ❌ ERROR: ${msg}`;
      console.error(fullMsg);
      queueLog(fullMsg);
    },
    success: (msg: string) => {
      const fullMsg = `${prefix} ✅ ${msg}`;
      console.log(fullMsg);
      queueLog(fullMsg);
    },
    // Flush immediately (useful at critical points)
    flush: async () => {
      flushLogs();
      // Give Tauri a moment to send
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
}
