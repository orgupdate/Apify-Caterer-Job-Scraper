// main.js
const { Actor } = require("apify");
const { default: axios } = require("axios");

Actor.main(async () => {
  try {
    const input = await Actor.getInput();
    // console.log("Received input:", input);

    // 1. SECURE TIER CHECK (The Fix)
    // We check the Apify environment variable, NOT the user's easily-manipulated input.
    const { userIsPaying } = Actor.getEnv();
    const isFreeUser = !userIsPaying;
    const FREE_LIMIT = 10;

    // console.log(
    //   `[Status] Apify userIsPaying: ${userIsPaying}. isFreeUser flag set to: ${isFreeUser}`,
    // );

    // 2. Generate Cache Key
    const rawSearchTerm = `${input.includeKeyword || input.keyword || "all"}-${input.countryName || input.targetLocations?.[0] || "anywhere"}`;
    const baseKey = rawSearchTerm.toLowerCase().replace(/[^a-z0-9-]/g, "_");
    const cacheKey = isFreeUser ? `${baseKey}_free` : `${baseKey}_paid`;

    // console.log(`🔍 Checking Apify Key-Value Store for: ${cacheKey}`);
    const store = await Actor.openKeyValueStore();
    const cachedData = await store.getValue(cacheKey);

    let jobs = [];

    // 3. CACHE HIT: Use saved data
    if (cachedData) {
      // console.log("✅ Cache Hit! Skipping API call to save SerpApi credits.");
      jobs = cachedData;
    }
    // 4. CACHE MISS: Call your external API
    else {
      // console.log("⚠️ Cache Miss. Making live call to backend API...");

      // Send the secure flag to your backend so the API knows to apply the "SerpApi Brakes"
      const res = await axios.post("https://api.orgupdate.com/search-jobs-v1", {
        ...input,
        isFreeUser: isFreeUser, // 👈 Injected by the Actor, not the user
        source: "caterer.com jobs",
      });

      jobs = res.data || [];

      // Save the fresh results to the Apify cache
      // console.log(
      //   `💾 Saving ${jobs.length} results to Apify cache under: ${cacheKey}`,
      // );
      await store.setValue(cacheKey, jobs);
    }

    // 5. Final Safety Net: Strictly limit free users to 10 results
    if (isFreeUser && jobs.length > FREE_LIMIT) {
      jobs = jobs.slice(0, FREE_LIMIT);
      // console.log(
      //   `✂️ Free tier limits applied. Returning ${FREE_LIMIT} results.`,
      // );
    }

    // 6. Push to Apify Dataset
    await Actor.pushData(jobs);
    // console.log(`✅ Run Complete. Saved ${jobs.length || 0} jobs to dataset.`);
  } catch (err) {
    console.error("❌ Job search failed:", err.message);
    throw err;
  }
});
