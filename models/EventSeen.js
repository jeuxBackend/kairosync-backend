const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const EventSeen = sequelize.define("EventSeen", {
 id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "Events",
      key: "id",
    },
  },
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  lastViewedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true, 
});

module.exports = EventSeen;
