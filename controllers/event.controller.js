const { Op, literal, fn, col } = require("sequelize");
const {sequelize} = require("../config/database");
const {
  Event,
  EventInvite,
  EventLike,
  EventComment,
  EventCommentLike,
  InviteeTemplate,
  InviteeTemplateUser,
  User,
  EventSeen,
} = require("../models/index");
const { structureComments } = require("../utils/structureComment");

// Event Management
const createEvent =  async (req, res) => {
  try {
    const {
      name, location, lat, lng, visibility, capacity, additionalNotes,
      startDate, endDate, startTime, endTime, inviteUserIds = [], templateId,
    } = req.body;
    const userId = req.user.userId;
    const baseUrl = process.env.BASE_URL || "http://localhost:5000";

    // Early validations
    let validatedCapacity = null;
    if (visibility !== "private" && capacity !== null && capacity !== undefined) {
      const capacityNum = Number(capacity);
      if (isNaN(capacityNum) || !Number.isInteger(capacityNum) || capacityNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Capacity must be null (unlimited) or a positive integer (1, 2, 3, etc.)",
        });
      }
      validatedCapacity = capacityNum;
    }

    const coverPic = req.file ? `${baseUrl}/uploads/events/${req.file.filename}` : null;

    // Optimize user ID collection with single query approach
    let allInviteUserIds = [...inviteUserIds];
    
    if (templateId) {
      // Get template users more efficiently
      const templateUsers = await User.findAll({
        include: [{
          model: InviteeTemplate,
          as: 'inviteeTemplates', // Adjust based on your association
          where: { id: templateId, userId },
          attributes: []
        }],
        attributes: ['id'],
        raw: true
      });
      
      const templateUserIds = templateUsers.map(user => user.id);
      allInviteUserIds = [...new Set([...allInviteUserIds, ...templateUserIds])];
    }

    // Early capacity check
    if (visibility !== "private" && validatedCapacity && allInviteUserIds.length > validatedCapacity) {
      return res.status(400).json({
        success: false,
        message: `Cannot invite ${allInviteUserIds.length} users. Event capacity is limited to ${validatedCapacity}.`,
      });
    }

    // Single transaction with minimal queries
    const result = await sequelize.transaction(async (t) => {
      // Create event
      const event = await Event.create({
        name, location, lat, lng, coverPic,
        visibility: visibility || "public",
        capacity: validatedCapacity,
        additionalNotes, startDate, endDate, startTime, endTime,
        createdBy: userId,
      }, { transaction: t });

      // Handle invitations efficiently
      if (allInviteUserIds.length > 0) {
        // Validate and create invitations in one go
        const validUserIds = await User.findAll({
          where: { id: allInviteUserIds },
          attributes: ['id'],
          raw: true,
          transaction: t
        }).then(users => users.map(u => u.id));

        if (validUserIds.length > 0) {
          await EventInvite.bulkCreate(
            validUserIds.map(userId => ({
              eventId: event.id,
              userId,
              status: "pending",
              joinedManually: false,
            })),
            { transaction: t, ignoreDuplicates: true }
          );
        }
      }

      return event;
    });

    // Return minimal response for speed (fetch full details only if needed)
    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: {
        id: result.id,
        name: result.name,
        // Add other essential fields as needed
      }
    });

  } catch (error) {
    console.error("Create event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create event",
      error: error.message,
    });
  }
};

