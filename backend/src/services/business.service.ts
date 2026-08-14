import pool from "../config/database";

interface BusinessInfo {
  instagramUsername: string;
  instagramPageId: string | null;
  instagramProfileUrl: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

// Finds existing business by instagram_username, or creates a new one.
// Updates phone/email/address if they were previously missing.
export const findOrCreateBusiness = async (
  info: BusinessInfo
): Promise<number> => {
  const normalizedUsername = (info.instagramUsername || "unknown").trim() || "unknown";
  const normalizedBusinessName =
    (info.businessName || info.instagramUsername || "Instagram Business").trim() || "Instagram Business";

  // 1. Check if business already exists
  const existing = await pool.query(
    `SELECT id, phone, email, address FROM businesses WHERE instagram_username = $1`,
    [normalizedUsername]
  );

  if (existing.rows.length > 0) {
    const business = existing.rows[0];

    // Fill in missing info if we now have it (don't overwrite existing data)
    const updatedPhone = business.phone || info.phone;
    const updatedEmail = business.email || info.email;
    const updatedAddress = business.address || info.address;

    if (
      updatedPhone !== business.phone ||
      updatedEmail !== business.email ||
      updatedAddress !== business.address
    ) {
      await pool.query(
        `UPDATE businesses 
         SET phone = $1, email = $2, address = $3, updated_at = NOW()
         WHERE id = $4`,
        [updatedPhone, updatedEmail, updatedAddress, business.id]
      );
    }

    return business.id;
  }

  // 2. Create new business
  const result = await pool.query(
    `INSERT INTO businesses 
     (business_name, phone, email, address, instagram_username, instagram_page_id, instagram_profile_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      normalizedBusinessName,
      info.phone,
      info.email,
      info.address,
      normalizedUsername,
      info.instagramPageId,
      info.instagramProfileUrl,
    ]
  );

  return result.rows[0].id;
};