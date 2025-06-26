const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const InviteeTemplate = sequelize.define("InviteeTemplate", {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  timestamps: true,
});


module.exports = InviteeTemplate;
