import { addTransaction } from './state.js';
import { getWeatherDemandMultiplier } from './weather.js';

/**
 * Simulate customer purchases for the day
 * @param {object} state - Current state
 * @param {array} products - Product database
 * @returns {object} Purchase results
 */
export function simulateCustomerPurchases(state, products) {
  const results = {
    units_sold: 0,
    revenue: 0,
    stockouts: [],
  };

  // No sales if no inventory
  if (state.vending_machine.inventory.length === 0) {
    return results;
  }

  // Calculate base demand (customers per day)
  const baseDemand = calculateBaseDemand(state);

  // Apply weather multiplier
  const weatherMultiplier = getWeatherDemandMultiplier(state.simulation.weather);

  // Calculate actual number of customers
  const numCustomers = Math.round(baseDemand * weatherMultiplier);

  // Simulate each customer
  for (let i = 0; i < numCustomers; i++) {
    const purchase = simulateSingleCustomer(state, products);

    if (purchase.purchased) {
      results.units_sold += 1;
      results.revenue += purchase.price;

      // Update inventory
      const slot = state.vending_machine.inventory.find(
        s => s.product === purchase.product && s.quantity > 0
      );

      if (slot) {
        slot.quantity -= 1;
        state.vending_machine.cash_in_machine += purchase.price;
        state.vending_machine.total_sales += purchase.price;
        state.vending_machine.units_sold += 1;
      }
    } else if (purchase.stockout) {
      results.stockouts.push(purchase.product);
    }
  }

  // Don't record transaction here - it will be recorded when cash is collected from machine
  // The cash stays in cash_in_machine until wait_for_next_day collects it

  // Deduplicate stockouts
  results.stockouts = [...new Set(results.stockouts)];

  return results;
}

/**
 * Calculate base demand (customers per day)
 * @param {object} state - Current state
 * @returns {number} Number of customers
 */
function calculateBaseDemand(state) {
  // Base traffic at this location
  const baseTraffic = 50;

  // Day of week multiplier (weekend vs weekday)
  const dayOfWeek = state.simulation.current_day % 7;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dayMultiplier = isWeekend ? 1.3 : 1.0;

  // Variety bonus (more products = more appeal)
  const uniqueProducts = new Set(
    state.vending_machine.inventory.map(s => s.product)
  ).size;
  const varietyMultiplier = Math.min(1.0 + (uniqueProducts * 0.1), 2.0);

  return Math.round(baseTraffic * dayMultiplier * varietyMultiplier);
}

/**
 * Simulate a single customer purchase decision
 * @param {object} state - Current state
 * @param {array} products - Product database
 * @returns {object} Purchase result
 */
function simulateSingleCustomer(state, products) {
  // Get available products (in stock)
  const available = state.vending_machine.inventory.filter(s => s.quantity > 0);

  if (available.length === 0) {
    return { purchased: false, stockout: true };
  }

  // Customer has preferences - weighted random selection
  const selection = weightedRandomSelection(available, products);

  if (!selection) {
    return { purchased: false };
  }

  // Check if customer accepts the price (price elasticity)
  const product = products.find(p => p.name === selection.product);
  const acceptPrice = evaluatePriceAcceptance(selection.price, product);

  if (acceptPrice) {
    return {
      purchased: true,
      product: selection.product,
      price: selection.price,
    };
  }

  return { purchased: false };
}

/**
 * Weighted random selection of product based on popularity
 * @param {array} available - Available inventory slots
 * @param {array} products - Product database
 * @returns {object} Selected slot or null
 */
function weightedRandomSelection(available, products) {
  // Assign weights based on product popularity
  const weights = available.map(slot => {
    const product = products.find(p => p.name === slot.product);
    return product?.category === 'beverage' ? 1.0 : 0.7; // Simple popularity model
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < available.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      return available[i];
    }
  }

  return available[0];
}

/**
 * Evaluate if customer accepts the price (price elasticity)
 * @param {number} actualPrice - Price in vending machine
 * @param {object} product - Product info
 * @returns {boolean} Whether customer purchases
 */
function evaluatePriceAcceptance(actualPrice, product) {
  if (!product) return false;

  const typicalRetail = product.typical_retail;
  const priceRatio = actualPrice / typicalRetail;

  // Price elasticity model
  // priceRatio = 1.0 (typical): 80% acceptance
  // priceRatio = 0.8 (discount): 95% acceptance
  // priceRatio = 1.2 (premium): 60% acceptance
  // priceRatio = 1.5 (expensive): 30% acceptance

  let acceptanceRate;
  if (priceRatio <= 0.8) {
    acceptanceRate = 0.95;
  } else if (priceRatio <= 1.0) {
    acceptanceRate = 0.80 + (1.0 - priceRatio) * 0.75; // 0.8 to 0.95
  } else if (priceRatio <= 1.2) {
    acceptanceRate = 0.80 - (priceRatio - 1.0) * 1.0; // 0.8 to 0.6
  } else if (priceRatio <= 1.5) {
    acceptanceRate = 0.60 - (priceRatio - 1.2) * 1.0; // 0.6 to 0.3
  } else {
    acceptanceRate = Math.max(0.1, 0.3 - (priceRatio - 1.5) * 0.2);
  }

  return Math.random() < acceptanceRate;
}
