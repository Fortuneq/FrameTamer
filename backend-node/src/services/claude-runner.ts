import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type { AgentTask } from '../types.js';

// In-memory stores for active and completed tasks
const tasks = new Map<string, AgentTask>();
const taskEmitters = new Map<string, EventEmitter>();

export function getTask(taskId: string): AgentTask | undefined {
  return tasks.get(taskId);
}

export function getAllTasks(): AgentTask[] {
  return Array.from(tasks.values());
}

export function getTasksByProject(projectId: string): AgentTask[] {
  return Array.from(tasks.values()).filter(t => t.projectId === projectId);
}

export function getTaskEmitter(taskId: string): EventEmitter | undefined {
  return taskEmitters.get(taskId);
}

export interface RunClaudeOptions {
  projectId: string;
  type: AgentTask['type'];
  prompt: string;
  cwd?: string;
  maxTurns?: number;
  resumeSessionId?: string; // if set, use --resume instead of -p
  onComplete?: (task: AgentTask) => void;
}

function spawnClaude(opts: RunClaudeOptions, taskId: string, emitter: EventEmitter): AgentTask {
  const task: AgentTask = {
    id: taskId,
    projectId: opts.projectId,
    type: opts.type,
    status: 'running',
    prompt: opts.prompt,
    output: [],
    startedAt: new Date().toISOString(),
    claudeSessionId: opts.resumeSessionId,
  };

  tasks.set(taskId, task);
  taskEmitters.set(taskId, emitter);

  const args: string[] = [];

  if (opts.resumeSessionId) {
    // Continue existing session
    args.push('--resume', opts.resumeSessionId, '-p', opts.prompt);
  } else {
    args.push('-p', opts.prompt);
  }

  args.push(
    '--output-format', 'stream-json',
    '--max-turns', String(opts.maxTurns ?? 25),
    '--verbose',
    '--dangerously-skip-permissions',
  );

  const proc = spawn('claude', args, {
    cwd: opts.cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  task.pid = proc.pid;

  // Buffer for handling partial lines across chunks
  let stdoutBuffer = '';

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    // Last element may be incomplete — keep it in the buffer
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      task.output.push(line);
      emitter.emit('data', line);

      // Attempt to parse stream-json events to extract sessionId
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        emitter.emit('event', event);

        // Extract claudeSessionId from any event that has it
        if (!task.claudeSessionId && typeof event.sessionId === 'string') {
          task.claudeSessionId = event.sessionId;
        }
      } catch {
        // Plain text line — emit as text
        emitter.emit('text', line);
      }
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    const stderrLine = `[stderr] ${text}`;
    task.output.push(stderrLine);
    emitter.emit('data', stderrLine);
  });

  proc.on('close', (code) => {
    // Flush any remaining buffered content
    if (stdoutBuffer.trim()) {
      task.output.push(stdoutBuffer);
      emitter.emit('data', stdoutBuffer);
    }

    task.status = code === 0 ? 'completed' : 'error';
    task.completedAt = new Date().toISOString();

    if (code !== 0) {
      task.errorMessage = `Process exited with code ${code}`;
    }

    emitter.emit('done', task);
    opts.onComplete?.(task);

    // Keep task data indefinitely; clean up emitter after 60 s
    setTimeout(() => taskEmitters.delete(taskId), 60_000);
  });

  proc.on('error', (err) => {
    task.status = 'error';
    task.errorMessage = err.message;
    task.completedAt = new Date().toISOString();
    emitter.emit('error', err);
    emitter.emit('done', task);
    opts.onComplete?.(task);
    setTimeout(() => taskEmitters.delete(taskId), 60_000);
  });

  return task;
}

export function runClaude(opts: RunClaudeOptions): AgentTask {
  const taskId = uuid();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  return spawnClaude(opts, taskId, emitter);
}

/**
 * Continue an existing Claude session by taskId.
 * Creates a NEW task that resumes the Claude session from the previous task.
 * The new task streams into the same project context.
 */
export function continueTask(
  previousTaskId: string,
  newInstruction: string,
  onComplete?: (task: AgentTask) => void,
): AgentTask | null {
  const prevTask = tasks.get(previousTaskId);
  if (!prevTask) return null;
  if (!prevTask.claudeSessionId) return null;

  const taskId = uuid();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  return spawnClaude({
    projectId: prevTask.projectId,
    type: prevTask.type,
    prompt: newInstruction,
    cwd: undefined, // claude --resume uses the session's original cwd
    maxTurns: 50,
    resumeSessionId: prevTask.claudeSessionId,
    onComplete,
  }, taskId, emitter);
}

export function killTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task || task.pid === undefined || task.status !== 'running') return false;

  try {
    process.kill(task.pid, 'SIGTERM');
    task.status = 'error';
    task.errorMessage = 'Cancelled by user';
    task.completedAt = new Date().toISOString();
    const emitter = taskEmitters.get(taskId);
    emitter?.emit('done', task);
    return true;
  } catch {
    return false;
  }
}
