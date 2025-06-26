const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const InviteeTemplateUser = sequelize.define("InviteeTemplateUser", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  templateId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "InviteeTemplates",
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


module.exports = InviteeTemplateUser;
