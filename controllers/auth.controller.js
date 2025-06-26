const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
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
const path = require("path");
const fs = require("fs");
const { countryCodeMappings } = require("../utils/CountryCodeMapping");

const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const isProfileComplete = (user) => {
  return !!(user.name && user.dateOfBirth && user.gender);
};

// SIGNUP API
const signup = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required",
      });
    }

    const existingUser = await User.findOne({ where: { phoneNumber } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this phone number already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = generateOTP();

    const user = await User.create({
      phoneNumber,
      password: hashedPassword,
      otp,
      isVerified: false,
    });

    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: "User registered successfully. Please verify your phone number.",
      data: {
        userId: user.id,
        phoneNumber: user.phoneNumber,
        otp: otp,
        token,
        isVerified: user.isVerified,
        profileComplete: false,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// VERIFY OTP API
const verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    const user = await User.findOne({ where: { phoneNumber } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    await user.update({
      isVerified: true,
      otp: null,
    });

    res.status(200).json({
      success: true,
      message: "Phone number verified successfully",
      data: {
        userId: user.id,
        isVerified: true,
        profileComplete: isProfileComplete(user),
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// LOGIN API
const login = async (req, res) => {
  try {
    const { phoneNumber, password, fcmToken } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required",
      });
    }

    const user = await User.findOne({ where: { phoneNumber } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your phone number first",
        requiresVerification: true,
      });
    }

    if (fcmToken) {
      await user.update({ fcmToken });
    }

    const profileComplete = isProfileComplete(user);
    if (!profileComplete) {
      return res.status(200).json({
        success: true,
        message: "Please complete your profile first",
        data: {
          userId: user.id,
          token: generateToken(user.id),
          profileComplete: false,
          requiresProfileCompletion: true,
        },
      });
    }

    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        token,
        profileComplete: true,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// COMPLETE PROFILE API
const completeProfile = async (req, res) => {
  try {
    const { name, dateOfBirth, gender } = req.body;
    const userId = req.user.userId;

    // Early validation
    if (!name || !dateOfBirth || !gender) {
      return res.status(400).json({
        success: false,
        message: "Name, date of birth, and gender are required",
      });
    }

    // Pre-calculate profile picture URL to avoid conditional logic later
    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    const newProfilePicture = req.file 
      ? `${baseUrl}/uploads/profile-pictures/${req.file.filename}` 
      : undefined;

    // Prepare update data once
    const updateData = { name, dateOfBirth, gender };
    if (newProfilePicture) {
      updateData.profilePicture = newProfilePicture;
    }

    // Single optimized database operation
    const [updatedRows] = await User.update(updateData, {
      where: { id: userId },
      returning: true // PostgreSQL only - for other DBs, you'll need a separate select
    });

    if (updatedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Fetch updated user data (if returning isn't supported)
    const user = await User.findByPk(userId);

    // Return response with minimal data reshaping
    res.status(200).json({
      success: true,
      message: "Profile completed successfully",
      data: {
        userId: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        profileComplete: true,
      },
    });
  } catch (error) {
    console.error("Complete profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GET PROFILE API
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: {
        userId: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        isVerified: user.isVerified,
        profileComplete: isProfileComplete(user),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: ["id", "name", "phoneNumber", "profilePicture", "createdAt"],
      include: [
        {
          model: Event,
          as: "createdEvents",
          attributes: [
            "id",
            "name",
            "location",
            "lat",
            "lng",
            "coverPic",
            "visibilty",
            "capacity",
            "additionalNotes",
            "startDate",
            "endDate",
            "startTime",
            "endTime",
            "createdAt",
          ],
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "name", "phoneNumber", "profilePicture"],
            },
            {
              model: User,
              as: "likes",
              attributes: ["id"],
              through: { attributes: [] },
            },
            {
              model: EventComment,
              as: "EventComments",
              attributes: ["id"],
            },
          ],
        },
        {
          model: Event,
          as: "invitedEvents",
          attributes: [
            "id",
            "name",
            "location",
            "lat",
            "lng",
            "coverPic",
            "visibilty",
            "capacity",
            "additionalNotes",
            "startDate",
            "endDate",
            "startTime",
            "endTime",
            "createdAt",
          ],
          through: {
            model: EventInvite,
            attributes: ["status", "attended", "joinedManually"],
            where: { status: "accepted" },
          },
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "name", "phoneNumber", "profilePicture"],
            },
            {
              model: User,
              as: "likes",
              attributes: ["id"],
              through: { attributes: [] },
            },
            {
              model: EventComment,
              as: "EventComments",
              attributes: ["id"],
            },
          ],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hostedEventsWithCounts = await Promise.all(
      user.createdEvents.map(async (event) => {
        const likesCount = event.likes.length;
        const commentsCount = event.EventComments.length;

        const attendeesCount = await EventInvite.count({
          where: {
            eventId: event.id,
            status: "accepted",
          },
        });

        return {
          ...event.toJSON(),
          likesCount,
          commentsCount,
          attendeesCount,
        };
      })
    );

    const attendedEventsWithCounts = await Promise.all(
      user.invitedEvents.map(async (event) => {
        const likesCount = event.likes.length;
        const commentsCount = event.EventComments.length;

        const attendeesCount = await EventInvite.count({
          where: {
            eventId: event.id,
            status: "accepted",
          },
        });

        return {
          ...event.toJSON(),
          likesCount,
          commentsCount,
          attendeesCount,
        };
      })
    );

    const userData = {
      ...user.toJSON(),
      hostedEvents: hostedEventsWithCounts,
      attendedEvents: attendedEventsWithCounts,
      stats: {
        totalHostedEvents: hostedEventsWithCounts.length,
        totalAttendedEvents: attendedEventsWithCounts.length,
        totalEvents:
          hostedEventsWithCounts.length + attendedEventsWithCounts.length,
      },
    };

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: error.message,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, dateOfBirth, gender } = req.body;

    const updateData = {
      ...(name && { name }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(gender && { gender })
    };

    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    
    let oldProfilePicture = null;
    if (req.file) {
      updateData.profilePicture = `${baseUrl}/uploads/profile-pictures/${req.file.filename}`;
    }

    let oldProfilePicturePath = null;
    if (req.file) {
      const currentUser = await User.findByPk(userId, {
        attributes: ['profilePicture']
      });
      
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      
      oldProfilePicturePath = currentUser.profilePicture;
    }

    const [updatedRows] = await User.update(updateData, {
      where: { id: userId }
    });

    if (updatedRows === 0 && !req.file) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'phoneNumber', 'profilePicture', 'dateOfBirth', 'gender']
    });

    if (req.file && oldProfilePicturePath && oldProfilePicturePath !== updateData.profilePicture) {
      setImmediate(() => {
        try {
          const oldFilePath = path.join(
            __dirname,
            "../",
            oldProfilePicturePath.replace(baseUrl, "")
          );
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        } catch (fileError) {
          console.warn("Failed to delete old profile picture:", fileError);
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        userId: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        profileComplete: isProfileComplete(user),
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// FORGOT PASSWORD API
const forgotPassword = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const user = await User.findOne({ where: { phoneNumber } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();
    await user.update({ otp });

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent successfully",
      data: {
        phoneNumber: user.phoneNumber,
        otp: otp,
      },
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// RESET PASSWORD API
const resetPassword = async (req, res) => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Phone number, OTP, and new password are required",
      });
    }

    const user = await User.findOne({ where: { phoneNumber } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update({
      password: hashedPassword,
      otp: null,
    });

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// RESEND OTP API
const resendOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const user = await User.findOne({ where: { phoneNumber } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();
    await user.update({ otp });

    res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      data: {
        phoneNumber: user.phoneNumber,
        otp: otp,
      },
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const uploadContacts = async (req, res) => {
  try {
    const { contacts } = req.body;
    const userId = req.user.userId;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Contacts array is required and cannot be empty",
      });
    }

    // Validate contacts
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      if (!contact.name || !contact.phone) {
        return res.status(400).json({
          success: false,
          message: `Contact at index ${i} must have both name and phone`,
        });
      }
    }

    // Helper function to check if profile is complete
    const isProfileComplete = (user) => {
      return !!(
        user.name &&
        user.phoneNumber &&
        user.dateOfBirth &&
        user.gender
      );
    };

    // Enhanced phone number normalization
    const normalizePhoneNumber = (phone) => {
      if (!phone) return "";

      // Remove all non-digit characters except + at the beginning
      let cleaned = phone.toString().trim();

      // Handle + prefix
      const hasPlus = cleaned.startsWith("+");
      cleaned = cleaned.replace(/[^\d]/g, "");

      // Remove leading zeros
      cleaned = cleaned.replace(/^0+/, "");

      return {
        digits: cleaned,
        hasPlus: hasPlus,
        length: cleaned.length,
      };
    };

    const generatePhoneVariations = (phone) => {
      const variations = new Set();
      const normalized = normalizePhoneNumber(phone);

      if (normalized.length < 7) return [];

      const digits = normalized.digits;

      variations.add(digits);

      variations.add("+" + digits);

      Object.entries(countryCodeMappings).forEach(([code, config]) => {
        if (digits.startsWith(code)) {
          variations.add(digits);
          variations.add("+" + digits);

          const localNumber = digits.substring(config.stripLength);
          if (config.localLength.includes(localNumber.length)) {
            variations.add(localNumber);
            variations.add("0" + localNumber);
          }
        }

        if (
          !digits.startsWith(code) &&
          config.localLength.includes(digits.length)
        ) {
          variations.add(code + digits);
          variations.add("+" + code + digits);
        }
      });

      if (digits.length >= 7) {
        variations.add("0" + digits);

        if (phone.toString().replace(/[^\d]/g, "").startsWith("0")) {
          const withoutLeadingZero = digits.replace(/^0+/, "");
          if (withoutLeadingZero.length >= 7) {
            variations.add(withoutLeadingZero);
          }
        }
      }

      if (phone.toString().includes("00")) {
        const cleaned00 = phone.toString().replace(/[^\d]/g, "");
        if (cleaned00.startsWith("00") && cleaned00.length > 9) {
          const without00 = cleaned00.substring(2);
          variations.add(without00);
          variations.add("+" + without00);
        }
      }

      if (digits.length > 11) {
        for (let len = 10; len <= 11; len++) {
          if (digits.length >= len) {
            const lastDigits = digits.substring(digits.length - len);
            variations.add(lastDigits);
            variations.add("0" + lastDigits);
          }
        }
      }

      if (digits.length >= 7 && digits.length <= 9) {
        variations.add("0" + digits);

        ["92", "91", "1", "44"].forEach((code) => {
          variations.add(code + digits);
          variations.add("+" + code + digits);
        });
      }

      return Array.from(variations).filter((v) => {
        const cleanV = v.replace(/[^\d]/g, "");
        return cleanV.length >= 7 && cleanV.length <= 15;
      });
    };

    const findMatchingUsers = async (phoneVariations) => {
      const exactMatches = await User.findAll({
        where: {
          phoneNumber: {
            [Op.in]: phoneVariations,
          },
        },
        attributes: [
          "id",
          "name",
          "phoneNumber",
          "profilePicture",
          "dateOfBirth",
          "gender",
          "createdAt",
        ],
      });

      if (exactMatches.length === 0 && phoneVariations.length > 0) {
        const patternQueries = phoneVariations.map((phone) => {
          const cleanPhone = phone.replace(/[^\d]/g, "");
          return {
            [Op.or]: [
              { phoneNumber: { [Op.like]: `%${cleanPhone}` } },
              {
                phoneNumber: {
                  [Op.like]: `%${cleanPhone.substring(cleanPhone.length - 10)}`,
                },
              },
              { phoneNumber: { [Op.like]: `${cleanPhone}%` } },
              { phoneNumber: { [Op.like]: `%${cleanPhone}%` } },
            ],
          };
        });

        const patternMatches = await User.findAll({
          where: {
            [Op.or]: patternQueries.slice(0, 5),
          },
          attributes: [
            "id",
            "name",
            "phoneNumber",
            "profilePicture",
            "dateOfBirth",
            "gender",
            "createdAt",
          ],
        });

        return patternMatches;
      }

      return exactMatches;
    };

    const BATCH_SIZE = 50;
    const processedContacts = [];

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);

      const batchPhoneVariations = new Set();
      const contactPhoneMap = new Map();

      batch.forEach((contact, batchIndex) => {
        const globalIndex = i + batchIndex;
        const variations = generatePhoneVariations(contact.phone);

        variations.forEach((variation) => {
          batchPhoneVariations.add(variation);
          if (!contactPhoneMap.has(variation)) {
            contactPhoneMap.set(variation, []);
          }
          contactPhoneMap.get(variation).push(globalIndex);
        });
      });

      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, checking ${batchPhoneVariations.size} phone variations`
      );

      const existingUsers = await findMatchingUsers(
        Array.from(batchPhoneVariations)
      );
      console.log(
        `Found ${existingUsers.length} existing users in database for batch`
      );

      const userMap = new Map();
      const createUserMappings = (user) => {
        const userVariations = generatePhoneVariations(user.phoneNumber);
        userVariations.forEach((variation) => {
          userMap.set(variation, user);
        });

        userMap.set(user.phoneNumber, user);

        const userNormalized = normalizePhoneNumber(user.phoneNumber);
        if (userNormalized.digits.length >= 7) {
          for (let len = 8; len <= 10; len++) {
            if (userNormalized.digits.length >= len) {
              const suffix = userNormalized.digits.substring(
                userNormalized.digits.length - len
              );
              userMap.set(suffix, user);
            }
          }
        }
      };

      existingUsers.forEach(createUserMappings);

      batch.forEach((contact, batchIndex) => {
        const globalIndex = i + batchIndex;
        const contactVariations = generatePhoneVariations(contact.phone);
        let existingUser = null;
        let matchType = "exact";

        for (const variation of contactVariations) {
          existingUser = userMap.get(variation);
          if (existingUser) {
            console.log(
              `Exact match found: ${contact.name} -> ${existingUser.name} (${existingUser.phoneNumber})`
            );
            break;
          }
        }

        if (!existingUser) {
          const contactNormalized = normalizePhoneNumber(contact.phone);
          if (contactNormalized.digits.length >= 8) {
            for (let len = 10; len >= 8; len--) {
              if (contactNormalized.digits.length >= len) {
                const suffix = contactNormalized.digits.substring(
                  contactNormalized.digits.length - len
                );
                existingUser = userMap.get(suffix);
                if (existingUser) {
                  matchType = "fuzzy";
                  console.log(
                    `Fuzzy match found (${len} digits): ${contact.name} -> ${existingUser.name} (${existingUser.phoneNumber})`
                  );
                  break;
                }
              }
            }
          }
        }

        if (existingUser) {
          processedContacts.push({
            contactName: contact.name,
            contactPhone: contact.phone,
            kairoStatus: true,
            matchType: matchType,
            userProfile: {
              userId: existingUser.id,
              name: existingUser.name,
              phoneNumber: existingUser.phoneNumber,
              profilePicture: existingUser.profilePicture,
              dateOfBirth: existingUser.dateOfBirth,
              gender: existingUser.gender,
              profileComplete: isProfileComplete(existingUser),
              joinedAt: existingUser.createdAt,
            },
          });
        } else {
          processedContacts.push({
            contactName: contact.name,
            phoneNumber: contact.phone,
            kairoStatus: false,
            matchType: "none",
            userProfile: null,
          });
        }
      });
    }

    const kairoUsers = processedContacts.filter(
      (contact) => contact.kairoStatus === true
    );
    const nonKairoUsers = processedContacts.filter(
      (contact) => contact.kairoStatus === false
    );

    console.log(
      `Final results: ${kairoUsers.length} Kairo users, ${nonKairoUsers.length} non-Kairo users`
    );

    res.status(200).json({
      success: true,
      message: "Contacts processed successfully",
      data: {
        totalContacts: contacts.length,
        kairoUsersCount: kairoUsers.length,
        nonKairoUsersCount: nonKairoUsers.length,
        contacts: processedContacts,
        summary: {
          totalUploaded: contacts.length,
          foundInKairo: kairoUsers.length,
          notFoundInKairo: nonKairoUsers.length,
          exactMatches: kairoUsers.filter((u) => u.matchType === "exact")
            .length,
          fuzzyMatches: kairoUsers.filter((u) => u.matchType === "fuzzy")
            .length,
          kairoUsers: kairoUsers.map((user) => ({
            contactName: user.contactName,
            contactPhone: user.contactPhone,
            userName: user.userProfile.name,
            userPhone: user.userProfile.phoneNumber,
            userId: user.userProfile.userId,
            matchType: user.matchType,
          })),
          nonKairoUsers: nonKairoUsers.map((user) => ({
            contactName: user.contactName,
            phoneNumber: user.phoneNumber,
          })),
        },
      },
    });
  } catch (error) {
    console.error("Upload contacts error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  signup,
  verifyOTP,
  login,
  completeProfile,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  resendOTP,
  getUserById,
  uploadContacts,
};
