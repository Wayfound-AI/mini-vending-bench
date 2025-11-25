/**
 * Weather system for the simulation
 */

const WEATHER_TYPES = ['sunny', 'cloudy', 'rainy', 'hot', 'cold'];

// Weather transition probabilities (simple Markov chain)
const WEATHER_TRANSITIONS = {
  sunny: { sunny: 0.6, cloudy: 0.2, hot: 0.15, cold: 0.05 },
  cloudy: { sunny: 0.3, cloudy: 0.4, rainy: 0.2, cold: 0.1 },
  rainy: { cloudy: 0.5, rainy: 0.3, sunny: 0.2 },
  hot: { hot: 0.5, sunny: 0.4, cloudy: 0.1 },
  cold: { cold: 0.5, cloudy: 0.3, sunny: 0.2 },
};

/**
 * Update weather for the next day
 * @param {object} state - Current state
 * @returns {string} New weather
 */
export function updateWeather(state) {
  const currentWeather = state.simulation.weather || 'sunny';
  const transitions = WEATHER_TRANSITIONS[currentWeather] || WEATHER_TRANSITIONS.sunny;

  // Use deterministic random based on day and seed
  const seed = (state.simulation.randomSeed || 42) + state.simulation.current_day;
  const random = seededRandom(seed);

  let cumulative = 0;
  for (const [weather, probability] of Object.entries(transitions)) {
    cumulative += probability;
    if (random < cumulative) {
      return weather;
    }
  }

  return currentWeather;
}

/**
 * Simple seeded random number generator
 * @param {number} seed - Seed value
 * @returns {number} Random number between 0 and 1
 */
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Get weather demand multiplier
 * @param {string} weather - Current weather
 * @returns {number} Multiplier for customer demand
 */
export function getWeatherDemandMultiplier(weather) {
  const multipliers = {
    sunny: 1.0,
    cloudy: 0.9,
    rainy: 0.7,
    hot: 1.3,  // People want more drinks when hot
    cold: 0.8,  // Fewer people out in cold weather
  };

  return multipliers[weather] || 1.0;
}