const getEvents = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      type = "public", // public, hosted, invited, upcoming, all
      page = 1,
      limit = 10,
      search,
      filter,
      userLat,
      userLng,
      eventDate,
      sortBy,
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;
    let whereCondition = {};
    let orderCondition = [["createdAt", "DESC"]];

    const baseIncludes = [
      {
        model: User,
        as: "creator",
        attributes: ["id", "name", "phoneNumber", "profilePicture"],
      },
      {
        model: User,
        as: "likes",
        attributes: ["id", "name", "phoneNumber", "profilePicture"],
        through: { attributes: [] },
      },
    ];

    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { location: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    switch (filter) {
      case "recommended":
        if (type === "public" || !type) {
          whereCondition.visibilty = "public";
          orderCondition = [
            [
              literal(`(
                (SELECT COUNT(*) FROM "EventLikes" WHERE "EventLikes"."eventId" = "Event"."id") +
                (SELECT COUNT(*) FROM "EventComments" WHERE "EventComments"."eventId" = "Event"."id")
              )`),
              "DESC",
            ],
            ["createdAt", "DESC"],
          ];
        }
        break;

      case "recent":
        orderCondition = [
          ["eventDate", "DESC"],
          ["createdAt", "DESC"],
        ];
        break;

      case "distant":
        whereCondition.eventDate = { [Op.gte]: new Date() };
        orderCondition = [
          ["eventDate", "ASC"],
          ["createdAt", "DESC"],
        ];
        break;

      case "nearest":
        if (userLat && userLng) {
          orderCondition = [
            [
              literal(`(
                6371 * acos(
                  cos(radians(${parseFloat(userLat)})) * 
                  cos(radians(CAST(SPLIT_PART("Event"."coordinates", ',', 1) AS FLOAT))) * 
                  cos(radians(CAST(SPLIT_PART("Event"."coordinates", ',', 2) AS FLOAT)) - radians(${parseFloat(userLng)})) + 
                  sin(radians(${parseFloat(userLat)})) * 
                  sin(radians(CAST(SPLIT_PART("Event"."coordinates", ',', 1) AS FLOAT)))
                )
              )`),
              "ASC",
            ],
            ["createdAt", "DESC"],
          ];
          whereCondition.coordinates = { [Op.ne]: null };
        }
        break;

      case "farthest":
        if (userLat && userLng) {
          orderCondition = [
            [
              literal(`(
                6371 * acos(
                  cos(radians(${parseFloat(userLat)})) * 
                  cos(radians(CAST(SPLIT_PART("Event"."coordinates", ',', 1) AS FLOAT))) * 
                  cos(radians(CAST(SPLIT_PART("Event"."coordinates", ',', 2) AS FLOAT)) - radians(${parseFloat(userLng)})) + 
                  sin(radians(${parseFloat(userLat)})) * 
                  sin(radians(CAST(SPLIT_PART("Event"."coordinates", ',', 1) AS FLOAT)))
                )
              )`),
              "DESC",
            ],
            ["createdAt", "DESC"],
          ];
          whereCondition.coordinates = { [Op.ne]: null };
        }
        break;

      default:
        if (sortBy) {
          orderCondition = [
            [sortBy, sortOrder.toUpperCase()],
            ["createdAt", "DESC"],
          ];
        }
        break;
    }

    let events;
    switch (type) {
      case "hosted":
        whereCondition.createdBy = userId;
        events = await Event.findAndCountAll({
          where: whereCondition,
          include: [
            ...baseIncludes,
            {
              model: EventComment,
              as: "EventComments",
              attributes: [],
            },
          ],
          limit: parseInt(limit),
          offset,
          order: orderCondition,
          distinct: true,
        });
        break;

      case "invited":
        const totalInvitedCount = await Event.count({
          where: whereCondition,
          include: [
            {
              model: User,
              as: "invitedUsers",
              where: { id: userId },
              attributes: [],
              through: { attributes: [] },
            },
          ],
        });

        const invitedEventRows = await Event.findAll({
          where: whereCondition,
          include: [
            ...baseIncludes,
            {
              model: User,
              as: "invitedUsers",
              where: { id: userId },
              attributes: [],
              through: {
                attributes: ["status", "seen", "attended", "message"],
              },
            },
            {
              model: EventComment,
              as: "EventComments",
              attributes: [],
            },
          ],
          limit: parseInt(limit),
          offset,
          order: orderCondition,
        });

        events = {
          rows: invitedEventRows,
          count: totalInvitedCount,
        };
        break;

      case "upcoming":
        const currentDate = new Date();

        const upcomingInvitedEventIds = await Event.findAll({
          where: {
            eventDate: { [Op.gte]: currentDate },
            ...whereCondition,
          },
          include: [
            {
              model: User,
              as: "invitedUsers",
              where: { id: userId },
              attributes: [],
              through: { attributes: [] },
            },
          ],
          attributes: ["id"],
          raw: true,
        });

        const upcomingInvitedIds = upcomingInvitedEventIds.map(
          (event) => event.id
        );

        const upcomingWhereCondition = {
          eventDate: { [Op.gte]: currentDate },
          ...whereCondition,
          [Op.or]: [
            { visibilty: "public" },
            { createdBy: userId },
            ...(upcomingInvitedIds.length > 0
              ? [{ id: { [Op.in]: upcomingInvitedIds } }]
              : []),
          ],
        };

        const totalUpcomingCount = await Event.count({
          where: upcomingWhereCondition,
        });

        const upcomingEventRows = await Event.findAll({
          where: upcomingWhereCondition,
          include: [
            ...baseIncludes,
            {
              model: User,
              as: "invitedUsers",
              attributes: [],
              through: { attributes: [] },
              required: false,
            },
            {
              model: EventComment,
              as: "EventComments",
              attributes: [],
            },
          ],
          limit: parseInt(limit),
          offset,
          order: [
            ["eventDate", "ASC"],
            ["createdAt", "DESC"],
          ],
        });

        events = {
          rows: upcomingEventRows,
          count: totalUpcomingCount,
        };
        break;

      case "public":
        whereCondition.visibilty = "public";
        events = await Event.findAndCountAll({
          where: whereCondition,
          include: [
            ...baseIncludes,
            {
              model: EventComment,
              as: "EventComments",
              attributes: [],
            },
          ],
          limit: parseInt(limit),
          offset,
          order: orderCondition,
          distinct: true,
        });
        break;

      default:
        const invitedEventIds = await Event.findAll({
          include: [
            {
              model: User,
              as: "invitedUsers",
              where: { id: userId },
              attributes: [],
              through: { attributes: [] },
            },
          ],
          attributes: ["id"],
          raw: true,
        });

        const invitedIds = invitedEventIds.map((event) => event.id);

        whereCondition[Op.or] = [
          { visibilty: "public" },
          { createdBy: userId },
          ...(invitedIds.length > 0 ? [{ id: { [Op.in]: invitedIds } }] : []),
        ];

        const totalCount = await Event.count({
          where: whereCondition,
        });

        const eventRows = await Event.findAll({
          where: whereCondition,
          include: [
            ...baseIncludes,
            {
              model: User,
              as: "invitedUsers",
              attributes: [],
              through: { attributes: [] },
              required: false,
            },
            {
              model: EventComment,
              as: "EventComments",
              attributes: [],
            },
          ],
          limit: parseInt(limit),
          offset,
          order: orderCondition,
        });

        events = {
          rows: eventRows,
          count: totalCount,
        };
        break;
    }

    if (filter === "recommended") {
      events.rows = await Promise.all(
        events.rows.map(async (event) => {
          const likesCount = await EventLike.count({
            where: { eventId: event.id },
          });
          const commentsCount = await EventComment.count({
            where: { eventId: event.id },
          });

          return {
            ...event.toJSON(),
            engagementScore: likesCount + commentsCount,
            likesCount,
            commentsCount,
          };
        })
      );
    }

    res.json({
      success: true,
      data: {
        events: events.rows,
        pagination: {
          total: events.count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(events.count / limit),
        },
        appliedFilters: {
          type,
          filter,
          search,
          ...(userLat &&
            userLng && { userLocation: { lat: userLat, lng: userLng } }),
        },
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch events",
      error: error.message,
    });
  }
};

