#!/usr/bin/env node

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Agent, run, user, assistant, MCPServerStreamableHttp } from "@openai/agents";
import { openai } from "@ai-sdk/openai";
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
 * Only OpenAI models are supported
 */
function getVercelModel(config) {
  const { model, apiKey } = config;
  return openai(model, { apiKey });
}

/**
 * Get agent model for OpenAI Agents SDK
 * Only OpenAI models are supported
 */
function getAgentModel(config) {
  return config.model; // Just pass the model name as a string
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
  let mcpServer = null;

  consoleLogger.section("Mini Vending Bench - AI Agent Benchmark");

  // Get required command line arguments
  const subdirectory = process.argv[2];
  const supervisorMode = process.argv[3];

  if (!subdirectory || !supervisorMode) {
    console.error("❌ Error: Both subdirectory and supervisor mode arguments are required");
    console.error("   Usage: npm start <subdirectory> <supervisor-mode>");
    console.error("   Supervisor modes: none | static | mcp");
    console.error("");
    console.error("   Examples:");
    console.error("   npm start control none         # No supervisor");
    console.error("   npm start static-test static   # Static guidelines");
    console.error("   npm start mcp-test mcp         # MCP supervisor");
    process.exit(1);
  }

  // Validate supervisor mode
  const validModes = ['none', 'static', 'mcp'];
  if (!validModes.includes(supervisorMode)) {
    console.error(`❌ Error: Invalid supervisor mode '${supervisorMode}'`);
    console.error(`   Must be one of: ${validModes.join(', ')}`);
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig();
  consoleLogger.success("Configuration loaded");

  // Load data
  const { products, suppliers } = loadData();
  consoleLogger.info(
    `Loaded ${products.length} products and ${suppliers.length} suppliers`
  );

  // Create run directory with subdirectory
  const runId = `run_${Date.now()}`;
  const runOutputDir = join(process.cwd(), "run_outputs", subdirectory, runId);
  const fileLogger = new FileLogger(runOutputDir);

  consoleLogger.info(`Subdirectory: ${subdirectory}`);
  consoleLogger.info(`Supervisor mode: ${supervisorMode}`);
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

  // Set API key for OpenAI Agents SDK
  process.env.OPENAI_API_KEY = config.agent.apiKey;

  // Create agent model
  const agentModel = getAgentModel(config.agent);

  // Validate supervisor configuration based on mode
  if (supervisorMode === 'static' && !config.supervisor?.staticGuidelines) {
    console.error("❌ Error: Static supervisor mode selected but no staticGuidelines found in config.json");
    process.exit(1);
  }
  if (supervisorMode === 'mcp' && !config.supervisor?.mcpServer) {
    console.error("❌ Error: MCP supervisor mode selected but no mcpServer configuration found in config.json");
    process.exit(1);
  }

  // Build agent instructions with supervisor mode
  const instructions = buildAgentInstructions(config, supervisorMode);

  // Initialize MCP server if MCP mode is selected
  if (supervisorMode === 'mcp') {
    consoleLogger.info("Initializing MCP supervisor server...");
    consoleLogger.info(`  URL: ${config.supervisor.mcpServer.url}`);
    consoleLogger.info(`  Supervisor ID: ${config.supervisor.mcpServer.supervisorAgentId}`);

    mcpServer = new MCPServerStreamableHttp({
      url: config.supervisor.mcpServer.url,
      requestInit: {
        headers: {
          'Authorization': `Bearer ${config.supervisor.mcpServer.bearerToken}`
        }
      }
    });

    try {
      await mcpServer.connect();
      consoleLogger.success("MCP supervisor server connected");
    } catch (error) {
      // CRITICAL: If MCP server is specified and connection fails, stop the program
      consoleLogger.error("Failed to connect to MCP supervisor server", error);
      consoleLogger.error(`  Error details: ${error.stack || error.message}`);
      throw new Error(`MCP connection failed: ${error.message}`);
    }
  }

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
    ...(mcpServer ? { mcpServers: [mcpServer] } : {}),
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

      // Refresh MCP connection at start of each day to avoid cold start issues
      if (mcpServer && supervisorMode === 'mcp') {
        try {
          await mcpServer.close();
          await mcpServer.connect();

          // Make a warmup call to wake up the Wayfound supervisor
          // This prevents the 500 error on the first actual tool call
          try {
            const tools = await mcpServer.listTools();
            consoleLogger.info(`🔄 Refreshed MCP connection (${tools.length} tools available)`);
          } catch (warmupError) {
            consoleLogger.info("🔄 Refreshed MCP connection for new day");
            consoleLogger.warn("⚠️  MCP warmup call failed (first tool call may be slower)");
          }
        } catch (error) {
          consoleLogger.warn("⚠️  MCP reconnect failed, will use existing connection");
          consoleLogger.warn(`   ${error.message}`);
        }
      }
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

      // Pass conversation history - SDK manages its own state internally
      const result = await run(agent, conversationHistory, {
        maxTurns: config.simulation.maxTurns,
      });

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

  // Cleanup MCP server connection
  if (mcpServer) {
    try {
      await mcpServer.close();
      consoleLogger.info("MCP supervisor server connection closed");
    } catch (error) {
      consoleLogger.error("Error closing MCP server", error);
    }
  }
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
