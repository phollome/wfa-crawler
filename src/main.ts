import OpenAI from "openai";

import { Dataset, PlaywrightCrawler } from "crawlee";
import dotenv from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

dotenv.config();

// let urlsFileContent: string;
// let urls: string[];

// try {
//   urlsFileContent = await readFile("urls.txt", "utf-8");
//   urls = urlsFileContent.split("\n");
// } catch (error) {
//   console.error("Error reading URLs", error);
//   process.exit(1);
// }

type Episode = {
  href: string;
  title: string;
  description: string;
  pubDate: string;
};

// const result: Episode[] = [];

// const crawler = new PlaywrightCrawler({
//   requestHandler: async (args) => {
//     const { page, request } = args;

//     console.log("Requesting", request.url);

//     const title = await page.getByRole("heading", { level: 1 }).innerText();
//     const description = await page.locator(".episode-show-notes").innerText();

//     const dateString = await page
//       .getByRole("time")
//       .locator("//span")
//       .getAttribute("data-timestamp");

//     if (dateString === null) {
//       throw new Error("Date string not found");
//     }

//     // Convert the timestamp to milliseconds
//     const timestamp = parseInt(dateString) * 1000;

//     const date = new Date(timestamp).toISOString();

//     result.push({
//       href: request.url,
//       title,
//       description,
//       pubDate: date,
//     });
//   },
// });

// await crawler.addRequests(urls);
// await crawler.run();

const datasetName = "episodes";

// const dataset = await Dataset.open(datasetName);
// await dataset.pushData({ data: result });

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
  title: z.string(),
  author: z.string(),
  publisher: z.string(),
  href: z.string().optional(),
});
const config = {
  model: "gpt-4o-mini",
  response_format: zodResponseFormat(referencesSchema, "reference"),
}


for (const episode of parsedContent.data) {
  const completions = await openai.beta.chat.completions.parse({...config, messages: [{
    role: "user",
    content: [{
      type: "text",
      text: `Extract bibliographic references out of following text and output only the references converted into the given structure": ${episode.description} If it's an online resource use domain as publisher. Output only the references.`
    }],
  }]})
  console.log(completions)
}

