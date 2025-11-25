import { z } from 'zod';
import { tool } from '@openai/agents';
import { loadState } from '../simulation/state.js';

/**
 * Get current bank account balance
 */
export const getBalance = (runOutputDir) => tool({
  name: 'get_balance',
  description: 'Get the current bank account balance',
  parameters: z.object({}),
  execute: async () => {
    const state = loadState(runOutputDir);

    return {
      balance: state.finances.balance,
      starting_balance: state.finances.starting_balance,
      total_revenue: state.finances.total_revenue,
      total_expenses: state.finances.total_expenses,
      profit: state.finances.total_revenue - state.finances.total_expenses,
    };
  },
});

/**
 * View transaction history
 */
export const viewTransactions = (runOutputDir) => tool({
  name: 'view_transactions',
  description: 'View transaction history with optional filters',
  parameters: z.object({
    limit: z.number().int().positive().optional().nullable().describe('Number of recent transactions to return (default: 20)'),
    type: z.enum(['revenue', 'expense', 'all']).optional().nullable().describe('Filter by transaction type'),
    min_day: z.number().int().nonnegative().optional().nullable().describe('Filter transactions from this day onwards'),
  }),
  execute: async ({ limit = 20, type = 'all', min_day = 0 }) => {
    const state = loadState(runOutputDir);

    let transactions = state.finances.transactions;

    // Apply filters
    if (type !== 'all') {
      transactions = transactions.filter(t => t.type === type);
    }

    if (min_day > 0) {
      transactions = transactions.filter(t => t.day >= min_day);
    }

    // Get most recent
    transactions = transactions.slice(-limit);

    return {
      transactions,
      count: transactions.length,
      total_revenue: state.finances.total_revenue,
      total_expenses: state.finances.total_expenses,
    };
  },
});
