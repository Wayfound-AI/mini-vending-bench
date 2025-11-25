# Mini Vending Bench

A JavaScript benchmark for testing long-term coherence and decision-making of AI agents through a simulated vending machine business.

Based on the [Vending-Bench](https://arxiv.org/abs/2412.18404) research, this benchmark evaluates AI agents' ability to:
- Manage finances and inventory over multiple days
- Navigate supplier relationships (honest, negotiation-focused, adversarial, unreliable)
- Make strategic pricing and product selection decisions
- Handle uncertainty in demand and supply chain
- Maintain long-term coherence across hundreds of interactions

## Features

- **🤖 Multi-Provider Support**: Test any LLM using Vercel AI SDK (OpenAI, Anthropic, Google, etc.)
- **📊 Comprehensive Logging**: JSONL logs for every action, detailed console output
- **📈 Chart Data Export**: JSON chart data for balance, sales, and revenue visualization
- **🎭 Realistic Simulation**: Weather effects, price elasticity, day-of-week demand variation
- **💼 Diverse Suppliers**: Honest, negotiation-required, adversarial, and unreliable supplier types
- **⚙️ Self-Contained**: Pure JavaScript, no native dependencies required

## Installation

### Prerequisites

- Node.js 22.0.0 or higher
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mini-vending-bench.git
cd mini-vending-bench
```

2. Install dependencies:
```bash
npm install
```

3. Create configuration file:
```bash
cp config.example.json config.json
```

4. Edit `config.json` with your API keys:
```json
{
  "agent": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "apiKey": "sk-ant-your-key-here"
  },
  "supplier": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "sk-your-openai-key-here"
  },
  "simulation": {
    "durationDays": 30,
    "startingBalance": 500,
    "dailyFee": 2,
    "bankruptcyThreshold": 10,
    "maxTurns": 2000,
    "randomSeed": 42
  }
}
```

## Usage

Run the benchmark:
```bash
npm start
```

The simulation will:
1. Initialize the vending machine business with starting capital
2. Run the AI agent to make decisions (order products, set prices, restock machine)
3. Simulate customer purchases based on pricing and availability
4. Track all transactions and events
5. Generate final score and chart data

## Configuration

### Agent Configuration
- **provider**: LLM provider (`openai`, `anthropic`, `google`)
- **model**: Model name (e.g., `claude-3-5-sonnet-20241022`, `gpt-4`)
- **apiKey**: Your API key for the provider

### Supplier Configuration
Suppliers are simulated using a separate LLM to generate realistic email responses.
- **provider**: LLM provider for supplier responses (`openai`, `anthropic`, `google`)
- **model**: Model name (default: `gpt-4o-mini`)
- **apiKey**: Your API key for supplier responses

### Simulation Parameters
- **durationDays**: Number of days to simulate (default: 30)
- **startingBalance**: Initial bank balance in dollars (default: 500)
- **dailyFee**: Daily location rent/maintenance fee (default: 2)
- **bankruptcyThreshold**: Minimum balance threshold (default: 10)
- **maxTurns**: Maximum agent actions before timeout (default: 2000)
- **randomSeed**: Seed for reproducible randomness (optional)

## Output

Each run creates a directory in `run_outputs/run_[timestamp]/` containing:

### Files
- **state.json**: Final simulation state
- **config.json**: Configuration used (API keys sanitized)
- **final_score.json**: Final metrics and score
- **messages.jsonl**: All agent messages
- **tool_calls.jsonl**: All tool calls and results
- **events.jsonl**: Simulation events
- **daily_summary.jsonl**: Daily performance summary
- **trace.txt**: Human-readable trace (if enabled)

### Chart Data
- **balance_chart_data.json**: Bank balance over time data
- **units_sold_chart_data.json**: Daily units sold data
- **revenue_chart_data.json**: Revenue over time data

These JSON files can be imported into any charting library (Chart.js, D3.js, Plotly, etc.) for visualization.

## Available Tools

The agent has access to these tools:

### Financial Tools
- `get_balance`: Check current bank balance and financial summary
- `view_transactions`: View transaction history with filters

### Time Tools
- `get_current_date`: Get current simulation day and weather
- `wait_for_next_day`: Advance to next day (triggers customer purchases and deliveries)

### Research Tools
- `get_available_products`: See all products with wholesale/retail prices
- `search_suppliers`: Find suppliers by product

### Email Tools
- `view_inbox`: View email inbox
- `read_email`: Read specific email
- `send_email`: Email suppliers (generates LLM-powered response)
- `place_order`: Place order with supplier (costs money)

### Inventory Tools
- `get_storage_inventory`: View warehouse inventory
- `check_deliveries`: Check pending and recent deliveries

### Vending Machine Tools
- `view_vending_machine`: See machine inventory and configuration
- `restock_machine`: Move products from warehouse to machine
- `set_price`: Change product prices
- `empty_slot`: Remove products from machine

## Supplier Types

The benchmark includes 4 types of suppliers with different behaviors:

### Honest Suppliers
- Fair, transparent pricing
- Reliable delivery
- Straightforward communication

### Negotiation-Focused Suppliers
- Start with higher prices
- Expect and reward negotiation
- Build relationships with regular customers

### Adversarial Suppliers
- Try to maximize profit at customer expense
- May use manipulative tactics
- Might have hidden fees or unclear terms

### Unreliable Suppliers
- Lowest prices
- Inconsistent service
- May have delays or quality issues

## Scoring

Agents are evaluated on:
- **Net Worth**: Final balance + inventory value + cash in machine
- **Profit**: Total revenue - total expenses
- **Units Sold**: Total customer purchases
- **Days Survived**: Number of days before bankruptcy or completion

## Architecture

### Two-Model System
- **Agent Model**: The LLM being tested (your choice of provider/model via Vercel AI SDK)
- **Supplier Model**: Generates realistic supplier responses (default: gpt-4o-mini)

This separation ensures:
- Consistent supplier behavior across different agent models
- Fair comparison between agents
- Realistic adversarial challenges

### State Management
- Single `state.json` file stores entire simulation state
- All tools read/write to centralized state
- Enables full reproducibility and analysis

### Simulation Engine
- **Price Elasticity**: Customers less likely to buy overpriced items
- **Weather Effects**: Hot days increase demand, rainy days decrease
- **Day-of-Week Variation**: Weekends have higher traffic
- **Variety Bonus**: More product types attract more customers

## Example Run

```bash
$ npm start

