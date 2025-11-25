import { z } from 'zod';
import { tool } from '@openai/agents';
import { loadState, updateState } from '../simulation/state.js';

/**
 * View vending machine status
 */
export const viewVendingMachine = (runOutputDir) => tool({
  name: 'view_vending_machine',
  description: 'View the current vending machine inventory, prices, and configuration',
  parameters: z.object({}),
  execute: async () => {
    const state = loadState(runOutputDir);

    const inventory = state.vending_machine.inventory.map(slot => ({
      row: slot.row,
      column: slot.column,
      product: slot.product,
      quantity: slot.quantity,
      price: slot.price,
      capacity: slot.capacity || 10,
    }));

    return {
      location: state.vending_machine.location,
      rows: state.vending_machine.rows,
      slots_per_row: state.vending_machine.slots_per_row,
      total_slots: state.vending_machine.rows * state.vending_machine.slots_per_row,
      inventory,
      filled_slots: inventory.length,
      empty_slots: (state.vending_machine.rows * state.vending_machine.slots_per_row) - inventory.length,
      total_units: inventory.reduce((sum, slot) => sum + slot.quantity, 0),
      cash_in_machine: state.vending_machine.cash_in_machine,
      total_sales: state.vending_machine.total_sales,
      units_sold: state.vending_machine.units_sold,
    };
  },
});

/**
 * Restock vending machine from storage
 */
export const restockMachine = (runOutputDir) => tool({
  name: 'restock_machine',
  description: 'Move products from storage warehouse to vending machine. Each slot can hold up to 10 units.',
  parameters: z.object({
    product: z.string().describe('Product name to restock'),
    row: z.number().int().min(1).max(4).describe('Row number (1-4)'),
    column: z.number().int().min(1).max(3).describe('Column number (1-3)'),
    quantity: z.number().int().positive().describe('Number of units to restock'),
    price: z.number().positive().describe('Price to charge per unit'),
  }),
  execute: async ({ product, row, column, quantity, price }) => {
    const state = loadState(runOutputDir);

    // Validate row and column
    if (row < 1 || row > state.vending_machine.rows) {
      return {
        success: false,
        error: `Invalid row ${row}. Must be between 1 and ${state.vending_machine.rows}`,
      };
    }

    if (column < 1 || column > state.vending_machine.slots_per_row) {
      return {
        success: false,
        error: `Invalid column ${column}. Must be between 1 and ${state.vending_machine.slots_per_row}`,
      };
    }

    // Check if product is in storage
    const storageItem = state.storage.inventory.find(item => item.product === product);

    if (!storageItem || storageItem.quantity < quantity) {
      return {
        success: false,
        error: `Not enough ${product} in storage. Available: ${storageItem?.quantity || 0}, Requested: ${quantity}`,
      };
    }

    // Check slot capacity
    const slotCapacity = 10;
    const existingSlot = state.vending_machine.inventory.find(
      s => s.row === row && s.column === column
    );

    if (existingSlot) {
      // Slot already has product
      if (existingSlot.product !== product) {
        return {
          success: false,
          error: `Slot ${row}-${column} already contains ${existingSlot.product}. Remove it first or choose a different slot.`,
        };
      }

      const availableSpace = slotCapacity - existingSlot.quantity;
      if (quantity > availableSpace) {
        return {
          success: false,
          error: `Slot ${row}-${column} can only fit ${availableSpace} more units. Current: ${existingSlot.quantity}/${slotCapacity}`,
        };
      }

      // Update existing slot
      existingSlot.quantity += quantity;
      existingSlot.price = price; // Update price
    } else {
      // Create new slot
      if (quantity > slotCapacity) {
        return {
          success: false,
          error: `Cannot add ${quantity} units. Maximum slot capacity is ${slotCapacity}`,
        };
      }

      state.vending_machine.inventory.push({
        row,
        column,
        product,
        quantity,
        price,
        capacity: slotCapacity,
      });
    }

    // Remove from storage
    storageItem.quantity -= quantity;
    if (storageItem.quantity === 0) {
      state.storage.inventory = state.storage.inventory.filter(
        item => item.product !== product
      );
    }

    updateState(runOutputDir, () => state);

    return {
      success: true,
      message: `Restocked ${quantity} units of ${product} in slot ${row}-${column} at $${price.toFixed(2)} each`,
      slot: { row, column, product, quantity, price },
    };
  },
});

/**
 * Set price for a product in the vending machine
 */
export const setPrice = (runOutputDir) => tool({
  name: 'set_price',
  description: 'Change the price for a product in the vending machine',
  parameters: z.object({
    row: z.number().int().min(1).max(4).describe('Row number (1-4)'),
    column: z.number().int().min(1).max(3).describe('Column number (1-3)'),
    price: z.number().positive().describe('New price per unit'),
  }),
  execute: async ({ row, column, price }) => {
    const state = loadState(runOutputDir);

    const slot = state.vending_machine.inventory.find(
      s => s.row === row && s.column === column
    );

    if (!slot) {
      return {
        success: false,
        error: `No product found in slot ${row}-${column}`,
      };
    }

    const oldPrice = slot.price;
    slot.price = price;

    updateState(runOutputDir, () => state);

    return {
      success: true,
      message: `Updated price for ${slot.product} in slot ${row}-${column} from $${oldPrice.toFixed(2)} to $${price.toFixed(2)}`,
      product: slot.product,
      old_price: oldPrice,
      new_price: price,
    };
  },
});

/**
 * Empty a slot in the vending machine (move back to storage)
 */
export const emptySlot = (runOutputDir) => tool({
  name: 'empty_slot',
  description: 'Remove all products from a vending machine slot and return them to storage',
  parameters: z.object({
    row: z.number().int().min(1).max(4).describe('Row number (1-4)'),
    column: z.number().int().min(1).max(3).describe('Column number (1-3)'),
  }),
  execute: async ({ row, column }) => {
    const state = loadState(runOutputDir);

    const slotIndex = state.vending_machine.inventory.findIndex(
      s => s.row === row && s.column === column
    );

    if (slotIndex === -1) {
      return {
        success: false,
        error: `No product found in slot ${row}-${column}`,
      };
    }

    const slot = state.vending_machine.inventory[slotIndex];

    // Return to storage
    const storageItem = state.storage.inventory.find(
      item => item.product === slot.product
    );

    if (storageItem) {
      storageItem.quantity += slot.quantity;
    } else {
      state.storage.inventory.push({
        product: slot.product,
        quantity: slot.quantity,
      });
    }

    // Remove from machine
    state.vending_machine.inventory.splice(slotIndex, 1);

    updateState(runOutputDir, () => state);

    return {
      success: true,
      message: `Removed ${slot.quantity} units of ${slot.product} from slot ${row}-${column} and returned to storage`,
      product: slot.product,
      quantity: slot.quantity,
    };
  },
});
