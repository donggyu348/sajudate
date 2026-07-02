import http from "http";
import fs from "fs";
import path from "path";
const ROOT = path.resolve("public");
const TYPES = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".png":"image/png", ".jpg":"image/jpeg", ".gif":"image/gif", ".ico":"image/x-icon", ".svg":"image/svg+xml" };
http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split("?")[0]);
  if(p==="/") p="/_m_preview.html";
  const fp = path.join(ROOT, p);
  fs.readFile(fp,(e,data)=>{
    if(e){res.writeHead(404);res.end("404 "+p);return;}
    res.writeHead(200,{"Content-Type":TYPES[path.extname(fp)]||"application/octet-stream"});
    res.end(data);
  });
}).listen(4173,()=>console.log("static on 4173"));
