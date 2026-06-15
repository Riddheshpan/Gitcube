const mongoose = require("mongoose");

const boardSchema = new mongoose.Schema({
    id: { type: String, required: true }, // The provider's board/project ID
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    provider: { type: String, enum: ["jira", "trello", "github", "github_projects"], required: true },
    projectId: { type: String }, // Project key, owner, repository owner etc.
    lastSynced: { type: Date, default: Date.now },
    syncError: { type: String, default: null }
});

// Compound index to ensure uniqueness of a board per user and provider
boardSchema.index({ id: 1, user: 1, provider: 1 }, { unique: true });

module.exports = mongoose.models.Board || mongoose.model("Board", boardSchema);
