import { z } from 'zod';
import { tool } from '@openai/agents';
import { loadState } from '../simulation/state.js';

/**
 * Get storage inventory
 */
export const getStorageInventory = (runOutputDir) => tool({
  name: 'get_storage_inventory',
  description: 'View the inventory in your storage warehouse. This is separate from the vending machine inventory.',
  parameters: z.object({}),
  execute: async () => {
    const state = loadState(runOutputDir);

    return {
      inventory: state.storage.inventory,
      total_items: state.storage.inventory.reduce((sum, item) => sum + item.quantity, 0),
      unique_products: state.storage.inventory.length,
    };
  },
});

/**
 * Check pending deliveries
 */
export const checkDeliveries = (runOutputDir) => tool({
  name: 'check_deliveries',
  description: 'Check the status of pending deliveries and when they will arrive',
  parameters: z.object({}),
  execute: async () => {
    const state = loadState(runOutputDir);

    const pending = state.orders.pending.map(order => ({
      order_id: order.order_id,
      supplier: order.supplier,
      items: order.items,
      order_day: order.order_day,
      delivery_day: order.delivery_day,
      days_until_arrival: order.delivery_day - state.simulation.current_day,
      total_cost: order.total_cost,
    }));

    const recentCompleted = state.orders.completed
      .slice(-5)
      .map(order => ({
        order_id: order.order_id,
        supplier: order.supplier,
        items: order.items,
        delivered_day: order.delivered_day,
      }));

    return {
      pending_deliveries: pending,
      pending_count: pending.length,
      recent_completed: recentCompleted,
    };
  },
});
