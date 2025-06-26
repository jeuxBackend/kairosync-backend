const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const EventLike = sequelize.define("EventLike", {
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
}, {
  timestamps: true, 
});

module.exports = EventLike;
