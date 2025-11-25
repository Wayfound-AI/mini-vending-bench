#!/usr/bin/env node

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Agent, run, user, assistant } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { loadConfig } from "./utils/config-loader.js";
import {
  initializeState,
  saveState,
  loadState,
  calculateNetWorth,
} from "./simulation/state.js";
import { ConsoleLogger } from "./logging/console-logger.js";
import { FileLogger } from "./logging/file-logger.js";
import { SupplierResponseGenerator } from "./suppliers/response-generator.js";
import { buildAgentInstructions } from "./agent/instructions.js";
import { generateCharts } from "./utils/chart-generator.js";

// Import tools
import { getBalance, viewTransactions } from "./tools/finance.js";
import { getCurrentDate } from "./tools/time.js";
import { simulateCustomerPurchases } from "./simulation/customer-purchases.js";
import { processDeliveries } from "./simulation/deliveries.js";
import { updateWeather } from "./simulation/weather.js";
import { addTransaction } from "./simulation/state.js";
import { getStorageInventory, checkDeliveries } from "./tools/storage.js";
import { getAvailableProducts, searchSuppliers } from "./tools/research.js";
import {
  viewVendingMachine,
  restockMachine,
  setPrice,
  emptySlot,
} from "./tools/vending-machine.js";
import { viewInbox, readEmail, sendEmail, placeOrder } from "./tools/email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get Vercel AI SDK model (for supplier responses)
 */
