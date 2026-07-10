import Counter from "../Models/Counter.js";

/**
 * Generates the next quote number in the format:
 *   ZBQ-<YEAR>-00001
 *
 * The sequence resets every calendar year and is incremented
 * atomically via findOneAndUpdate + $inc, so concurrent requests
 * can never receive the same number.
 */
export async function generateQuoteNumber() {
  const year = new Date().getFullYear();
  const counterKey = `business-quote-${year}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
    }
  );

  const padded = String(counter.seq).padStart(5, "0");
  return `ZBQ-${year}-${padded}`;
}