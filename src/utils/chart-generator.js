import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Generate chart data from simulation data
 * Outputs JSON files that can be used to generate charts with any visualization library
 */
export async function generateCharts(runOutputDir) {
  // Read daily summaries
  const dailySummaryPath = join(runOutputDir, 'daily_summary.jsonl');
  const summaries = readJSONL(dailySummaryPath);

  if (summaries.length === 0) {
    console.warn('No daily summaries found, skipping chart data generation');
    return;
  }

  // Generate chart data files
  generateBalanceChartData(summaries, runOutputDir);
  generateUnitsSoldChartData(summaries, runOutputDir);
  generateFinancialChartData(summaries, runOutputDir);
}

/**
 * Read JSONL file
 */
function readJSONL(filepath) {
  try {
    const content = readFileSync(filepath, 'utf-8');
    return content
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line));
  } catch (error) {
    return [];
  }
}

/**
 * Generate balance over time chart data
 */
function generateBalanceChartData(summaries, runOutputDir) {
  const days = summaries.map(s => s.day);
  const balances = summaries.map(s => s.balance);

  const chartData = {
    title: 'Bank Balance Over Time',
    type: 'line',
    xAxis: {
      label: 'Day',
      data: days,
    },
    yAxis: {
      label: 'Balance ($)',
    },
    series: [
      {
        name: 'Bank Balance',
        data: balances,
      },
    ],
  };

  writeFileSync(
    join(runOutputDir, 'balance_chart_data.json'),
    JSON.stringify(chartData, null, 2),
    'utf-8'
  );
}

/**
 * Generate units sold chart data
 */
function generateUnitsSoldChartData(summaries, runOutputDir) {
  const days = summaries.map(s => s.day);
  const units = summaries.map(s => s.units_sold || 0);

  const chartData = {
    title: 'Daily Units Sold',
    type: 'bar',
    xAxis: {
      label: 'Day',
      data: days,
    },
    yAxis: {
      label: 'Units Sold',
    },
    series: [
      {
        name: 'Units Sold',
        data: units,
      },
    ],
  };

  writeFileSync(
    join(runOutputDir, 'units_sold_chart_data.json'),
    JSON.stringify(chartData, null, 2),
    'utf-8'
  );
}

/**
 * Generate revenue and expenses chart data
 */
function generateFinancialChartData(summaries, runOutputDir) {
  const days = summaries.map(s => s.day);
  const revenue = summaries.map(s => s.revenue || 0);

  // Calculate cumulative values
  let cumulativeRevenue = 0;
  const cumulativeRevenueData = revenue.map(r => {
    cumulativeRevenue += r;
    return cumulativeRevenue;
  });

  const chartData = {
    title: 'Revenue Over Time',
    type: 'line',
    xAxis: {
      label: 'Day',
      data: days,
    },
    yAxis: {
      label: 'Revenue ($)',
    },
    series: [
      {
        name: 'Cumulative Revenue',
        data: cumulativeRevenueData,
      },
      {
        name: 'Daily Revenue',
        data: revenue,
      },
    ],
  };

  writeFileSync(
    join(runOutputDir, 'revenue_chart_data.json'),
    JSON.stringify(chartData, null, 2),
    'utf-8'
  );
}
