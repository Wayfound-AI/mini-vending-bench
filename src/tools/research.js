import { z } from 'zod';
import { tool } from '@openai/agents';

/**
 * Get available products that can be sold
 */
export const getAvailableProducts = (products) => tool({
  name: 'get_available_products',
  description: 'Get list of all products available for purchase from suppliers, including typical wholesale and retail prices',
  parameters: z.object({
    category: z.enum(['beverage', 'snack', 'all']).optional().nullable().describe('Filter by product category'),
  }),
  execute: async ({ category = 'all' }) => {
    let filtered = products;

    if (category !== 'all') {
      filtered = products.filter(p => p.category === category);
    }

    return {
      products: filtered.map(p => ({
        name: p.name,
        category: p.category,
        typical_wholesale: p.typical_wholesale,
        typical_retail: p.typical_retail,
        suggested_margin: ((p.typical_retail - p.typical_wholesale) / p.typical_wholesale * 100).toFixed(1) + '%',
      })),
      count: filtered.length,
    };
  },
});

/**
 * Search for suppliers
 */
export const searchSuppliers = (suppliers) => tool({
  name: 'search_suppliers',
  description: 'Search for suppliers and get their contact information and product offerings',
  parameters: z.object({
    product: z.string().optional().nullable().describe('Filter suppliers that carry this specific product'),
  }),
  execute: async ({ product }) => {
    let filtered = suppliers;

    if (product) {
      filtered = suppliers.filter(s =>
        s.products.some(p => p.toLowerCase().includes(product.toLowerCase()))
      );
    }

    return {
      suppliers: filtered.map(s => ({
        name: s.name,
        email: s.email,
        products: s.products,
        type: s.type,
        lead_time_days: s.lead_time_days,
        minimum_order: s.minimum_order,
      })),
      count: filtered.length,
    };
  },
});
