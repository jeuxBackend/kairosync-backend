"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("EventCommentLikes", {
       id: {
         type: Sequelize.UUID,
         defaultValue: Sequelize.UUIDV4,
         primaryKey: true,
       },
       commentId: {
         type: Sequelize.UUID,
         allowNull: false,
         references: {
           model: "EventComments",
           key: "id",
         },
       },
       userId: {
         type: Sequelize.UUID,
         allowNull: false,
         references: {
           model: "Users",
           key: "id",
         },
       },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("EventCommentLikes");
  },
};