const getEventById = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findByPk(eventId, {
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
        },
        {
          model: User,
          as: "invitedUsers",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: {
            attributes: [
              "status",
              "seen",
              "attended",
              "message",
              "joinedManually",
            ],
          },
        },
        {
          model: User,
          as: "likes",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: { attributes: ["createdAt"] },
        },
        {
          model: EventComment,
          as: "EventComments",
          include: [
            {
              model: User,
              attributes: ["id", "name", "phoneNumber", "profilePicture"],
            },
            {
              model: User,
              as: "likedBy",
              attributes: ["id", "name", "phoneNumber", "profilePicture"],
              through: {
                model: EventCommentLike,
                attributes: ["createdAt"],
              },
            },
          ],
          order: [["createdAt", "ASC"]],
        },
        {
          model: User,
          as: "viewedBy",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: {
            model: EventSeen,
            attributes: ["viewCount", "lastViewedAt"],
          },
        },
      ],
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const hasAccess =
      event.visibilty === "public" ||
      event.createdBy === userId ||
      event.invitedUsers.some((user) => user.id === userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const [eventSeen, created] = await EventSeen.findOrCreate({
      where: {
        userId: userId,
        eventId: eventId,
      },
      defaults: {
        viewCount: 1,
        lastViewedAt: new Date(),
      },
    });

    if (!created) {
      await eventSeen.update({
        viewCount: eventSeen.viewCount + 1,
        lastViewedAt: new Date(),
      });
    }

    const totalViews = await EventSeen.sum("viewCount", {
      where: { eventId: eventId },
    });

    const uniqueViewers = await EventSeen.count({
      where: { eventId: eventId },
    });

    const userViewData = await EventSeen.findOne({
      where: {
        userId: userId,
        eventId: eventId,
      },
    });

    const structuredComments = structureComments(event.EventComments);

    const pendingInvites = [];
    const acceptedParticipants = [];
    const declinedInvites = [];
    const allInvites = [];

    event.invitedUsers.forEach((user) => {
      const userWithStatus = {
        ...user.toJSON(),
        inviteStatus: user.EventInvite || user.dataValues.EventInvite
      };

      allInvites.push(userWithStatus);

      switch (userWithStatus.inviteStatus?.status) {
        case 'pending':
          pendingInvites.push(userWithStatus);
          break;
        case 'accepted':
          acceptedParticipants.push(userWithStatus);
          break;
        case 'declined':
          declinedInvites.push(userWithStatus);
          break;
        default:
          pendingInvites.push(userWithStatus);
      }
    });

    const eventData = {
      ...event.toJSON(),
      EventComments: structuredComments,
      invitedUsers: allInvites,
      pendingInvites,
      acceptedParticipants,
      declinedInvites,
      inviteSummary: {
        totalInvited: allInvites.length,
        pending: pendingInvites.length,
        accepted: acceptedParticipants.length,
        declined: declinedInvites.length
      },
      viewStats: {
        totalViews: totalViews || 0,
        uniqueViewers: uniqueViewers || 0,
        userViews: userViewData ? userViewData.viewCount : 0,
        lastViewedAt: userViewData ? userViewData.lastViewedAt : null,
      },
    };

    res.json({
      success: true,
      data: eventData,
    });
  } catch (error) {
    console.error("Get event by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event",
      error: error.message,
    });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const updateData = { ...req.body };

    // Handle cover picture upload
    if (req.file) {
      const baseUrl = process.env.BASE_URL || "http://localhost:5000";
      updateData.coverPic = `${baseUrl}/uploads/events/${req.file.filename}`;
    }

    // Find and authorize event in one query
    const event = await Event.findOne({
      where: { id: eventId, createdBy: userId },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized to update it",
      });
    }

    // Handle capacity and visibility logic
    const finalVisibility = updateData.visibility || event.visibility;
    
    if (finalVisibility === "private") {
      updateData.capacity = null;
    } else if ("capacity" in updateData && updateData.capacity !== null) {
      const capacityValidation = validateCapacity(updateData.capacity);
      if (!capacityValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: capacityValidation.message,
        });
      }
      updateData.capacity = capacityValidation.value;

      // Check capacity against confirmed attendees
      const confirmedCount = await EventInvite.count({
        where: { eventId, status: "accepted" },
      });

      if (confirmedCount > updateData.capacity) {
        return res.status(400).json({
          success: false,
          message: `Cannot set capacity to ${updateData.capacity}. There are already ${confirmedCount} confirmed attendees.`,
        });
      }
    }

    // Update and fetch in parallel for better performance
    const [, updatedEvent] = await Promise.all([
      event.update(updateData),
      Event.findByPk(eventId, {
        include: [{
          model: User,
          as: "creator",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
        }],
      }),
    ]);

    res.json({
      success: true,
      message: "Event updated successfully",
      data: updatedEvent,
    });
  } catch (error) {
    console.error("Update event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update event",
      error: error.message,
    });
  }
};

