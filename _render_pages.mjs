import ejs from "ejs";
import fs from "fs";
import { pickReunionKeywords } from "./src/framework/web/utils/reunionKeywords.js";
import { buildManse } from "./src/framework/web/utils/manseView.js";

const meta = { metaPageViewEventId: "x", metaAdvancedMatching: {} };
const b = { name: "홍길동", partnerName: "성춘향", gender: "남자", birthdate: "20020202", birthType: "양력", birthTime: "01:30",
  partnerGender: "여자", partnerBirthdate: "20031128", partnerBirthType: "양력", partnerBirthTime: "13:12",
  relationStatus: "닫힌 문", breakupReason: "성격 차이와 잦은 다툼", breakupInitiator: "상대방이 먼저" };

const V = "src/framework/web/views/tight/saju/reunion/";
async function r(file, data, out) {
  const html = await ejs.renderFile(V + file, { ...meta, ...data });
  fs.writeFileSync("public/" + out, html);
  console.log("wrote", out, html.length);
}
await r("input.ejs", {}, "_m_input.html");
await r("intro.ejs", {}, "_m_intro.html");
await r("loading.ejs", { form: b, name: b.name }, "_m_loading.html");
await r("ready.ejs", { form: b, name: b.name }, "_m_ready.html");
await r("preview.ejs", {
  form: b, name: b.name,
  meManse: buildManse({ birthdate: b.birthdate, birthType: b.birthType, birthTime: b.birthTime, gender: b.gender }),
  youManse: buildManse({ birthdate: b.partnerBirthdate, birthType: b.partnerBirthType, birthTime: b.partnerBirthTime, gender: b.partnerGender }),
  keywords: pickReunionKeywords(b),
}, "_m_preview.html");
console.log("done");
