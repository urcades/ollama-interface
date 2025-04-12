/**
 * Weather tool implementation
 */

// Get current weather implementation
export const getCurrentWeather = async (args) => {
  const location = args.location || "Unknown";
  const format = args.format || "celsius";

  return {
    status: "success",
    location: location,
    temperature:
      format === "celsius"
        ? Math.floor(15 + Math.random() * 15)
        : Math.floor(60 + Math.random() * 30),
    unit: format === "celsius" ? "°C" : "°F",
    condition: ["Sunny", "Partly Cloudy", "Cloudy", "Rainy", "Stormy"][
      Math.floor(Math.random() * 5)
    ],
    humidity: Math.floor(40 + Math.random() * 50),
    wind_speed: Math.floor(5 + Math.random() * 20),
    forecast:
      "This is simulated weather data. In a real application, this would connect to a weather API.",
  };
};

export default getCurrentWeather;
