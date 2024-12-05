import { PlaywrightCrawler, Dataset } from "crawlee";
import { readFile } from "node:fs/promises";

let urlsFileContent: string;
let urls: string[];

try {
  urlsFileContent = await readFile("urls.txt", "utf-8");
  urls = urlsFileContent.split("\n");
} catch (error) {
  console.error("Error reading URLs", error);
  process.exit(1);
}

const result: {
  href: string;
  title: string;
  description: string;
  pubDate: string;
}[] = [];

const crawler = new PlaywrightCrawler({
  requestHandler: async (args) => {
    const { page, request } = args;

    console.log("Requesting", request.url);

    const title = await page.getByRole("heading", { level: 1 }).innerText();
    const description = await page.locator(".episode-show-notes").innerText();

    const dateString = await page.getByRole("time").locator("//span").getAttribute("data-timestamp");

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

const dataset = await Dataset.open("episodes");
await dataset.pushData({ data: result });