// Helper function for capacity validation
const validateCapacity = (capacity) => {
  if (capacity === null || capacity === undefined) {
    return { isValid: true, value: null };
  }

  const capacityNum = Number(capacity);
  
  if (isNaN(capacityNum) || !Number.isInteger(capacityNum) || capacityNum < 1) {
    return {
      isValid: false,
      message: "Capacity must be null (unlimited) or a positive integer (1, 2, 3, etc.)",
    };
  }

  return { isValid: true, value: capacityNum };
};

const deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findOne({
      where: { id: eventId, createdBy: userId },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized to delete it",
      });
    }

    await event.destroy();

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete event",
      error: error.message,
    });
  }
};

// Event Invitation Management
const inviteUsers = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userIds } = req.body;
    const userId = req.user.userId;

    const event = await Event.findOne({
      where: { id: eventId, createdBy: userId },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized to invite users",
      });
    }

    const existingInvites = await EventInvite.findAll({
      where: {
        eventId,
        userId: { [Op.in]: userIds },
      },
    });

    const existingUserIds = existingInvites.map((invite) => invite.userId);
    const newUserIds = userIds.filter((id) => !existingUserIds.includes(id));

    if (newUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All users are already invited",
      });
    }

    const invitations = newUserIds.map((inviteUserId) => ({
      eventId,
      userId: inviteUserId,
      status: "pending",
    }));

    await EventInvite.bulkCreate(invitations);

    res.json({
      success: true,
      message: `${newUserIds.length} users invited successfully`,
    });
  } catch (error) {
    console.error("Invite users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to invite users",
      error: error.message,
    });
  }
};

