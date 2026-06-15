const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["pr_review", "ci_failure", "merge_conflict", "mention", "other"], required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, default: false },
    provider: { type: String, enum: ["github", "gitlab"] },
    repoId: { type: String }, // e.g., "owner/repo" or gitlab project ID
    resourceId: { type: String }, // e.g., PR number, pipeline ID, or card ID
    createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
