import { readFileSync } from 'fs';
import { z } from 'zod';

// Zod schema for supervisor configuration
// Both static and MCP can be present - CLI argument determines which to use
const SupervisorSchema = z.object({
  staticGuidelines: z.array(z.string().min(1)).length(5).optional(),
  mcpServer: z.object({
    url: z.string().url(),
    bearerToken: z.string().min(1),
    supervisorAgentId: z.string().min(1),
    description: z.string().min(1),
  }).optional(),
});

// Zod schema for configuration validation
// Only OpenAI models are supported
const ConfigSchema = z.object({
  agent: z.object({
    model: z.string(),
    apiKey: z.string().min(1, 'Agent API key is required'),
  }),
  simulation: z.object({
    durationDays: z.number().int().positive(),
    startingBalance: z.number().positive(),
    dailyFee: z.number().nonnegative(),
    bankruptcyThreshold: z.number().int().positive(),
    maxTurns: z.number().int().positive(),
    randomSeed: z.number().int().optional(),
  }),
  supplier: z.object({
    model: z.string(),
    apiKey: z.string().min(1, 'Supplier API key is required'),
  }),
  features: z.object({
    adversarialSuppliers: z.boolean(),
    negotiation: z.boolean(),
    supplyChainIssues: z.boolean(),
  }),
  supervisor: SupervisorSchema.optional(),
});

/**
 * Load and validate configuration from config.json
 * @param {string} configPath - Path to config file
 * @returns {object} Validated configuration
 */
export function loadConfig(configPath = './config.json') {
  try {
    const configFile = readFileSync(configPath, 'utf-8');
    const configData = JSON.parse(configFile);

    // Validate with Zod
    const config = ConfigSchema.parse(configData);

    console.log('✅ Configuration loaded and validated successfully');
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ Config file not found:', configPath);
      console.error('   Copy config.example.json to config.json and update with your API keys');
      process.exit(1);
    }

    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }

    console.error('❌ Error loading configuration:', error.message);
    process.exit(1);
  }
}
