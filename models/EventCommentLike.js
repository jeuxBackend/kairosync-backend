const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const EventCommentLike = sequelize.define("EventCommentLike", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  commentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "EventComments",
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
}, {
  timestamps: true, 
});

module.exports = EventCommentLike;
