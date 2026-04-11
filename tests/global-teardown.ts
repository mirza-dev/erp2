import fs from "fs";
import { STORAGE_STATE } from "../playwright.config";

export default async function globalTeardown() {
    // Remove saved auth state so the next run re-authenticates
    if (fs.existsSync(STORAGE_STATE)) {
        fs.unlinkSync(STORAGE_STATE);
    }
}
