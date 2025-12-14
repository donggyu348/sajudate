import { listen } from "./framework/web/jujangso.js";

listen(process.env.WEB_PORT || 3000);

process.on("uncaughtException", (error) => {
    console.log(error);
    process.exit(1);
});