const respondToInvite = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, message } = req.body;
    const userId = req.user.userId;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be accepted or rejected",
      });
    }

    const invite = await EventInvite.findOne({
      where: { eventId, userId },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }

    await invite.update({
      status,
      message: message || null,
      seen: true,
    });

    res.json({
      success: true,
      message: `Invitation ${status} successfully`,
    });
  } catch (error) {
    console.error("Respond to invite error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to respond to invitation",
      error: error.message,
    });
  }
};

const joinPublicEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findByPk(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.visibilty !== "public") {
      return res.status(403).json({
        success: false,
        message: "This is a private event",
      });
    }

    const existingInvite = await EventInvite.findOne({
      where: { eventId, userId },
    });

    if (existingInvite) {
      return res.status(400).json({
        success: false,
        message: "You have already joined this event",
      });
    }

    if (event.capacity !== null) {
      const maxCapacity = parseInt(event.capacity);

      const currentParticipants = await EventInvite.count({
        where: {
          eventId,
          status: "accepted",
        },
      });

      if (currentParticipants >= maxCapacity) {
        return res.status(400).json({
          success: false,
          message: "Event has reached maximum capacity",
        });
      }
    }

    await EventInvite.create({
      eventId,
      userId,
      status: "accepted",
      joinedManually: true,
      seen: true,
    });

    res.json({
      success: true,
      message: "Successfully joined the event",
    });
  } catch (error) {
    console.error("Join public event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join event",
      error: error.message,
    });
  }
};

