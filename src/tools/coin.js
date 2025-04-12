/**
 * Coin flip tool implementation
 */

// Coin flip implementation
export const flipCoin = async (args) => {
  const numFlips = args.flips || 1;
  const maxFlips = Math.min(numFlips, 100); // Enforce maximum

  // Generate random coin flips
  const results = [];
  for (let i = 0; i < maxFlips; i++) {
    results.push(Math.random() < 0.5 ? "heads" : "tails");
  }

  return {
    status: "success",
    flips: maxFlips,
    results: results,
    summary:
      numFlips === 1
        ? `The coin landed on ${results[0]}.`
        : `You flipped ${
            results.filter((r) => r === "heads").length
          } heads and ${results.filter((r) => r === "tails").length} tails.`,
  };
};

export default flipCoin;
