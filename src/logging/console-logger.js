import chalk from 'chalk';

/**
 * Console logger with colored output
 */
export class ConsoleLogger {
  constructor(verbose = true) {
    this.verbose = verbose;
  }

  /**
   * Log agent action
   */
  agent(message) {
    if (this.verbose) {
      console.log(chalk.blue('🤖 [Agent]'), message);
    }
  }

  /**
   * Log tool call
   */
  tool(toolName, args) {
    if (this.verbose) {
      console.log(chalk.green(`🔧 [Tool: ${toolName}]`), JSON.stringify(args, null, 2));
    }
  }

  /**
   * Log tool result
   */
  toolResult(toolName, result) {
    if (this.verbose) {
      const preview = typeof result === 'string'
        ? result.substring(0, 100)
        : JSON.stringify(result).substring(0, 100);
      console.log(chalk.green(`✓  [${toolName}]`), preview);
    }
  }

  /**
   * Log simulation event
   */
  event(message) {
    if (this.verbose) {
      console.log(chalk.yellow('⚡ [Event]'), message);
    }
  }

  /**
   * Log error
   */
  error(message, error) {
    console.error(chalk.red('❌ [Error]'), message);
    if (error) {
      console.error(chalk.red(error.stack || error.message));
    }
  }

  /**
   * Log warning
   */
  warn(message) {
    console.warn(chalk.hex('#FFA500')('⚠️  [Warning]'), message);
  }

  /**
   * Log info
   */
  info(message) {
    console.log(chalk.cyan('ℹ️  [Info]'), message);
  }

  /**
   * Log success
   */
  success(message) {
    console.log(chalk.green('✅ [Success]'), message);
  }

  /**
   * Log day summary
   */
  daySummary(day, balance, sales, toolCalls) {
    console.log(chalk.bold.cyan(`\n${'='.repeat(50)}`));
    console.log(chalk.bold.cyan(`📅 Day ${day} Summary:`));
    console.log(chalk.bold.cyan(`${'='.repeat(50)}`));
    console.log(`  💰 Balance: $${balance.toFixed(2)}`);
    console.log(`  📦 Units Sold: ${sales}`);
    if (toolCalls > 0) {
      console.log(`  🔨 Tool Calls: ${toolCalls}`);
    }
    console.log(chalk.bold.cyan(`${'='.repeat(50)}\n`));
  }

  /**
   * Log LLM prompt
   */
  llmPrompt(prompt) {
    if (this.verbose) {
      console.log(chalk.magenta('💬 [LLM Prompt]'), prompt);
    }
  }

  /**
   * Log LLM response
   */
  llmResponse(response) {
    if (this.verbose) {
      console.log(chalk.magenta('🤖 [LLM Response]'), response);
    }
  }

  /**
   * Log section header
   */
  section(title) {
    console.log(chalk.bold.underline(`\n${title}`));
  }

  /**
   * Log final results
   */
  finalResults(results) {
    console.log(chalk.bold.green('\n═══════════════════════════════════════'));
    console.log(chalk.bold.green('         FINAL RESULTS'));
    console.log(chalk.bold.green('═══════════════════════════════════════\n'));

    console.log(`  💰 Final Balance: ${chalk.bold('$' + results.balance.toFixed(2))}`);
    console.log(`  💎 Net Worth: ${chalk.bold('$' + results.netWorth.toFixed(2))}`);
    console.log(`  📦 Total Units Sold: ${chalk.bold(results.unitsSold)}`);
    console.log(`  📈 Total Revenue: ${chalk.bold('$' + results.totalRevenue.toFixed(2))}`);
    console.log(`  📉 Total Expenses: ${chalk.bold('$' + results.totalExpenses.toFixed(2))}`);
    console.log(`  📊 Profit: ${chalk.bold('$' + results.profit.toFixed(2))}`);
    console.log(`  📅 Days Survived: ${chalk.bold(results.daysSurvived)}`);

    console.log(chalk.bold.green('\n═══════════════════════════════════════\n'));
  }
}

/**
 * Create a singleton console logger instance
 */
export const logger = new ConsoleLogger();
