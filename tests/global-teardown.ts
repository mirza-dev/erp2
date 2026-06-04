import fs from "fs";
import path from "path";

const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

export default async function globalTeardown() {
    // Remove saved auth state so the next run re-authenticates
    if (fs.existsSync(STORAGE_STATE)) {
        fs.unlinkSync(STORAGE_STATE);
    }
}
