import mongoose from "mongoose";

/**
 * Generic atomic counter, used to safely auto-increment
 * sequence numbers (e.g. quote numbers) even under concurrent requests.
 *
 * _id is the counter "key", e.g. "business-quote-2026"
 */
const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

const Counter = mongoose.model("Counter", counterSchema);

export default Counter;