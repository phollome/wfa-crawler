import OpenAI from "openai";

import { Dataset, PlaywrightCrawler } from "crawlee";
import dotenv from "dotenv";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

dotenv.config();

let urlsFileContent: string;
let urls: string[];

try {
  urlsFileContent = await readFile("urls.txt", "utf-8");
  urls = urlsFileContent.split("\n");
} catch (error) {
  console.error("Error reading URLs", error);
  process.exit(1);
}

type Episode = {
  href: string;
  title: string;
  description: string;
  pubDate: string;
};

const result: Episode[] = [];

const crawler = new PlaywrightCrawler({
  requestHandler: async (args) => {
    const { page, request } = args;

    console.log("Requesting", request.url);

    const title = await page.getByRole("heading", { level: 1 }).innerText();
    const description = await page.locator(".episode-show-notes").innerText();

    const dateString = await page
      .getByRole("time")
      .locator("//span")
      .getAttribute("data-timestamp");

    if (dateString === null) {
      throw new Error("Date string not found");
    }

    // Convert the timestamp to milliseconds
    const timestamp = parseInt(dateString) * 1000;

    const date = new Date(timestamp).toISOString();

    result.push({
      href: request.url,
      title,
      description,
      pubDate: date,
    });
  },
});

await crawler.addRequests(urls);
await crawler.run();

const datasetName = "episodes";

const dataset = await Dataset.open(datasetName);
await dataset.pushData({ data: result });

const datasetFiles = await readdir(`./storage/datasets/${datasetName}`);
if (datasetFiles.length === 0) {
  console.error("No data found in the dataset");
  process.exit(1);
}

const file = datasetFiles[datasetFiles.length - 1];
const content = await readFile(
  `./storage/datasets/${datasetName}/${file}`,
  "utf-8"
);
const parsedContent = JSON.parse(content) as { data: Episode[] };

const openai = new OpenAI();

const referencesSchema = z.object({
  references: z.array(
    z.object({
      title: z.string(),
      author: z.string(),
      publisher: z.string(),
      href: z.string().optional(),
    })
  ),
});
const config = {
  model: "gpt-4o-mini",
  response_format: zodResponseFormat(referencesSchema, "reference"),
};

const episodes: {
  href: string;
  title: string;
  pubDate: string;
  references: z.infer<typeof referencesSchema>["references"];
}[] = [];

for (const episodeData of parsedContent.data) {
  console.log("Processing episode", episodeData.href);

  const completions = await openai.beta.chat.completions.parse({
    ...config,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract bibliographic references. Output only the references converted into the given structure. ${episodeData.description} On online resource use domain of resource as publisher.`,
          },
        ],
      },
    ],
  });

  const episode = {
    title: episodeData.title,
    href: episodeData.href,
    pubDate: episodeData.pubDate,
    references: [] as z.infer<typeof referencesSchema>["references"],
  };

  if (completions.choices[0].message.parsed !== null) {
    episode.references.push(
      ...completions.choices[0].message.parsed.references
    );
  } else {
    console.error(`Error parsing completions on episode ${episodeData.href}`);
  }

  episodes.push(episode);
}

console.log("Writing episodes to file");

await writeFile("./episodes.json", JSON.stringify(episodes, null, 2), "utf-8");
