import { ApifyClient } from "apify-client";

const apifyToken = process.env.APIFY_API_TOKEN;

if (!apifyToken) {
  throw new Error("APIFY_API_TOKEN is not set in environment variables");
}

const client = new ApifyClient({
  token: apifyToken,
});

const INSTAGRAM_SCRAPER_ACTOR_ID = "apify/instagram-scraper";
const INSTAGRAM_REEL_ACTOR_ID = process.env.APIFY_REEL_ACTOR_ID;

interface ScrapeParams {
  hashtag: string;
  resultsLimit?: number;
}

interface ReelScrapeParams {
  query: string;
  resultsLimit?: number;
}

export const runInstagramScraper = async ({
  hashtag,
  resultsLimit = 20,
}: ScrapeParams) => {
  try {
    const input = {
      directUrls: [`https://www.instagram.com/explore/tags/${hashtag}/`],
      resultsLimit,
    };

    console.log("Starting Apify Instagram Scraper run:", input);

    const run = await client.actor(INSTAGRAM_SCRAPER_ACTOR_ID).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`Post scraper finished. ${items.length} items fetched.`);

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

export const runReelScraper = async ({
  query,
  resultsLimit = 20,
}: ReelScrapeParams) => {
  try {
    const cleanQuery = (query || "").trim();

    if (!cleanQuery) {
      return {
        success: true,
        items: [],
      };
    }

    // Use the same reliable instagram-scraper actor but with reels/video filter
    const input = {
      directUrls: [`https://www.instagram.com/explore/tags/${cleanQuery.replace(/^#/, "")}/`],
      resultsLimit,
      resultsType: "reels",
    };

    console.log(`Starting Apify Reel Scraper (apify/instagram-scraper with resultsType=reels):`, input);

    const run = await client.actor(INSTAGRAM_SCRAPER_ACTOR_ID).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    // Only keep video/reel items
    const reelItems = items.filter((item: any) => {
      const type = String(item?.type || item?.productType || "").toLowerCase();
      return (
        type.includes("video") ||
        type.includes("clip") ||
        type.includes("reel") ||
        !!item?.videoUrl ||
        !!item?.video_url ||
        (item?.url && item.url.includes("/reel/"))
      );
    });

    console.log(`Reel scraper finished. ${items.length} total items, ${reelItems.length} are reels/videos.`);

    return {
      success: true,
      runId: run.id,
      datasetId: run.defaultDatasetId,
      items: reelItems,
    };
  } catch (error) {
    console.warn("Instagram reel scraper encountered an issue, proceeding gracefully:", error);
    return {
      success: true,
      items: [],
    };
  }
};