// Event Likes
const toggleLikeEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const existingLike = await EventLike.findOne({
      where: { eventId, userId },
    });

    if (existingLike) {
      await existingLike.destroy();
      return res.json({
        success: true,
        message: "Event unliked successfully",
        action: "unliked",
      });
    } else {
      await EventLike.create({ eventId, userId });
      return res.json({
        success: true,
        message: "Event liked successfully",
        action: "liked",
      });
    }
  } catch (error) {
    console.error("Toggle like error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle like",
      error: error.message,
    });
  }
};

// Event Comments
const addComment = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { content, parentCommentId } = req.body;
    const userId = req.user.userId;

    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const comment = await EventComment.create({
      eventId,
      userId,
      content,
      parentCommentId: parentCommentId || null,
    });

    const createdComment = await EventComment.findByPk(comment.id, {
      include: [
        {
          model: User,
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: createdComment,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add comment",
      error: error.message,
    });
  }
};

const getComments = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user.userId;
    const offset = (page - 1) * limit;

    const event = await Event.findByPk(eventId, {
      include: [
        {
          model: User,
          as: "invitedUsers",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const hasAccess =
      event.visibilty === "public" ||
      event.createdBy === userId ||
      event.invitedUsers.some((user) => user.id === userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const comments = await EventComment.findAndCountAll({
      where: {
        eventId,
        parentCommentId: null,
      },
      include: [
        {
          model: User,
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
        },
        {
          model: EventComment,
          as: "replies",
          include: [
            {
              model: User,
              attributes: ["id", "name", "phoneNumber", "profilePicture"],
            },
            {
              model: User,
              as: "likedBy",
              attributes: ["id", "name", "phoneNumber", "profilePicture"],
              through: {
                model: EventCommentLike,
                attributes: ["createdAt"],
              },
            },
          ],
          order: [["createdAt", "ASC"]],
        },
        {
          model: User,
          as: "likedBy",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: {
            model: EventCommentLike,
            attributes: ["createdAt"],
          },
        },
      ],
      limit: parseInt(limit),
      offset,
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: {
        comments: comments.rows,
        pagination: {
          total: comments.count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(comments.count / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch comments",
      error: error.message,
    });
  }
};

const toggleLikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const comment = await EventComment.findByPk(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    const existingLike = await EventCommentLike.findOne({
      where: { commentId, userId },
    });

    if (existingLike) {
      await existingLike.destroy();
      return res.json({
        success: true,
        message: "Comment unliked successfully",
        action: "unliked",
      });
    } else {
      await EventCommentLike.create({ commentId, userId });
      return res.json({
        success: true,
        message: "Comment liked successfully",
        action: "liked",
      });
    }
  } catch (error) {
    console.error("Toggle comment like error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle comment like",
      error: error.message,
    });
  }
};

// Invitee Templates
const createTemplate = async (req, res) => {
  try {
    const { name, userIds } = req.body;
    const userId = req.user.userId;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Template name is required",
      });
    }

    if (name.trim().length > 255) {
      return res.status(400).json({
        success: false,
        message: "Template name is too long (max 255 characters)",
      });
    }

    if (
      userIds &&
      (!Array.isArray(userIds) ||
        userIds.some(
          (id) =>
            !id ||
            (isNaN(id) &&
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                id
              ))
        ))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user IDs provided",
      });
    }

    const existingTemplate = await InviteeTemplate.findOne({
      where: { name: name.trim(), userId },
    });

    if (existingTemplate) {
      return res.status(409).json({
        success: false,
        message: "Template with this name already exists",
      });
    }

    if (userIds && userIds.length > 0) {
      const existingUsers = await User.findAll({
        where: { id: userIds },
        attributes: ["id"],
      });

      if (existingUsers.length !== userIds.length) {
        const foundUserIds = existingUsers.map((user) => user.id);
        const invalidUserIds = userIds.filter(
          (id) => !foundUserIds.includes(id)
        );
        return res.status(400).json({
          success: false,
          message: `Invalid user IDs: ${invalidUserIds.join(", ")}`,
        });
      }
    }

    const template = await InviteeTemplate.create({
      name: name.trim(),
      userId,
    });

    if (userIds && userIds.length > 0) {
      const templateUsers = userIds.map((uid) => ({
        templateId: template.id,
        userId: uid,
      }));
      await InviteeTemplateUser.bulkCreate(templateUsers);
    }

    const createdTemplate = await InviteeTemplate.findByPk(template.id, {
      include: [
        {
          model: User,
          as: "users",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: { attributes: [] },
        },
      ],
    });

    if (!createdTemplate) {
      return res.status(500).json({
        success: false,
        message: "Template created but failed to retrieve",
      });
    }

    res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: createdTemplate,
    });
  } catch (error) {
    console.error("Create template error:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((err) => err.message),
      });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Template with this name already exists",
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Invalid reference to related data",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create template",
      error: error.message,
    });
  }
};

