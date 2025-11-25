import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * File logger for writing JSONL logs
 */
export class FileLogger {
  constructor(runOutputDir) {
    this.runOutputDir = runOutputDir;
    this.ensureDirectory();
  }

  /**
   * Ensure run output directory exists
   */
  ensureDirectory() {
    if (!existsSync(this.runOutputDir)) {
      mkdirSync(this.runOutputDir, { recursive: true });
    }
  }

  /**
   * Append a line to a JSONL file
   */
  appendJSONL(filename, data) {
    const filepath = join(this.runOutputDir, filename);
    const line = JSON.stringify(data) + '\n';
    appendFileSync(filepath, line, 'utf-8');
  }

  /**
   * Write a JSON file (overwrites)
   */
  writeJSON(filename, data) {
    const filepath = join(this.runOutputDir, filename);
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Write a text file (overwrites)
   */
  writeText(filename, text) {
    const filepath = join(this.runOutputDir, filename);
    writeFileSync(filepath, text, 'utf-8');
  }

  /**
   * Log a message
   */
  logMessage(role, content, metadata = {}) {
    this.appendJSONL('messages.jsonl', {
      timestamp: new Date().toISOString(),
      role,
      content,
      ...metadata,
    });
  }

  /**
   * Log a tool call
   */
  logToolCall(toolName, args, result, metadata = {}) {
    this.appendJSONL('tool_calls.jsonl', {
      timestamp: new Date().toISOString(),
      tool: toolName,
      args,
      result: typeof result === 'string' ? result.substring(0, 1000) : result,
      ...metadata,
    });
  }

  /**
   * Log an event
   */
  logEvent(eventType, data) {
    this.appendJSONL('events.jsonl', {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      ...data,
    });
  }

  /**
   * Log daily summary
   */
  logDailySummary(day, summary) {
    this.appendJSONL('daily_summary.jsonl', {
      day,
      timestamp: new Date().toISOString(),
      ...summary,
    });
  }

  /**
   * Write final score
   */
  writeFinalScore(score) {
    this.writeJSON('final_score.json', {
      ...score,
      generated_at: new Date().toISOString(),
    });
  }

  /**
   * Append to human-readable trace
   */
  appendTrace(text) {
    const filepath = join(this.runOutputDir, 'trace.txt');
    appendFileSync(filepath, text + '\n', 'utf-8');
  }

  /**
   * Write config snapshot
   */
  writeConfig(config) {
    // Remove API keys before saving
    const sanitizedConfig = JSON.parse(JSON.stringify(config));
    if (sanitizedConfig.agent?.apiKey) {
      sanitizedConfig.agent.apiKey = '***';
    }
    if (sanitizedConfig.supplier?.apiKey) {
      sanitizedConfig.supplier.apiKey = '***';
    }

    this.writeJSON('config.json', sanitizedConfig);
  }
}
