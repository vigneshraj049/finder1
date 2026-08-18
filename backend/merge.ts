import pool from "./src/config/database";

async function run() {
  console.log("Merging duplicated properties that have media...");
  try {
    // Find properties that share the same business_id and property_title
    const duplicates = await pool.query(`
      SELECT business_id, property_title, array_agg(id ORDER BY id ASC) as ids
      FROM properties
      GROUP BY business_id, property_title
      HAVING COUNT(*) > 1
    `);

    let mergedCount = 0;

    for (const row of duplicates.rows) {
      const ids = row.ids as number[];
      if (ids.length <= 1) continue;

      const keepId = ids[0]; // keep the first one
      const deleteIds = ids.slice(1);

      // Move all social contents to the keepId
      await pool.query(`
        UPDATE social_contents
        SET property_id = $1
        WHERE property_id = ANY($2)
      `, [keepId, deleteIds]);

      // Delete the duplicate properties
      await pool.query(`
        DELETE FROM properties
        WHERE id = ANY($1)
      `, [deleteIds]);

      mergedCount += deleteIds.length;
      console.log(`Merged ${deleteIds.length} duplicates for "${row.property_title}" into property ${keepId}`);
    }

    console.log(`Successfully merged and removed ${mergedCount} duplicate properties!`);
  } catch (error) {
    console.error("Error during merge:", error);
  } finally {
    process.exit(0);
  }
}
run();
