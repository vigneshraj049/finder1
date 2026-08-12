import { ApifyClient } from "apify-client";

const apifyToken = process.env.APIFY_API_TOKEN;

if (!apifyToken) {
  throw new Error("APIFY_API_TOKEN is not set in environment variables");
}

const client = new ApifyClient({
  token: apifyToken,
});

const INSTAGRAM_SCRAPER_ACTOR_ID = "apify/instagram-scraper";

interface ScrapeParams {
  hashtag: string;
  resultsLimit?: number;
}

export const runInstagramScraper = async ({
  hashtag,
  resultsLimit = 20,
}: ScrapeParams) => {
  try {
    const input = {
      directUrls: [`https://www.instagram.com/explore/tags/${hashtag}/`],
      resultsLimit: resultsLimit,
    };

    console.log("Starting Apify Instagram Scraper run:", input);

    const run = await client.actor(INSTAGRAM_SCRAPER_ACTOR_ID).call(input);

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    console.log(`Scraper finished. ${items.length} items fetched.`);

    return {
      success: true,
      runId: run.id,
      datasetId: run.defaultDatasetId,
      items,
    };
  } catch (error) {
    console.error("Error running Instagram scraper:", error);
    throw new Error("Instagram scraper failed to run");
  }
};