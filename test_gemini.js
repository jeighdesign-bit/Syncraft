require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image" });

async function test() {
  console.log("Starting with image...");
  try {
    // 1x1 pixel PNG
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY3i/fv1/BhhgYQABBgB5XwNDu6N+0gAAAABJRU5ErkJggg==";
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Extract pattern" }, { inlineData: { data: base64, mimeType: "image/png" } }] }]
    });
    console.log("Result:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
  console.log("Done.");
}
test();
