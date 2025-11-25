import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Initialize a new simulation state
 * @param {object} config - Simulation configuration
 * @param {string} runId - Unique run identifier
 * @returns {object} Initial state
 */
export function initializeState(config, runId) {
  const startDate = new Date().toISOString().split('T')[0];

  return {
    runId,
    simulation: {
      current_day: 1, // Start at day 1 (1-based)
      start_date: startDate,
      weather: 'sunny',
      max_days: config.simulation.durationDays,
      max_turns: config.simulation.maxTurns, // Used in run() to limit iterations per day
      daily_fee: config.simulation.dailyFee,
      randomSeed: config.simulation.randomSeed || 42,
      last_day_processed: 0, // Track which day's events have been processed
    },
    finances: {
      balance: config.simulation.startingBalance,
      starting_balance: config.simulation.startingBalance,
      transactions: [],
      total_revenue: 0,
      total_expenses: 0,
    },
    vending_machine: {
      location: '123 Market St, San Francisco, CA',
      rows: 4,
      slots_per_row: 3,
      inventory: [],
      cash_in_machine: 0,
      total_sales: 0,
      units_sold: 0,
    },
    storage: {
      inventory: [],
    },
    emails: {
      inbox: [],
      sent: [],
      conversations: {},
    },
    orders: {
      pending: [],
      completed: [],
      next_order_id: 1,
    },
    daily_summaries: [],
  };
}

/**
 * Get the state file path for a run
 * @param {string} runOutputDir - Run output directory
 * @returns {string} State file path
 */
function getStatePath(runOutputDir) {
  return join(runOutputDir, 'state.json');
}

/**
 * Load state from file
 * @param {string} runOutputDir - Run output directory
 * @returns {object} Current state
 */
export function loadState(runOutputDir) {
  const statePath = getStatePath(runOutputDir);

  if (!existsSync(statePath)) {
    throw new Error(`State file not found: ${statePath}`);
  }

  const stateFile = readFileSync(statePath, 'utf-8');
  return JSON.parse(stateFile);
}

/**
 * Save state to file
 * @param {string} runOutputDir - Run output directory
 * @param {object} state - State to save
 */
export function saveState(runOutputDir, state) {
  const statePath = getStatePath(runOutputDir);

  // Ensure directory exists
  const dir = dirname(statePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Update a specific part of the state
 * @param {string} runOutputDir - Run output directory
 * @param {function} updateFn - Function that receives and modifies state
 * @returns {object} Updated state
 */
export function updateState(runOutputDir, updateFn) {
  const state = loadState(runOutputDir);
  const updatedState = updateFn(state);
  saveState(runOutputDir, updatedState);
  return updatedState;
}

/**
 * Add a transaction to the financial records
 * @param {object} state - Current state
 * @param {string} type - Transaction type (revenue, expense)
 * @param {number} amount - Transaction amount
 * @param {string} description - Transaction description
 * @returns {object} Updated state
 */
export function addTransaction(state, type, amount, description) {
  const transaction = {
    day: state.simulation.current_day,
    type,
    amount,
    description,
    balance_after: type === 'revenue'
      ? state.finances.balance + amount
      : state.finances.balance - amount,
    timestamp: new Date().toISOString(),
  };

  state.finances.transactions.push(transaction);

  if (type === 'revenue') {
    state.finances.balance += amount;
    state.finances.total_revenue += amount;
  } else {
    state.finances.balance -= amount;
    state.finances.total_expenses += amount;
  }

  return state;
}

/**
 * Calculate net worth (balance + inventory value + cash in machine)
 * @param {object} state - Current state
 * @param {object} products - Product database
 * @returns {number} Net worth
 */
export function calculateNetWorth(state, products) {
  let inventoryValue = 0;

  // Value of storage inventory
  for (const item of state.storage.inventory) {
    const product = products.find(p => p.name === item.product);
    if (product) {
      inventoryValue += item.quantity * product.typical_wholesale;
    }
  }

  // Value of vending machine inventory
  for (const slot of state.vending_machine.inventory) {
    const product = products.find(p => p.name === slot.product);
    if (product) {
      inventoryValue += slot.quantity * product.typical_wholesale;
    }
  }

  return state.finances.balance + inventoryValue + state.vending_machine.cash_in_machine;
}
