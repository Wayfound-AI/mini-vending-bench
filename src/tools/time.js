import { z } from 'zod';
import { tool } from '@openai/agents';
import { loadState, saveState, addTransaction } from '../simulation/state.js';
import { simulateCustomerPurchases } from '../simulation/customer-purchases.js';
import { processDeliveries } from '../simulation/deliveries.js';
import { updateWeather } from '../simulation/weather.js';

/**
 * Get current date and day
 */
export const getCurrentDate = (runOutputDir) => tool({
  name: 'get_current_date',
  description: 'Get the current date and day number',
  parameters: z.object({}),
  execute: async () => {
    const state = loadState(runOutputDir);

    return {
      current_day: state.simulation.current_day,
      start_date: state.simulation.start_date,
      weather: state.simulation.weather,
      max_days: state.simulation.max_days,
      days_remaining: state.simulation.max_days - state.simulation.current_day,
    };
  },
});

/**
 * Advance to next day - triggers daily events
 */
export const waitForNextDay = (runOutputDir, products, consoleLogger, fileLogger) => tool({
  name: 'wait_for_next_day',
  description: 'Advance to the next day. This will trigger daily events: customer purchases, deliveries, daily fees. Use this when you are done with actions for the current day.',
  parameters: z.object({}),
  execute: async () => {
    const state = loadState(runOutputDir);

    // Check if already at max days
    if (state.simulation.current_day >= state.simulation.max_days) {
      return {
        success: false,
        error: 'Simulation has reached maximum number of days',
        current_day: state.simulation.current_day,
      };
    }

    // Advance day
    state.simulation.current_day += 1;
    const day = state.simulation.current_day;

    consoleLogger.section(`📅 DAY ${day} BEGINS`);
    consoleLogger.event(`Starting day ${day}`);

    // Update weather
    state.simulation.weather = updateWeather(state);

    // Apply daily fee (location rent/maintenance)
    const dailyFee = state.simulation.daily_fee || 0;
    if (dailyFee > 0) {
      addTransaction(state, 'expense', dailyFee, 'Daily location fee');
      consoleLogger.event(`Applied daily fee: $${dailyFee}`);
    }

    // Process deliveries (orders that have arrived)
    const deliveryResults = processDeliveries(state);
    for (const result of deliveryResults) {
      consoleLogger.event(result.message);
    }

    // Simulate customer purchases
    const purchaseResults = simulateCustomerPurchases(state, products);

    if (purchaseResults.units_sold > 0) {
      consoleLogger.event(`Customers purchased ${purchaseResults.units_sold} units for $${purchaseResults.revenue.toFixed(2)}`);
    }

    // Collect cash from machine if there's any
    if (state.vending_machine.cash_in_machine > 0) {
      const cashCollected = state.vending_machine.cash_in_machine;
      addTransaction(state, 'revenue', cashCollected, `Collected cash from vending machine on day ${day}`);
      state.vending_machine.cash_in_machine = 0;
      consoleLogger.event(`Collected $${cashCollected.toFixed(2)} from vending machine`);
    }

    // Save updated state
    saveState(runOutputDir, state);

    // Log daily summary
    const summary = {
      day,
      balance: state.finances.balance,
      units_sold: purchaseResults.units_sold,
      revenue: purchaseResults.revenue,
      deliveries_received: deliveryResults.length,
      weather: state.simulation.weather,
      inventory_count: state.vending_machine.inventory.reduce((sum, slot) => sum + slot.quantity, 0),
    };

    fileLogger.logDailySummary(day, summary);
    consoleLogger.daySummary(day, state.finances.balance, purchaseResults.units_sold, 0);

    return {
      success: true,
      day,
      weather: state.simulation.weather,
      balance: state.finances.balance,
      units_sold_today: purchaseResults.units_sold,
      revenue_today: purchaseResults.revenue,
      deliveries_received: deliveryResults.length,
      days_remaining: state.simulation.max_days - day,
      stockouts: purchaseResults.stockouts || [],
    };
  },
});