const getTemplates = async (req, res) => {
  try {
    const userId = req.user.userId;

    const templates = await InviteeTemplate.findAll({
      where: { userId },
      include: [
        {
          model: User,
          as: "users",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: { attributes: [] },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error("Get templates error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch templates",
      error: error.message,
    });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { name, userIds } = req.body;
    const userId = req.user.userId;

    if (
      !templateId ||
      (isNaN(templateId) &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          templateId
        ))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid template ID format",
      });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Template name is required",
      });
    }

    if (
      userIds &&
      (!Array.isArray(userIds) ||
        userIds.some(
          (id) =>
            !id ||
            (isNaN(id) &&
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                id
              ))
        ))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user IDs provided",
      });
    }

    const template = await InviteeTemplate.findOne({
      where: { id: templateId, userId },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found or you don't have permission to update it",
      });
    }

    if (userIds && userIds.length > 0) {
      const existingUsers = await User.findAll({
        where: { id: userIds },
        attributes: ["id"],
      });

      if (existingUsers.length !== userIds.length) {
        const foundUserIds = existingUsers.map((user) => user.id);
        const invalidUserIds = userIds.filter(
          (id) => !foundUserIds.includes(id)
        );
        return res.status(400).json({
          success: false,
          message: `Invalid user IDs: ${invalidUserIds.join(", ")}`,
        });
      }
    }

    await template.update({ name: name.trim() });

    if (userIds) {
      await InviteeTemplateUser.destroy({
        where: { templateId },
      });

      if (userIds.length > 0) {
        const templateUsers = userIds.map((uid) => ({
          templateId,
          userId: uid,
        }));
        await InviteeTemplateUser.bulkCreate(templateUsers);
      }
    }

    const updatedTemplate = await InviteeTemplate.findByPk(templateId, {
      include: [
        {
          model: User,
          as: "users",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: { attributes: [] },
        },
      ],
    });

    if (!updatedTemplate) {
      return res.status(404).json({
        success: false,
        message: "Template not found after update",
      });
    }

    res.json({
      success: true,
      message: "Template updated successfully",
      data: updatedTemplate,
    });
  } catch (error) {
    console.error("Update template error:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((err) => err.message),
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Invalid reference to related data",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update template",
      error: error.message,
    });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const userId = req.user.userId;

    const template = await InviteeTemplate.findOne({
      where: { id: templateId, userId },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    await template.destroy();

    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete template",
      error: error.message,
    });
  }
};

