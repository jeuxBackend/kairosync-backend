const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const EventInvite = sequelize.define(
  "EventInvite",
  {
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
    status: {
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
      defaultValue: "pending",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    seen: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    attended: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    joinedManually: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = EventInvite;
