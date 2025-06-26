const User = require("./User");
const Event = require("./Event");
const EventInvite = require("./EventInvite");
const EventLike = require("./EventLike");
const EventComment = require("./EventComment");
const EventCommentLike = require("./EventCommentLike");
const InviteeTemplate = require("./InviteeTemplate");
const InviteeTemplateUser = require("./InviteeTemplateUser");
const EventSeen = require("./EventSeen");

// User has many events created by them
User.hasMany(Event, {
  foreignKey: "createdBy",
  as: "createdEvents",
});

Event.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

// Event invites
Event.belongsToMany(User, {
  through: EventInvite,
  as: "invitedUsers",
  foreignKey: "eventId",
  otherKey: "userId",
});

User.belongsToMany(Event, {
  through: EventInvite,
  as: "invitedEvents",
  foreignKey: "userId",
  otherKey: "eventId",
});

// Event likes
User.belongsToMany(Event, {
  through: EventLike,
  as: "likedEvents",
  foreignKey: "userId",
  otherKey: "eventId", // Added missing otherKey
});
Event.belongsToMany(User, {
  through: EventLike,
  as: "likes",
  foreignKey: "eventId",
  otherKey: "userId", // Added missing otherKey
});

// Comment belongs to a user and event
User.hasMany(EventComment, { foreignKey: "userId" });
EventComment.belongsTo(User, { foreignKey: "userId" });

Event.hasMany(EventComment, { foreignKey: "eventId" });
EventComment.belongsTo(Event, { foreignKey: "eventId" });

// Comment replies (self relation)
EventComment.hasMany(EventComment, {
  foreignKey: "parentCommentId",
  as: "replies",
});
EventComment.belongsTo(EventComment, {
  foreignKey: "parentCommentId",
  as: "parent",
});

// Likes
EventComment.belongsToMany(User, {
  through: EventCommentLike,
  as: "likedBy",
  foreignKey: "commentId",
  otherKey: "userId", 
});

User.belongsToMany(EventComment, {
  through: EventCommentLike,
  as: "likedComments",
  foreignKey: "userId",
  otherKey: "commentId", 
});

// Invitee templates
User.hasMany(InviteeTemplate, { foreignKey: "userId", as: "inviteeTemplates" });
InviteeTemplate.belongsTo(User, { foreignKey: "userId", as: "creator" });

// Invitee templates many-to-many with users
InviteeTemplate.belongsToMany(User, {
  through: InviteeTemplateUser,
  foreignKey: "templateId",
  otherKey: "userId",
  as: "users",
});

User.belongsToMany(InviteeTemplate, {
  through: InviteeTemplateUser,
  foreignKey: "userId",
  otherKey: "templateId",
  as: "includedInTemplates",
});

// Event seen tracking - CORRECTED
User.belongsToMany(Event, {
  through: EventSeen,
  as: "viewedEvents",
  foreignKey: "userId",
  otherKey: "eventId", 
});

Event.belongsToMany(User, {
  through: EventSeen,
  as: "viewedBy",
  foreignKey: "eventId",
  otherKey: "userId", 
});

module.exports = {
  User,
  Event,
  EventInvite,
  EventLike,
  EventComment,
  EventCommentLike,
  InviteeTemplate,
  InviteeTemplateUser,
  EventSeen
};