Mini Vending Bench - AI Agent Benchmark
✅ Configuration loaded
ℹ️  Loaded 16 products and 8 suppliers
ℹ️  Run ID: run_1703012345678
ℹ️  Output directory: /path/to/run_outputs/run_1703012345678
✅ Simulation initialized

Starting Simulation
🤖 [Agent] Turn 1
🔧 [Tool: search_suppliers] {}
✓  [search_suppliers] {"suppliers":[...]}
🤖 [Agent] Turn 2
🔧 [Tool: get_available_products] {}
...

📅 Day 1 Summary:
  💰 Balance: $450.50
  📦 Units Sold: 15
  🔨 Tool Calls: 8

...

Calculating Final Score
═══════════════════════════════════════
         FINAL RESULTS
═══════════════════════════════════════

  💰 Final Balance: $1,245.50
  💎 Net Worth: $1,450.75
  📦 Total Units Sold: 450
  📈 Total Revenue: $1,125.00
  📉 Total Expenses: $379.50
  📊 Profit: $745.50
  📅 Days Survived: 30
  🔄 Total Turns: 156

═══════════════════════════════════════

✅ Chart data generated
✅ Simulation complete! Results saved to: /path/to/run_outputs/run_1703012345678
```

## Development

### Project Structure
```
mini-vending-bench/
├── src/
│   ├── agent/              # Agent instructions
│   ├── logging/            # Console and file logging
│   ├── simulation/         # State management, purchases, deliveries
│   ├── suppliers/          # Supplier response generator
│   ├── tools/              # All agent tools
│   ├── utils/              # Config loader, chart generator
│   └── index.js            # Main entry point
├── data/
│   ├── products.json       # Product database
│   ├── suppliers.json      # Supplier database
│   └── supplier-prompts.js # Supplier system prompts
├── run_outputs/            # Generated run data
├── config.json             # Your configuration
├── config.example.json     # Configuration template
└── package.json
```

## Contributing

Contributions welcome! Areas for improvement:
- Additional supplier types
- More complex demand models
- Seasonal variations
- Marketing/advertising tools
- Machine maintenance events
- Competition from nearby machines

## License

MIT

## Citation

If you use this benchmark in your research, please cite:

```bibtex
@article{vendingbench2024,
  title={Vending-Bench: A Benchmark for Long-Term Coherence in AI Agents},
  author={[Original Authors]},
  journal={arXiv preprint arXiv:2412.18404},
  year={2024}
}
```

## Acknowledgments

Based on the Vending-Bench research paper. This is an independent JavaScript implementation using modern AI agent frameworks.
