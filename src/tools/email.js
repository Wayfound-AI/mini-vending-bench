import { z } from 'zod';
import { tool } from '@openai/agents';
import { loadState, updateState, addTransaction } from '../simulation/state.js';

/**
 * View email inbox
 */
export const viewInbox = (runOutputDir) => tool({
  name: 'view_inbox',
  description: 'View your email inbox with recent messages',
  parameters: z.object({
    limit: z.number().int().positive().optional().nullable().describe('Number of recent emails to show (default: 20)'),
    unread_only: z.boolean().optional().nullable().describe('Show only unread emails'),
  }),
  execute: async ({ limit = 20, unread_only = false }) => {
    const state = loadState(runOutputDir);

    let emails = state.emails.inbox;

    if (unread_only) {
      emails = emails.filter(e => !e.read);
    }

    // Get most recent
    emails = emails.slice(-limit).reverse();

    return {
      emails: emails.map(e => ({
        email_id: e.email_id,
        from: e.from,
        subject: e.subject,
        received_day: e.received_day,
        read: e.read,
        preview: e.body.substring(0, 100) + (e.body.length > 100 ? '...' : ''),
      })),
      total_count: state.emails.inbox.length,
      unread_count: state.emails.inbox.filter(e => !e.read).length,
    };
  },
});

/**
 * Read a specific email
 */
export const readEmail = (runOutputDir) => tool({
  name: 'read_email',
  description: 'Read the full content of a specific email',
  parameters: z.object({
    email_id: z.number().int().positive().describe('Email ID to read'),
  }),
  execute: async ({ email_id }) => {
    const state = loadState(runOutputDir);

    const email = state.emails.inbox.find(e => e.email_id === email_id);

    if (!email) {
      return {
        success: false,
        error: `Email with ID ${email_id} not found`,
      };
    }

    // Mark as read
    email.read = true;
    updateState(runOutputDir, () => state);

    return {
      email_id: email.email_id,
      from: email.from,
      subject: email.subject,
      body: email.body,
      received_day: email.received_day,
      conversation_id: email.conversation_id,
    };
  },
});

/**
 * Send an email
 */
export const sendEmail = (runOutputDir, suppliers, supplierResponseGenerator, logger) => tool({
  name: 'send_email',
  description: 'Send an email to a supplier. You will receive a response in your inbox, usually within the same day.',
  parameters: z.object({
    to: z.string().email().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content'),
  }),
  execute: async ({ to, subject, body }) => {
    const state = loadState(runOutputDir);

    // Find supplier
    const supplier = suppliers.find(s => s.email === to);

    if (!supplier) {
      return {
        success: false,
        error: `No supplier found with email ${to}. Use search_suppliers tool to find valid supplier emails.`,
      };
    }

    // Create sent email record
    const sentEmail = {
      email_id: state.emails.sent.length + 1,
      to,
      subject,
      body,
      sent_day: state.simulation.current_day,
      timestamp: new Date().toISOString(),
    };

    state.emails.sent.push(sentEmail);

    // Get or create conversation
    let conversationId = Object.keys(state.emails.conversations).find(
      id => state.emails.conversations[id].supplier === supplier.name
    );

    if (!conversationId) {
      conversationId = `conv_${Object.keys(state.emails.conversations).length + 1}`;
      state.emails.conversations[conversationId] = {
        supplier: supplier.name,
        messages: [],
      };
    }

    // Add message to conversation
    state.emails.conversations[conversationId].messages.push({
      role: 'agent',
      content: body,
      subject,
      day: state.simulation.current_day,
    });

    logger.event(`Sent email to ${supplier.name}: "${subject}"`);
    console.log(`[Outgoing Email] To: ${supplier.name} (${to}) | Subject: "${subject}"`);

    // Generate supplier response (async, will arrive in inbox)
    const response = await supplierResponseGenerator.generateResponse(
      supplier,
      state.emails.conversations[conversationId],
      state
    );

    // Add response to inbox
    const responseEmail = {
      email_id: state.emails.inbox.length + 1,
      from: to,
      subject: response.subject,
      body: response.body,
      received_day: state.simulation.current_day,
      read: false,
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
    };

    state.emails.inbox.push(responseEmail);

    // Add response to conversation
    state.emails.conversations[conversationId].messages.push({
      role: 'supplier',
      content: response.body,
      subject: response.subject,
      day: state.simulation.current_day,
    });

    logger.event(`Received response from ${supplier.name}`);
    console.log(`[Incoming Email] From: ${supplier.name} (${to}) | Subject: "${response.subject}"`);

    updateState(runOutputDir, () => state);

    return {
      success: true,
      message: `Email sent to ${supplier.name}. Check your inbox for their response.`,
      sent_email_id: sentEmail.email_id,
      response_email_id: responseEmail.email_id,
    };
  },
});

/**
 * Place an order
 */
export const placeOrder = (runOutputDir, products, suppliers) => tool({
  name: 'place_order',
  description: 'Place an order with a supplier. This will charge your account and schedule delivery.',
  parameters: z.object({
    supplier_email: z.string().email().describe('Supplier email address'),
    items: z.array(z.object({
      product: z.string().describe('Product name'),
      quantity: z.number().int().positive().describe('Quantity to order'),
      price_per_unit: z.number().positive().describe('Agreed price per unit'),
    })).min(1).describe('List of items to order'),
  }),
  execute: async ({ supplier_email, items }) => {
    const state = loadState(runOutputDir);

    // Find supplier
    const supplier = suppliers.find(s => s.email === supplier_email);

    if (!supplier) {
      return {
        success: false,
        error: `No supplier found with email ${supplier_email}`,
      };
    }

    // Validate products
    for (const item of items) {
      const product = products.find(p => p.name === item.product);
      if (!product) {
        return {
          success: false,
          error: `Invalid product: ${item.product}`,
        };
      }

      if (!supplier.products.includes(item.product)) {
        return {
          success: false,
          error: `${supplier.name} does not carry ${item.product}`,
        };
      }
    }

    // Calculate total cost
    const totalCost = items.reduce(
      (sum, item) => sum + (item.quantity * item.price_per_unit),
      0
    );

    // Check if can afford
    if (state.finances.balance < totalCost) {
      return {
        success: false,
        error: `Insufficient funds. Cost: $${totalCost.toFixed(2)}, Balance: $${state.finances.balance.toFixed(2)}`,
      };
    }

    // Check minimum order
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems < supplier.minimum_order) {
      return {
        success: false,
        error: `Order does not meet minimum of ${supplier.minimum_order} units. Your order: ${totalItems} units`,
      };
    }

    // Create order
    const order = {
      order_id: state.orders.next_order_id++,
      supplier: supplier.name,
      supplier_email,
      items,
      total_cost: totalCost,
      order_day: state.simulation.current_day,
      delivery_day: state.simulation.current_day + supplier.lead_time_days,
      status: 'pending',
    };

    state.orders.pending.push(order);

    // Charge account
    addTransaction(
      state,
      'expense',
      totalCost,
      `Order #${order.order_id} from ${supplier.name}`
    );

    updateState(runOutputDir, () => state);

    return {
      success: true,
      order_id: order.order_id,
      supplier: supplier.name,
      total_cost: totalCost,
      delivery_day: order.delivery_day,
      days_until_delivery: supplier.lead_time_days,
      message: `Order placed successfully. Delivery expected on day ${order.delivery_day}`,
    };
  },
});
