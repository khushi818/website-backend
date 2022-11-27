const admin = require("firebase-admin");
const firestore = require("../utils/firestore");
const badgeModel = firestore.collection("badges");
const userBadgeModel = firestore.collection("userBadges");
const { fetchUser } = require("../models/users");
const { convertFirebaseTimestampToDateTime } = require("../utils/badge");

/**
 * Fetches the data about our badges
 * @param query { Object }: Filter for badges data
 * @return {Promise<badgeModel|Array>}
 */
const fetchBadges = async ({ size = 100, page = 0 }) => {
  try {
    const snapshot = await badgeModel
      .limit(parseInt(size))
      .offset(parseInt(size) * parseInt(page))
      .get();
    // INFO: timestamp to date time logic surfaced fro
    // https://stackoverflow.com/a/66292255
    return snapshot.docs.map((doc) => {
      const id = doc.id;
      const { createdAt, createdBy, name, description, imageUrl } = doc.data();
      const { date, time } = convertFirebaseTimestampToDateTime(createdAt);
      return {
        id,
        name,
        description,
        imageUrl,
        createdBy,
        createdAt: {
          date,
          time,
        },
      };
    });
  } catch (err) {
    logger.error("Error retrieving badges", err);
    return err;
  }
};

/**
 * Fetches the data about user badges
 * @param query { string }: Filter for badgeIds
 * @return {Promise<userBadgeModel|Array>}
 */
const fetchUserBadgeIds = async (username) => {
  try {
    let badgeIds = [];
    let userExists = false;
    const result = await fetchUser({ username });
    if (result.userExists) {
      userExists = true;
      const userId = result.user.id;
      const snapshot = await userBadgeModel.where("userId", "==", userId).get();
      badgeIds = snapshot.docs.map((doc) => doc.get("badgeId"));
    }
    return { userExists, badgeIds };
  } catch (err) {
    logger.error("Error retrieving user badges", err);
    return err;
  }
};

/**
 * Add badge to firestore
 * @param  { Object }: badge name, to be stored in DB
 * @return {Promise<{id: string, createdAt: {date: string, time: string}}|Object>}
 */
async function createBadge({ name, description, imageUrl, createdBy }) {
  try {
    const createdAt = admin.firestore.Timestamp.now();
    const docRef = await badgeModel.add({
      name,
      description,
      imageUrl,
      createdBy,
      createdAt,
    });
    const { date, time } = convertFirebaseTimestampToDateTime(createdAt);
    return { id: docRef.id, createdAt: { date, time } };
  } catch (err) {
    logger.error("Error creating badge", err);
    return err;
  }
}

/**
 * assign badges to user
 * @param { Object }: userId: string and badgeIds: Array<string>
 * @return {Promise<{docIds: Array<string>}|Object>}
 */
async function assignBadges({ userId, badgeIds }) {
  try {
    const docIds = [];
    const batch = firestore.batch();
    badgeIds.forEach((badgeId) => {
      const ref = userBadgeModel.doc();
      const id = ref.id;
      batch.create(ref, { userId, badgeId });
      docIds.push(id);
    });
    await batch.commit();
    return { docIds };
  } catch (err) {
    logger.error("Error assigning badges", err);
    return err;
  }
}

/**
 * unassign badges from user
 * @param { Object }: userId: string and badgeIds: Array<string>
 * @return {Promise<{docIds: Array<string>}|Object>}
 */
async function unAssignBadges({ userId, badgeIds }) {
  try {
    const docIds = [];
    const snapshot = await userBadgeModel.where("userId", "==", userId).where("badgeId", "in", badgeIds).get();
    const batch = firestore.batch();
    snapshot.forEach((doc) => {
      docIds.push(doc.id);
      batch.delete(doc.ref);
    });
    await batch.commit();
    return { docIds };
  } catch (err) {
    logger.error("Error un-assigning badges", err);
    return err;
  }
}

module.exports = {
  fetchBadges,
  fetchUserBadgeIds,
  createBadge,
  assignBadges,
  unAssignBadges,
};
