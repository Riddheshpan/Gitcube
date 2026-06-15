const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema({
    id: { type: String, required: true }, // Provider's card/issue ID or number
    boardId: { type: String, required: true }, // The board ID this card belongs to
    provider: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["backlog", "todo", "inprogress", "done"], default: "todo" },
    rawStatus: { type: String, default: "" },
    labels: [{ type: String }],
    assignees: [{
        name: { type: String },
        avatarUrl: { type: String }
    }],
    linkedPRs: [{ type: String }],
    updatedAt: { type: Date, default: Date.now }
});

// Ensure cards are unique per board and provider
cardSchema.index({ id: 1, boardId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.models.Card || mongoose.model("Card", cardSchema);