function getVercelModel(providerConfig) {
  const { provider, model, apiKey } = providerConfig;

  switch (provider.toLowerCase()) {
    case "openai":
      return openai(model, { apiKey });
    case "anthropic":
      return anthropic(model, { apiKey });
    case "google":
      return google(model, { apiKey });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Get agent model (wrapped with aisdk for OpenAI Agents SDK)
 * OpenAI models use native support, others use aisdk wrapper
 */
function getAgentModel(providerConfig) {
  const { provider, model } = providerConfig;

  // OpenAI has native support in the agents SDK - don't wrap it
  if (provider.toLowerCase() === "openai") {
    return model; // Just pass the model name as a string
  }

  // Other providers need the aisdk wrapper
  return aisdk(getVercelModel(providerConfig));
}

/**
 * Load data files
 */
function loadData() {
  const dataDir = join(__dirname, "../data");

  const products = JSON.parse(
    readFileSync(join(dataDir, "products.json"), "utf-8")
  );

  const suppliers = JSON.parse(
    readFileSync(join(dataDir, "suppliers.json"), "utf-8")
  );

  return { products, suppliers };
}

/**
 * Check end conditions
 */
function checkEndConditions(state, config, consecutiveLowBalance) {
  // Check if we've moved past max days (means we completed all days)
  if (state.simulation.current_day > state.simulation.max_days) {
    return {
      ended: true,
      reason: "Completed benchmark duration",
      success: true,
    };
  }

  // Check bankruptcy
  if (consecutiveLowBalance >= 3) {
    return {
      ended: true,
      reason: "Bankruptcy: Balance below threshold for 3 consecutive days",
      success: false,
    };
  }

  return { ended: false };
}

/**
 * Calculate final score
 */
function calculateFinalScore(state, products, config) {
  const netWorth = calculateNetWorth(state, products);
  const profit = state.finances.total_revenue - state.finances.total_expenses;

  return {
    balance: state.finances.balance,
    netWorth,
    profit,
    totalRevenue: state.finances.total_revenue,
    totalExpenses: state.finances.total_expenses,
    unitsSold: state.vending_machine.units_sold,
    daysSurvived: state.simulation.current_day - 1, // Subtract 1 since we advanced past the last completed day
    startingBalance: config.simulation.startingBalance,
  };
}

/**
 * Main execution
 */
async function main() {
  const consoleLogger = new ConsoleLogger(true);

  consoleLogger.section("Mini Vending Bench - AI Agent Benchmark");

  // Load configuration
  const config = loadConfig();
  consoleLogger.success("Configuration loaded");

  // Load data
  const { products, suppliers } = loadData();
  consoleLogger.info(
    `Loaded ${products.length} products and ${suppliers.length} suppliers`
  );

  // Create run directory
  const runId = `run_${Date.now()}`;
  const runOutputDir = join(process.cwd(), "run_outputs", runId);
  const fileLogger = new FileLogger(runOutputDir);

  consoleLogger.info(`Run ID: ${runId}`);
  consoleLogger.info(`Output directory: ${runOutputDir}`);

  // Initialize state
  const state = initializeState(config, runId);
  saveState(runOutputDir, state);
  fileLogger.writeConfig(config);

  consoleLogger.success("Benchmark initialized");

  // Create supplier response generator (uses Vercel AI SDK directly)
  const supplierModel = getVercelModel(config.supplier);
  const supplierResponseGenerator = new SupplierResponseGenerator(
    supplierModel,
    products
  );

  // Set API key for native OpenAI support if using OpenAI
  if (config.agent.provider.toLowerCase() === "openai") {
    process.env.OPENAI_API_KEY = config.agent.apiKey;
  }

  // Create agent model (wrapped for OpenAI Agents SDK)
  const agentModel = getAgentModel(config.agent);

  // Build agent instructions
  const instructions = buildAgentInstructions(config);

  // Initialize tools (removed wait_for_next_day - day advancement happens in main loop)
  const tools = [
    getBalance(runOutputDir),
    viewTransactions(runOutputDir),
    getCurrentDate(runOutputDir),
    getAvailableProducts(products),
    searchSuppliers(suppliers),
    viewInbox(runOutputDir),
    readEmail(runOutputDir),
    sendEmail(
      runOutputDir,
      suppliers,
      supplierResponseGenerator,
      consoleLogger
    ),
    placeOrder(runOutputDir, products, suppliers),
    getStorageInventory(runOutputDir),
    checkDeliveries(runOutputDir),
    viewVendingMachine(runOutputDir),
    restockMachine(runOutputDir),
    setPrice(runOutputDir),
    emptySlot(runOutputDir),
  ];

  // Create agent
  const agent = new Agent({
    name: "vending_machine_operator",
    model: agentModel,
    instructions,
    tools,
  });

  consoleLogger.section("Starting Benchmark");

  // Track consecutive low balance days
  let consecutiveLowBalance = 0;

  // Maintain conversation history across turns
  let conversationHistory = [];

  // Main loop
  let running = true;
  while (running) {
    console.log(`[DEBUG] === Starting main loop iteration ===`);
    let currentState = loadState(runOutputDir);
    console.log(`[DEBUG] Current day: ${currentState.simulation.current_day}`);

    // Process daily setup events at the START of each day (before agent acts)
    const isFirstTurnOfDay =
      currentState.last_day_processed !== currentState.simulation.current_day;

    let deliveriesReceivedToday = 0;

    if (isFirstTurnOfDay) {
      const day = currentState.simulation.current_day;
      consoleLogger.section(`📅 DAY ${day} BEGINS`);

      if (day === 1) {
        consoleLogger.info(
          "Initial setup phase - agent preparing for business"
        );
      } else {
        consoleLogger.event(`Starting day ${day}`);
      }

      // Update weather
      currentState.simulation.weather = updateWeather(currentState);

      // Apply daily fee (location rent/maintenance)
      const dailyFee = currentState.simulation.daily_fee || 0;
      if (dailyFee > 0 && day > 1) {
        addTransaction(currentState, "expense", dailyFee, "Daily location fee");
        consoleLogger.event(`Applied daily fee: $${dailyFee}`);
      }

      // Process deliveries (orders that have arrived)
      if (day > 1) {
        const deliveryResults = processDeliveries(currentState);
        deliveriesReceivedToday = deliveryResults.length;
        if (deliveryResults.length > 0) {
          for (const result of deliveryResults) {
            consoleLogger.event(result.message);
          }
        }
      }

      // Mark this day as processed and store delivery count
      currentState.last_day_processed = day;
      currentState.deliveries_received_today = deliveriesReceivedToday;
      saveState(runOutputDir, currentState);
    }

    // Reload state after daily processing
    currentState = loadState(runOutputDir);

    // Check bankruptcy tracking
    if (currentState.finances.balance < config.simulation.bankruptcyThreshold) {
      consecutiveLowBalance += 1;
    } else {
      consecutiveLowBalance = 0;
    }

    // Run agent step
    try {
      const prompt = `Current day: ${currentState.simulation.current_day}. Continue managing your business. Use the available tools to take actions autonomously.`;

      // Add user message to conversation history
      conversationHistory.push(user(prompt));

      consoleLogger.llmPrompt(prompt);
      console.log(
        `[DEBUG] About to call run() with ${conversationHistory.length} messages in history`
      );

      // Pass full conversation history - agent can see previous context
      // Agent will take as many actions as it needs until it naturally completes
      const result = await run(agent, conversationHistory, {
        maxTurns: config.simulation.maxTurns,
      });

      console.log(`[DEBUG] run() completed successfully`);

      // Log LLM response
      const response = result.finalOutput || "Agent completed";
      consoleLogger.llmResponse(response);

      // Add assistant response to conversation history
      if (response) {
        conversationHistory.push(assistant(response));
      }

      // Log agent response to file
      fileLogger.logMessage("agent", response, {
        day: currentState.simulation.current_day,
      });

      // After agent acts, simulate customer purchases and collect cash
      const stateAfterAgent = loadState(runOutputDir);
      const day = stateAfterAgent.simulation.current_day;

      let dayUnitsSold = 0;
      let dayRevenue = 0;

      if (day > 1) {
        // Simulate customer purchases (after agent has restocked)
        const purchaseResults = simulateCustomerPurchases(
          stateAfterAgent,
          products
        );
        dayUnitsSold = purchaseResults.units_sold;
        dayRevenue = purchaseResults.revenue;

        if (purchaseResults.units_sold > 0) {
          consoleLogger.event(
            `Customers purchased ${
              purchaseResults.units_sold
            } units for $${purchaseResults.revenue.toFixed(2)}`
          );
        }

        // Collect cash from machine if there's any
        if (stateAfterAgent.vending_machine.cash_in_machine > 0) {
          const cashCollected = stateAfterAgent.vending_machine.cash_in_machine;
          addTransaction(
            stateAfterAgent,
            "revenue",
            cashCollected,
            `Collected cash from vending machine on day ${day}`
          );
          stateAfterAgent.vending_machine.cash_in_machine = 0;
          consoleLogger.event(
            `Collected $${cashCollected.toFixed(2)} from vending machine`
          );
        }

        saveState(runOutputDir, stateAfterAgent);

        // Log daily summary to file
        const summary = {
          day,
          balance: stateAfterAgent.finances.balance,
          units_sold: dayUnitsSold,
          revenue: dayRevenue,
          deliveries_received: stateAfterAgent.deliveries_received_today || 0,
          weather: stateAfterAgent.simulation.weather,
          inventory_count: stateAfterAgent.vending_machine.inventory.reduce(
            (sum, slot) => sum + slot.quantity,
            0
          ),
        };

        fileLogger.logDailySummary(day, summary);
      }

      // Print end-of-day summary after all day activities complete
      const endOfDayState = loadState(runOutputDir);
      consoleLogger.section(`📊 END OF DAY ${endOfDayState.simulation.current_day}`);
      console.log(`  💰 Balance: $${endOfDayState.finances.balance.toFixed(2)}`);
      console.log(`  📦 Inventory in Machine: ${endOfDayState.vending_machine.inventory.reduce((sum, slot) => sum + slot.quantity, 0)} units`);
      console.log(`  🏪 Inventory in Storage: ${endOfDayState.storage.inventory.reduce((sum, item) => sum + item.quantity, 0)} units`);
      console.log(`  📈 Total Revenue: $${endOfDayState.finances.total_revenue.toFixed(2)}`);
      console.log(`  📉 Total Expenses: $${endOfDayState.finances.total_expenses.toFixed(2)}`);
      console.log(`  📊 Net Profit: $${(endOfDayState.finances.total_revenue - endOfDayState.finances.total_expenses).toFixed(2)}`);
      console.log();

      // Advance to next day after agent completes turn
      const stateAfterTurn = loadState(runOutputDir);
      console.log(
        `[DEBUG] Advancing day counter from ${
          stateAfterTurn.simulation.current_day
        } to ${stateAfterTurn.simulation.current_day + 1}`
      );
      stateAfterTurn.simulation.current_day += 1;
      saveState(runOutputDir, stateAfterTurn);

      // Check end conditions after agent completes the day
      const finalStateCheck = loadState(runOutputDir);
      const endCheck = checkEndConditions(
        finalStateCheck,
        config,
        consecutiveLowBalance
      );
      if (endCheck.ended) {
        consoleLogger.info(`Benchmark ended: ${endCheck.reason}`);
        running = false;
        break;
      }
    } catch (error) {
      console.log(`[DEBUG] Caught error in agent run:`, error.message);
      console.log(`[DEBUG] Error stack:`, error.stack);

      // Check error type
      if (
        error.name === "MaxTurnsExceededError" ||
        (error.message && error.message.toLowerCase().includes("max turns"))
      ) {
        // Agent hit maxTurns limit - this is expected behavior, continue to next day
        consoleLogger.info(
          `Agent reached maxTurns limit (${error.message}) - continuing to next day`
        );
        fileLogger.logEvent("max_turns_reached", {
          day: currentState.simulation.current_day,
          message: "Agent hit maxTurns limit within run()",
        });
      } else {
        // Actual error - log it
        consoleLogger.error("Agent error", error);
        fileLogger.logEvent("error", {
          day: currentState.simulation.current_day,
          error: error.message,
          stack: error.stack,
        });
      }

      // Continue despite errors - try next day
    }

    console.log(
      `[DEBUG] End of main loop iteration, about to start next iteration`
    );
  }

  // Calculate final score
  consoleLogger.section("Calculating Final Score");
  const finalState = loadState(runOutputDir);
  const finalScore = calculateFinalScore(finalState, products, config);

  fileLogger.writeFinalScore(finalScore);
  consoleLogger.finalResults(finalScore);

  // Generate chart data
  consoleLogger.info("Generating chart data...");
  await generateCharts(runOutputDir);
  consoleLogger.success("Chart data generated");

  consoleLogger.success(
    `\nBenchmark complete! Results saved to: ${runOutputDir}`
  );
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
