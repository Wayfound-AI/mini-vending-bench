import { generateText } from 'ai';
import { getSupplierPrompt } from '../../data/supplier-prompts.js';

/**
 * Supplier response generator using LLM
 */
export class SupplierResponseGenerator {
  constructor(model, products) {
    this.model = model;
    this.products = products;
  }

  /**
   * Generate supplier response to agent's email
   * @param {object} supplier - Supplier info
   * @param {object} conversation - Conversation history
   * @param {object} state - Current simulation state
   * @returns {object} Response email
   */
  async generateResponse(supplier, conversation, state) {
    const systemPrompt = this.buildSystemPrompt(supplier, state);
    const conversationHistory = this.buildConversationHistory(conversation);

    console.log(`[Supplier Response] Generating response for ${supplier.name}...`);

    try {
      const result = await generateText({
        model: this.model,
        system: systemPrompt,
        prompt: conversationHistory,
        maxTokens: 10000, // Increased for reasoning models (reasoning tokens + output tokens)
      });


      const text = result.text;
      if (!text || text.trim().length === 0) {
        console.error(`[Supplier Response] Empty text returned for ${supplier.name}`);
        throw new Error('Empty response from LLM');
      }

      // Parse response to extract subject and body
      const { subject, body } = this.parseResponse(text, conversation);

      return { subject, body };
    } catch (error) {
      console.error(`[Supplier Response] Error generating response for ${supplier.name}:`, error.message);

      // Fallback response
      return {
        subject: `Re: ${conversation.messages[conversation.messages.length - 1].subject}`,
        body: 'Thank you for your email. We will review your inquiry and get back to you shortly.\n\nBest regards,\n' + supplier.name,
      };
    }
  }

  /**
   * Build system prompt for the supplier
   */
  buildSystemPrompt(supplier, state) {
    const basePrompt = getSupplierPrompt(supplier.type);

    const context = `
SUPPLIER INFORMATION:
- Name: ${supplier.name}
- Type: ${supplier.type}
- Products: ${supplier.products.join(', ')}
- Lead Time: ${supplier.lead_time_days} days
- Minimum Order: ${supplier.minimum_order} units
- Personality: ${supplier.personality}

PRODUCT PRICING REFERENCE:
${this.getProductPricingInfo(supplier)}

CURRENT SITUATION:
- Current Day: ${state.simulation.current_day}
- Customer's Balance: Unknown to you (don't mention)
- Weather: ${state.simulation.weather}

Remember: You don't know the customer's financial situation. Focus on your products and business relationship.`;

    return basePrompt + '\n\n' + context;
  }

  /**
   * Get product pricing info for supplier
   */
  getProductPricingInfo(supplier) {
    const relevantProducts = this.products.filter(p =>
      supplier.products.includes(p.name)
    );

    return relevantProducts
      .map(p => `- ${p.name}: Typical wholesale $${p.typical_wholesale.toFixed(2)}, Typical retail $${p.typical_retail.toFixed(2)}`)
      .join('\n');
  }

  /**
   * Build conversation history for context
   */
  buildConversationHistory(conversation) {
    const messages = conversation.messages.slice(-5); // Last 5 messages for context

    let history = 'CONVERSATION HISTORY:\n\n';

    for (const msg of messages) {
      if (msg.role === 'agent') {
        history += `CUSTOMER EMAIL:\nSubject: ${msg.subject}\n${msg.content}\n\n`;
      } else {
        history += `YOUR PREVIOUS RESPONSE:\nSubject: ${msg.subject}\n${msg.content}\n\n`;
      }
    }

    history += '\nRespond to the customer\'s most recent email. Write a complete email with appropriate greeting and sign-off. Be natural and realistic.';

    return history;
  }

  /**
   * Parse LLM response to extract subject and body
   */
  parseResponse(text, conversation) {
    // Try to extract subject if specified
    const subjectMatch = text.match(/^Subject:\s*(.+?)$/m);

    let subject;
    let body;

    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      // Remove the subject line from body
      body = text.replace(/^Subject:.+$/m, '').trim();
    } else {
      // Generate subject from last message
      const lastSubject = conversation.messages[conversation.messages.length - 1].subject;
      subject = lastSubject.startsWith('Re:') ? lastSubject : `Re: ${lastSubject}`;
      body = text.trim();
    }

    return { subject, body };
  }
}
