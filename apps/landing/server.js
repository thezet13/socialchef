const express = require("express");
const path = require("path");

const app = express();

// статика (если захочешь css/img)
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html>
    <head><meta charset="utf-8"/><title>SocialChef</title></head>
    <body style="font-family:system-ui;padding:40px;max-width:720px;margin:0 auto;">
      <h1>SocialChef</h1>
      <p>Landing (Node.js)</p>
      <p><a href="https://app.socialchef.net">Open app</a></p>
      <p><a href="/ru">RU</a> | <a href="/az">AZ</a> | <a href="/en">EN</a></p>
    </body>
    </html>
  `);
});

app.get("/:lang(ru|az|en)", (req, res) => {
  const { lang } = req.params;
  res.type("html").send(`
    <!doctype html>
    <html>
    <head><meta charset="utf-8"/><title>SocialChef — ${lang.toUpperCase()}</title></head>
    <body style="font-family:system-ui;padding:40px;max-width:720px;margin:0 auto;">
      <h1>SocialChef (${lang.toUpperCase()})</h1>
      <p>Simple landing content for ${lang}.</p>
      <p><a href="https://app.socialchef.net">Open app</a></p>
      <p><a href="/">Back</a></p>
    </body>
    </html>
  `);
});

const port = process.env.PORT || 3100;
app.listen(port, "0.0.0.0", () => console.log("Landing listening on", port));