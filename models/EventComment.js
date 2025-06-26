const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const EventComment = sequelize.define("EventComment", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "Events",
      key: "id",
    },
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  parentCommentId: {
    type: DataTypes.UUID,
    allowNull: true, 
    references: {
      model: "EventComments",
      key: "id",
    },
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  timestamps: true,
});

module.exports = EventComment;