// Attendance Management
const markAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userIds, attended } = req.body;
    const userId = req.user.userId;

    const event = await Event.findOne({
      where: { id: eventId, createdBy: userId },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized",
      });
    }

    await EventInvite.update(
      { attended },
      {
        where: {
          eventId,
          userId: { [Op.in]: userIds },
        },
      }
    );

    res.json({
      success: true,
      message: "Attendance updated successfully",
    });
  } catch (error) {
    console.error("Mark attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update attendance",
      error: error.message,
    });
  }
};

const getMyLikedEvents = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { search, sortBy = "likedAt", sortOrder = "DESC" } = req.query;

    let whereCondition = {};
    let orderCondition = [];

    if (search) {
      whereCondition = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { location: { [Op.iLike]: `%${search}%` } },
          { additionalNotes: { [Op.iLike]: `%${search}%` } },
        ],
      };
    }

    switch (sortBy) {
      case "likedAt":
        orderCondition = [
          [
            { model: User, as: "likes" },
            EventLike,
            "createdAt",
            sortOrder.toUpperCase(),
          ],
        ];
        break;
      case "eventDate":
        orderCondition = [
          ["startDate", sortOrder.toUpperCase()],
          ["createdAt", "DESC"],
        ];
        break;
      case "name":
        orderCondition = [
          ["name", sortOrder.toUpperCase()],
          ["createdAt", "DESC"],
        ];
        break;
      default:
        orderCondition = [
          [{ model: User, as: "likes" }, EventLike, "createdAt", "DESC"],
        ];
        break;
    }

    const likedEvents = await Event.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
        },
        {
          model: User,
          as: "likes",
          where: { id: userId },
          attributes: ["id", "name", "phoneNumber", "profilePicture"],
          through: {
            model: EventLike,
            attributes: ["createdAt"],
          },
        },
        {
          model: User,
          as: "invitedUsers",
          attributes: ["id"],
          through: {
            model: EventInvite,
            attributes: ["status", "attended"],
            where: { userId: userId },
          },
          required: false,
        },
        {
          model: EventComment,
          as: "EventComments",
          attributes: ["id"],
        },
      ],
      order: orderCondition,
      distinct: true,
    });

    const eventsWithStats = await Promise.all(
      likedEvents.rows.map(async (event) => {
        const totalLikesCount = await EventLike.count({
          where: { eventId: event.id },
        });

        const totalCommentsCount = await EventComment.count({
          where: { eventId: event.id },
        });

        const attendeesCount = await EventInvite.count({
          where: {
            eventId: event.id,
            status: "accepted",
          },
        });

        const userInvite = event.invitedUsers[0] || null;
        const userStatus = userInvite ? userInvite.EventInvite.status : null;
        const userAttended = userInvite
          ? userInvite.EventInvite.attended
          : null;

        const likedAt = event.likes[0]
          ? event.likes[0].EventLike.createdAt
          : null;

        return {
          ...event.toJSON(),
          stats: {
            totalLikes: totalLikesCount,
            totalComments: totalCommentsCount,
            totalAttendees: attendeesCount,
          },
          userInteraction: {
            likedAt,
            invitationStatus: userStatus,
            attended: userAttended,
            isLiked: true,
          },
          likes: undefined,
          invitedUsers: undefined,
          EventComments: undefined,
        };
      })
    );

    res.json({
      success: true,
      data: {
        likedEvents: eventsWithStats,
        total: likedEvents.count,
      },
    });
  } catch (error) {
    console.error("Get my liked events error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch liked events",
      error: error.message,
    });
  }
};

module.exports = {
  // Event Management
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,

  // Invitation Management
  inviteUsers,
  respondToInvite,
  joinPublicEvent,

  // Event Interactions
  toggleLikeEvent,
  addComment,
  getComments,
  toggleLikeComment,
  getMyLikedEvents,

  // Template Management
  createTemplate,
  getTemplates,
  updateTemplate,
  deleteTemplate,

  // Attendance
  markAttendance,
};
