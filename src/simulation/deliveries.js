/**
 * Process deliveries - orders that have arrived
 */

/**
 * Process deliveries for the current day
 * @param {object} state - Current state
 * @returns {array} Array of delivery results
 */
export function processDeliveries(state) {
  const results = [];
  const currentDay = state.simulation.current_day;

  // Find orders that should arrive today
  const arrivingOrders = state.orders.pending.filter(
    order => order.delivery_day <= currentDay
  );

  for (const order of arrivingOrders) {
    // Add items to storage
    for (const item of order.items) {
      const existingItem = state.storage.inventory.find(
        inv => inv.product === item.product
      );

      if (existingItem) {
        existingItem.quantity += item.quantity;
      } else {
        state.storage.inventory.push({
          product: item.product,
          quantity: item.quantity,
        });
      }
    }

    // Move order to completed
    state.orders.completed.push({
      ...order,
      delivered_day: currentDay,
    });

    results.push({
      order_id: order.order_id,
      supplier: order.supplier,
      items: order.items,
      message: `Delivery received from ${order.supplier}: ${order.items.map(i => `${i.quantity}x ${i.product}`).join(', ')}`,
    });
  }

  // Remove delivered orders from pending
  state.orders.pending = state.orders.pending.filter(
    order => order.delivery_day > currentDay
  );

  return results;
}
