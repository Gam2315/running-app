import fs from "fs";
import path from "path";

export interface Route {
  id: string;
  distance: string;
  name: string;
  description: string;
}

const dataFilePath = path.join(process.cwd(), "data", "routes.json");

export function getRoutes(): Route[] {
  try {
    const fileContents = fs.readFileSync(dataFilePath, "utf8");
    return JSON.parse(fileContents) as Route[];
  } catch (error) {
    console.error("Error reading routes data:", error);
    return [];
  }
}

export function saveRoutes(routes: Route[]): void {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(routes, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing routes data:", error);
  }
}
