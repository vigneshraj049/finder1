import pool from "./src/config/database";

async function run() {
  console.log("Cleaning up orphaned duplicated properties...");
  try {
    const res = await pool.query(`
      DELETE FROM properties 
      WHERE id NOT IN (SELECT property_id FROM social_contents)
    `);
    console.log(`Successfully deleted ${res.rowCount} duplicated properties with no media!`);
  } catch (error) {
    console.error("Error during cleanup:", error);
  } finally {
    process.exit(0);
  }
}
run();
